(function () {
  'use strict';

  const config = window.SITE_SUPABASE_CONFIG || {};
  const contentConfig = window.SITE_CONTENT_CONFIG || {};
  const editorAssignments = new Map([['lena11', 'wangboning'], ['叶清枫林', 'dengjie']]);
  const defaults = {
    dengjie: { profileId: 'dengjie', displayName: 'Jie Deng', initials: 'JD' },
    wangboning: { profileId: 'wangboning', displayName: 'Boning Wang', initials: 'BW' }
  };
  let client = null;
  let profileId = '';
  let savedProfile = null;
  let storedAvatar = null;
  let pendingAvatarFile = null;
  let avatarPreviewUrl = '';
  let storedFiles = [];
  let pendingFiles = [];
  let savedFormatRange = null;
  let fileUploadBusy = false;

  function downloadLink(file) {
    const url = new URL('/out/download/', window.location.origin);
    url.searchParams.set('profile', profileId);
    url.searchParams.set('key', file.key);
    return url.href;
  }

  function updateLinkFiles() {
    const select = document.getElementById('link-file-select');
    select.replaceChildren(new Option('选择已上传文件', ''));
    storedFiles.forEach(file => select.add(new Option(file.name, downloadLink(file))));
  }

  function normalizeUsername(value) { return String(value || '').normalize('NFKC').trim().toLowerCase(); }
  function escapeHtml(value) { return String(value || '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[character])); }
  function safeFileName(name) {
    const clean = String(name || 'file').normalize('NFKC').replace(/[\\/:*?#"<>|\u0000-\u001f]/g, '-').replace(/\s+/g, '-').replace(/-+/g, '-').slice(0, 120);
    return clean || `file-${Date.now()}`;
  }
  function safeAvatarFileName(file) {
    const extension = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[file.type];
    const baseName = String(file.name || 'profile-photo').replace(/\.[^.]+$/, '');
    return `${safeFileName(baseName)}.${extension}`;
  }
  function setStatus(message, isError) {
    const target = document.getElementById('save-status');
    target.textContent = message;
    target.style.color = isError ? 'var(--danger)' : 'var(--accent)';
  }

  function rememberFormatSelection() {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount !== 1 || selection.isCollapsed) return;
    const range = selection.getRangeAt(0);
    const node = range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
      ? range.commonAncestorContainer
      : range.commonAncestorContainer.parentElement;
    if (node?.closest?.('.editable-text, .editable-rich')) savedFormatRange = range.cloneRange();
  }

  function restoreFormatSelection() {
    if (!savedFormatRange) {
      alert('请先选中需要修改格式的文字。');
      return false;
    }
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(savedFormatRange);
    return true;
  }

  function applyFormat(command, value) {
    if (!restoreFormatSelection()) return false;
    document.execCommand(command, false, value);
    rememberFormatSelection();
    setStatus('有尚未保存的文字格式修改', false);
    return true;
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
      avatar: null,
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
    savedFormatRange = null;
    const merged = { ...defaultProfile(profileId), ...(profile || {}) };
    releaseAvatarPreview();
    savedProfile = structuredClone(merged);
    storedAvatar = merged.avatar && typeof merged.avatar === 'object' ? structuredClone(merged.avatar) : null;
    pendingAvatarFile = null;
    storedFiles = Array.isArray(merged.files) ? structuredClone(merged.files) : [];
    pendingFiles = [];
    document.querySelectorAll('[data-field]').forEach(element => {
      const field = element.dataset.field;
      const value = merged[field] || '';
      if (field.endsWith('Html')) element.innerHTML = value;
      else element.textContent = value;
    });
    renderAvatar();
    document.getElementById('editor-brand').textContent = `修改 ${merged.displayName || defaults[profileId].displayName} 的主页`;
    document.getElementById('preview-link').href = `/out/${profileId}/`;
    renderFiles();
    setStatus('当前显示的是 COS 中已保存的内容', false);
  }

  function releaseAvatarPreview() {
    if (avatarPreviewUrl) URL.revokeObjectURL(avatarPreviewUrl);
    avatarPreviewUrl = '';
  }

  function renderAvatar() {
    const picker = document.getElementById('avatar-picker-button');
    const initials = document.getElementById('avatar-initials');
    const preview = document.getElementById('avatar-preview');
    const pickerLabel = document.getElementById('avatar-picker-label');
    const removeButton = document.getElementById('remove-avatar-button');
    const imageUrl = avatarPreviewUrl || String(storedAvatar?.url || '');
    initials.textContent = savedProfile?.initials || defaults[profileId].initials;
    if (imageUrl) {
      preview.src = imageUrl;
      preview.alt = `${savedProfile?.displayName || defaults[profileId].displayName} 的头像预览`;
      preview.hidden = false;
      initials.hidden = true;
      pickerLabel.textContent = '更换照片';
      picker.setAttribute('aria-label', '更换头像照片');
      removeButton.hidden = false;
    } else {
      preview.removeAttribute('src');
      preview.alt = '';
      preview.hidden = true;
      initials.hidden = false;
      pickerLabel.textContent = '选择照片';
      picker.setAttribute('aria-label', '选择头像照片');
      removeButton.hidden = true;
    }
  }

  function renderFiles() {
    updateLinkFiles();
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
      remove.textContent = '移除文件链接';
      remove.addEventListener('click', () => {
        if (fileUploadBusy) return;
        if (file.source === 'stored' && !confirm('移除并保存后，正文或其他地方已使用的这个下载链接也将失效。继续？')) return;
        if (file.source === 'pending') pendingFiles.splice(file.index, 1);
        else storedFiles.splice(file.index, 1);
        renderFiles();
        setStatus('有尚未保存的修改', false);
      });
      if (file.source === 'stored') {
        const copy = document.createElement('button');
        copy.type = 'button';
        copy.className = 'file-picker';
        copy.textContent = '复制下载链接';
        copy.addEventListener('click', async () => {
          const url = downloadLink(file);
          try { await navigator.clipboard.writeText(url); setStatus('下载链接已复制；新上传的文件需保存修改后生效', false); }
          catch (_) { prompt('复制下载链接（新文件需保存修改后生效）：', url); }
        });
        item.appendChild(copy);
      }
      item.appendChild(remove);
      list.appendChild(item);
    });
  }

  function collectProfile() {
    const profile = { ...savedProfile, schemaVersion: 1, profileId, avatar: storedAvatar, files: storedFiles };
    document.querySelectorAll('[data-field]').forEach(element => {
      const field = element.dataset.field;
      profile[field] = field.endsWith('Html') ? element.innerHTML.trim() : element.textContent.trim();
    });
    profile.displayName = document.querySelector('[data-field="displayName"]').textContent.trim();
    profile.initials = savedProfile?.initials || defaults[profileId].initials;
    return profile;
  }

  async function uploadPendingAvatar() {
    if (!pendingAvatarFile) return;
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const object = {
      key: `profiles/${profileId}/avatar/${timestamp}-${safeAvatarFileName(pendingAvatarFile)}`,
      size: pendingAvatarFile.size,
      contentType: pendingAvatarFile.type
    };
    const { item } = await gateway('get-profile-avatar-upload-url', { profileId, object });
    if (!item?.url) throw new Error('无法取得头像上传地址。');
    setStatus(`正在上传头像：${pendingAvatarFile.name}`, false);
    const response = await fetch(item.url, { method: 'PUT', headers: { 'Content-Type': item.contentType }, body: pendingAvatarFile });
    if (!response.ok) throw new Error(`头像上传失败：${response.status}`);
    storedAvatar = {
      name: pendingAvatarFile.name,
      key: object.key,
      size: pendingAvatarFile.size,
      contentType: object.contentType,
      addedAt: new Date().toISOString()
    };
    pendingAvatarFile = null;
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
    const batch = [...pendingFiles];
    for (let index = 0; index < batch.length; index += 1) {
      const file = batch[index];
      const object = objects[index];
      const upload = byKey.get(object.key);
      if (!upload?.url) throw new Error(`无法取得 ${file.name} 的上传地址。`);
      setStatus(`正在上传 ${index + 1}/${pendingFiles.length}：${file.name}`, false);
      const response = await fetch(upload.url, { method: 'PUT', headers: { 'Content-Type': upload.contentType }, body: file });
      if (!response.ok) throw new Error(`${file.name} 上传失败：${response.status}`);
      storedFiles.push({ name: file.name, key: object.key, size: file.size, contentType: object.contentType, addedAt: new Date().toISOString() });
      pendingFiles.splice(pendingFiles.indexOf(file), 1);
    }
    pendingFiles = [];
  }

  document.addEventListener('selectionchange', rememberFormatSelection);
  document.querySelectorAll('[data-command]').forEach(button => button.addEventListener('mousedown', event => {
    event.preventDefault();
    applyFormat(button.dataset.command, null);
  }));
  document.getElementById('font-size-select').addEventListener('pointerdown', rememberFormatSelection);
  document.getElementById('font-size-select').addEventListener('change', event => {
    if (event.target.value) applyFormat('fontSize', event.target.value);
    event.target.value = '';
  });
  document.getElementById('text-color-input').addEventListener('pointerdown', rememberFormatSelection);
  document.getElementById('text-color-input').addEventListener('change', event => applyFormat('foreColor', event.target.value));
  document.getElementById('background-color-input').addEventListener('pointerdown', rememberFormatSelection);
  document.getElementById('background-color-input').addEventListener('change', event => {
    const command = document.queryCommandSupported?.('hiliteColor') ? 'hiliteColor' : 'backColor';
    applyFormat(command, event.target.value);
  });
  document.getElementById('add-link-button').addEventListener('click', () => {
    if (!restoreFormatSelection()) return;
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) return alert('请先选中需要添加链接的文字。');
    document.getElementById('link-url-input').value = '';
    updateLinkFiles();
    document.getElementById('link-dialog').showModal();
  });
  document.getElementById('link-cancel-button').addEventListener('click', () => document.getElementById('link-dialog').close());
  document.getElementById('link-file-select').addEventListener('change', event => {
    if (event.target.value) document.getElementById('link-url-input').value = event.target.value;
  });
  document.getElementById('link-insert-button').addEventListener('click', () => {
    const url = document.getElementById('link-url-input').value.trim();
    if (!/^(https?:\/\/|mailto:)/i.test(url)) return alert('请输入完整网址或选择文件下载链接。');
    document.getElementById('link-dialog').close();
    applyFormat('createLink', url);
  });
  async function addFiles(event) {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (!files.length || fileUploadBusy) return;
    if (files.some(file => !/\.(pdf|docx?|pptx?|xlsx?|txt|md|csv|zip|png|jpe?g|webp)$/i.test(file.name) || file.size < 1 || file.size > 25 * 1024 * 1024)) return alert('请选择支持的非空文件，单个文件不能超过 25 MB。');
    if (files.length + pendingFiles.length > 20 || storedFiles.length + pendingFiles.length + files.length > 100) return alert('每次最多上传 20 个文件，文件库最多保存 100 个。');
    if ([...pendingFiles, ...files].reduce((sum, file) => sum + file.size, 0) > 150 * 1024 * 1024) return alert('单次上传总量不能超过 150 MB。');
    pendingFiles.push(...files);
    fileUploadBusy = true;
    const controls = ['save-button', 'restore-button', 'profile-files-input', 'link-upload-input', 'link-insert-button'];
    controls.forEach(id => { document.getElementById(id).disabled = true; });
    document.getElementById('link-upload-status').textContent = '正在上传文件…';
    try {
      await uploadPendingFiles();
      renderFiles();
      const url = downloadLink(storedFiles[storedFiles.length - 1]);
      document.getElementById('link-url-input').value = url;
      document.getElementById('link-file-select').value = url;
      document.getElementById('link-upload-status').textContent = '下载链接已生成，插入后请保存修改。';
      setStatus('下载链接已生成；点击“保存修改”后生效', false);
    } catch (error) {
      renderFiles();
      document.getElementById('link-upload-status').textContent = `上传失败：${error.message}`;
      setStatus(`上传失败：${error.message}；可点击保存修改重试未完成文件`, true);
    } finally {
      fileUploadBusy = false;
      controls.forEach(id => { document.getElementById(id).disabled = false; });
    }
  }
  document.getElementById('link-upload-input').addEventListener('change', addFiles);
  document.getElementById('avatar-picker-button').addEventListener('click', () => {
    document.getElementById('profile-avatar-input').click();
  });
  document.getElementById('profile-avatar-input').addEventListener('change', event => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      alert('头像只支持 JPG、PNG 或 WebP。');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      alert('头像文件不能超过 10 MB。');
      return;
    }
    releaseAvatarPreview();
    pendingAvatarFile = file;
    avatarPreviewUrl = URL.createObjectURL(file);
    renderAvatar();
    setStatus('头像已选择，点击“保存修改”后上传', false);
  });
  document.getElementById('remove-avatar-button').addEventListener('click', () => {
    releaseAvatarPreview();
    pendingAvatarFile = null;
    storedAvatar = null;
    renderAvatar();
    setStatus('头像将被移除，点击“保存修改”确认', false);
  });
  document.getElementById('profile-files-input').addEventListener('change', addFiles);
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
    fileUploadBusy = true;
    document.getElementById('profile-files-input').disabled = true;
    document.getElementById('link-upload-input').disabled = true;
    try {
      await uploadPendingAvatar();
      await uploadPendingFiles();
      const profile = collectProfile();
      const { profile: saved } = await gateway('put-profile', { profileId, profile });
      applyProfile(saved || profile);
      setStatus('修改已保存到 COS，公开主页刷新后即可看到', false);
    } catch (error) {
      console.error(error);
      setStatus(`保存失败：${error.message}`, true);
    } finally {
      fileUploadBusy = false;
      document.getElementById('profile-files-input').disabled = false;
      document.getElementById('link-upload-input').disabled = false;
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
