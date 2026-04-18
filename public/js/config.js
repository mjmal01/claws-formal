// Auto-detect where the socket.io backend lives.
// When served from Vercel (*.vercel.app) we point at the Railway backend.
// Otherwise we assume same-origin (local dev, Railway-hosted full stack).
(function () {
  const host = window.location.hostname;
  const isStaticHost =
    host.endsWith('.vercel.app') ||
    host.endsWith('.netlify.app') ||
    host.endsWith('.pages.dev');

  window.MIDNIGHT_ECLIPSE_CONFIG = {
    // Override this with your Railway URL before deploying to Vercel.
    BACKEND_URL: isStaticHost
      ? 'https://claws-formal-production.up.railway.app'
      : '',
    IS_STATIC: isStaticHost,
  };
})();
