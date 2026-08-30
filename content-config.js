// 此文件可以公开上传到 GitHub。腾讯云 Bucket、SecretId、SecretKey 只配置在 Supabase Secrets 中。
window.SITE_CONTENT_CONFIG = {
    provider: 'tencent-cos',
    gatewayFunction: 'cos-content',
    manifestKey: 'content/index.json'
};
