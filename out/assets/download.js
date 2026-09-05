(function () {
  'use strict';
  const status = document.getElementById('download-status');
  const retry = document.getElementById('download-retry');
  const open = document.getElementById('download-open');
  async function download() {
    retry.hidden = true;
    open.hidden = true;
    open.removeAttribute('href');
    status.textContent = '正在获取下载链接…';
    try {
      const params = new URLSearchParams(window.location.search);
      const profileId = params.get('profile');
      const key = params.get('key');
      if (!['dengjie', 'wangboning'].includes(profileId) || !key) throw new Error('下载链接不完整。');
      const config = window.SITE_SUPABASE_CONFIG || {};
      const client = window.supabase.createClient(config.url, config.publishableKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
      // Resolve a fresh signed URL on every visit; never store expiring COS URLs in profile text.
      const { data, error } = await client.functions.invoke(window.SITE_CONTENT_CONFIG?.gatewayFunction || 'cos-content', { body: { action: 'get-public-profile', profileId } });
      if (error || data?.error) throw new Error('暂时无法获取文件，请稍后重试。');
      const file = data?.profile?.files?.find(item => item.key === key);
      if (!file || !/^https:\/\//i.test(file.url || '')) throw new Error('文件尚未保存或已被移除。');
      open.href = file.url;
      status.textContent = `正在下载：${file.name}`;
      const response = await fetch(file.url, { credentials: 'omit' });
      if (!response.ok) throw new Error('文件下载失败，请重试或直接打开文件。');
      const url = URL.createObjectURL(await response.blob());
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = String(file.name || 'download').replace(/[\\/]/g, '-');
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      status.textContent = `已开始下载：${file.name}。若未弹出下载，可点击“重新下载”。`;
    } catch (error) {
      status.textContent = error.message || '下载失败，请重试。';
      open.hidden = !open.hasAttribute('href');
    } finally {
      retry.hidden = false;
    }
  }
  retry.addEventListener('click', download);
  download();
})();
