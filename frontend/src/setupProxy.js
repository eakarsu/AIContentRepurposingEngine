const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function configureProxy(app) {
  const backendPort = process.env.BACKEND_PORT || '3301';
  app.use(
    '/api',
    createProxyMiddleware({
      target: `http://127.0.0.1:${backendPort}`,
      changeOrigin: true
    })
  );
};
