const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function configureProxy(app) {
  const backendPort = process.env.BACKEND_PORT || '3301';
  app.use(
    '/api',
    createProxyMiddleware({
      target: `http://127.0.0.1:${backendPort}`,
      changeOrigin: true,
      onProxyReq(proxyReq, req) {
        try {
          if (req.headers.origin && new URL(req.headers.origin).host === req.headers.host) {
            proxyReq.removeHeader('origin');
          }
        } catch (_) {
          // Leave malformed or cross-origin requests for the backend CORS policy.
        }
      }
    })
  );
};
