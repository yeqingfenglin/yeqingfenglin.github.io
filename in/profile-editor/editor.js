(function () {
  'use strict';

  const config = window.SITE_SUPABASE_CONFIG || {};
  const contentConfig = window.SITE_CONTENT_CONFIG || {};
  const editorAssignments = new Map([['lena', 'wangboning'], ['叶清枫林', 'dengjie']]);
  const defaults = {
    dengjie: { profileId: 'dengjie', displayName: 'Jie Deng', initials: 'JD' },
    wangboning: { profileId: 'wangboning', displayName: 'Boning Wang', initials: 'BW' }
  };
  let client = null;
  let profileId = '';
  let savedProfile = null;
  let storedFiles = [];
  let pendingFiles = [];

  function normalizeUsername(value) { return String(value || '').normalize('NFKC').trim().toLowerCase(); }
  function escapeHtml(value) { return String(value || '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[character])); }
  function safeFileName(name) {
    const clean = String(name || 'file').normalize('NFKC').replace(/[\\/:*?#"<>|\u0000-\u001f]/g, '-').replace(/\s+/g, '-').replace(/-+/g, '-').slice(0, 120);
    return clean || `file-${Date.now()}`;
  }
  function setStatus(message, isError) {
    const target = document.getElementById('save-status');
    target.textContent = message;
    target.style.color = isError ? '#8a1010' : '#0b2545';
  }

  async function gateway(action, payload) {
    const { data: sessionData, error: sessionError } = await client.auth.getSession();
    if (sessionError || !sessionData.session?.access_token) throw new Error('登录已失效，请重新登录。');
    const { data, error } = await client.functions.invoke(contentConfig.gatewayFunction || 'cos-content', {
      body: { action, ...(payload || {}) },
      headers: { Authorization: `Bearer ${sessionData.session.access_token}` }
    });
    if (error) {
      let message = error.message || '内容服务请求失败';
      try { const detail = await error.context?.json(); if (detail?.error) message = detail.error; } catch (_) {}
      throw new Error(message);
    }
    if (data?.error) throw new Error(data.error);
    return data || {};
  }

  function defaultProfile(id) {
    return {
      schemaVersion: 1,
      ...defaults[id],
      title: 'Academic title and affiliation to be added',
      location: 'Location to be added',
      email: 'Email to be added',
      linksHtml: 'Academic links to be added',
      aboutHeading: `About ${defaults[id].displayName}`,
      researchHeading: 'Research Interests',
      publicationsHeading: 'Selected Publications',
      educationHeading: 'Education',
      documentsHeading: 'Documents',
      aboutHtml: '<p>A concise academic biography will appear here, including current work, academic background, research interests, and opportunities for collaboration.</p>',
      researchHtml: '<p>Research areas, current questions, methods, and ongoing projects will be listed here.</p>',
      publicationsHtml: '<li class="academic-item"><span class="academic-year">Paper</span><div><h3>Publication title to be added</h3><p>Authors, journal or conference, year, abstract, PDF, and related links.</p></div></li>',
      educationHtml: '<li class="academic-item"><span class="academic-year">Year</span><div><h3>Institution to be added</h3><p>Degree, field of study, or academic position.</p></div></li>',
      files: []
    };
  }

  function applyProfile(profile) {
    const merged = { ...defaultProfile(profileId), ...(profile || {}) };
    savedProfile = structuredClone(merged);
    storedFiles = Array.isArray(merged.files) ? structuredClone(merged.files) : [];
    pendingFiles = [];
    document.querySelectorAll('[data-field]').forEach(element => {
      const field = element.dataset.field;
      const value = merged[field] || '';
      if (field.endsWith('Html')) element.innerHTML = value;
      else element.textContent = value;
    });
    document.querySelector('.portrait-placeholder').textContent = merged.initials || defaults[profileId].initials;
    document.getElementById('editor-brand').textContent = `修改 ${merged.displayName || defaults[profileId].displayName} 的主页`;
    document.getElementById('preview-link').href = `/out/${profileId}/`;
    renderFiles();
    setStatus('当前显示的是 COS 中已保存的内容', false);
  }

  function renderFiles() {
    const list = document.getElementById('editor-files');
    list.innerHTML = '';
    const allFiles = [
      ...storedFiles.map((file, index) => ({ ...file, source: 'stored', index })),
      ...pendingFiles.map((file, index) => ({ name: file.name, size: file.size, contentType: file.type, source: 'pending', index }))
    ];
    if (!allFiles.length) {
      const empty = document.createElement('li');
      empty.className = 'editor-file-meta';
      empty.textContent = '尚未添加文件。';
      list.appendChild(empty);
      return;
    }
    allFiles.forEach(file => {
      const item = document.createElement('li');
      item.className = 'editor-file-item';
      item.innerHTML = `<div><strong>${escapeHtml(file.name)}</strong><div class="editor-file-meta">${file.source === 'pending' ? '等待上传 · ' : '已保存在 COS · '}${((Number(file.size) || 0) / 1024 / 1024).toFixed(2)} MB</div></div>`;
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'remove-file';
      remove.textContent = '从主页移除';
      remove.addEventListener('click', () => {
        if (file.source === 'pending') pendingFiles.splice(file.index, 1);
        else storedFiles.splice(file.index, 1);
        renderFiles();
        setStatus('有尚未保存的修改', false);
      });
      item.appendChild(remove);
      list.appendChild(item);
    });
  }

  function collectProfile() {
    const profile = { ...savedProfile, schemaVersion: 1, profileId, files: storedFiles };
    document.querySelectorAll('[data-field]').forEach(element => {
      const field = element.dataset.field;
      profile[field] = field.endsWith('Html') ? element.innerHTML.trim() : element.textContent.trim();
    });
    profile.displayName = document.querySelector('[data-field="displayName"]').textContent.trim();
    profile.initials = savedProfile?.initials || defaults[profileId].initials;
    return profile;
  }

  async function uploadPendingFiles() {
    if (!pendingFiles.length) return;
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const objects = pendingFiles.map((file, index) => ({
      key: `profiles/${profileId}/files/${timestamp}-${index + 1}-${safeFileName(file.name)}`,
      size: file.size,
      contentType: file.type || 'application/octet-stream'
    }));
    const { items = [] } = await gateway('get-profile-upload-urls', { profileId, objects });
    const byKey = new Map(items.map(item => [item.key, item]));
    for (let index = 0; index < pendingFiles.length; index += 1) {
      const file = pendingFiles[index];
      const object = objects[index];
      const upload = byKey.get(object.key);
      if (!upload?.url) throw new Error(`无法取得 ${file.name} 的上传地址。`);
      setStatus(`正在上传 ${index + 1}/${pendingFiles.length}：${file.name}`, false);
      const response = await fetch(upload.url, { method: 'PUT', headers: { 'Content-Type': upload.contentType }, body: file });
      if (!response.ok) throw new Error(`${file.name} 上传失败：${response.status}`);
      storedFiles.push({ name: file.name, key: object.key, size: file.size, contentType: object.contentType, addedAt: new Date().toISOString() });
    }
    pendingFiles = [];
  }

  document.querySelectorAll('[data-command]').forEach(button => button.addEventListener('mousedown', event => {
    event.preventDefault();
    document.execCommand(button.dataset.command, false);
  }));
  document.getElementById('add-link-button').addEventListener('mousedown', event => {
    event.preventDefault();
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) return alert('请先选中需要添加链接的文字。');
    const url = prompt('请输入完整网址（以 https:// 开头）或邮箱链接（mailto:）：');
    if (!url) return;
    if (!/^(https?:\/\/|mailto:)/i.test(url.trim())) return alert('链接必须以 https://、http:// 或 mailto: 开头。');
    document.execCommand('createLink', false, url.trim());
  });
  document.getElementById('profile-files-input').addEventListener('change', event => {
    const files = Array.from(event.target.files || []);
    if (files.some(file => file.size > 25 * 1024 * 1024)) {
      alert('单个文件不能超过 25 MB。');
      event.target.value = '';
      return;
    }
    pendingFiles.push(...files);
    event.target.value = '';
    renderFiles();
    setStatus('有尚未保存的文件', false);
  });
  document.getElementById('editor-main').addEventListener('input', () => setStatus('有尚未保存的修改', false));
  document.getElementById('restore-button').addEventListener('click', () => {
    if (!savedProfile || !confirm('恢复为最近一次已保存的内容？本次尚未保存的文字和待上传文件将被放弃。')) return;
    applyProfile(savedProfile);
  });
  document.getElementById('save-button').addEventListener('click', async () => {
    const saveButton = document.getElementById('save-button');
    const restoreButton = document.getElementById('restore-button');
    saveButton.disabled = true;
    restoreButton.disabled = true;
    try {
      await uploadPendingFiles();
      const profile = collectProfile();
      const { profile: saved } = await gateway('put-profile', { profileId, profile });
      applyProfile(saved || profile);
      setStatus('修改已保存到 COS，公开主页刷新后即可看到', false);
    } catch (error) {
      console.error(error);
      setStatus(`保存失败：${error.message}`, true);
    } finally {
      saveButton.disabled = false;
      restoreButton.disabled = false;
    }
  });

  async function init() {
    try {
      if (!window.supabase?.createClient || !config.url || !config.publishableKey) throw new Error('Supabase 配置不完整。');
      client = window.supabase.createClient(String(config.url).replace(/\/$/, ''), config.publishableKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } });
      const { data: sessionData, error: sessionError } = await client.auth.getSession();
      if (sessionError || !sessionData.session?.user) {
        window.location.replace('/login/?returnTo=%2Fin%2Fprofile-editor%2F');
        return;
      }
      const { data: profile, error: profileError } = await client.from('profiles').select('username, role, status').eq('id', sessionData.session.user.id).single();
      if (profileError || !profile || profile.role !== 'admin' || profile.status !== 'approved') throw new Error('只有获准的管理员可以修改个人主页。');
      profileId = editorAssignments.get(normalizeUsername(profile.username)) || '';
      if (!profileId) throw new Error('当前管理员没有被分配个人主页编辑权限。');
      const result = await gateway('get-profile-editor', { profileId });
      applyProfile(result.profile || defaultProfile(profileId));
      document.getElementById('editor-loading').hidden = true;
      document.getElementById('editor-main').hidden = false;
      document.getElementById('save-bar').hidden = false;
    } catch (error) {
      document.getElementById('editor-loading').hidden = true;
      const target = document.getElementById('editor-error');
      target.textContent = error.message;
      target.hidden = false;
    }
  }

  init();
})();
