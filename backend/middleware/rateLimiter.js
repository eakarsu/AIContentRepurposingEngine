const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = require('express-rate-limit');

/**
 * AI endpoint rate limiter: 20 requests per hour per authenticated user.
 * Falls back to IP-based keying (IPv6-safe via ipKeyGenerator) if user is not set on the request.
 */
const aiRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20,
  keyGenerator: (req, res) => {
    return req.user ? `user_${req.user.id}` : ipKeyGenerator(req, res);
  },
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Rate limit exceeded',
    message: 'You have exceeded the 20 AI requests per hour limit. Please try again later.',
    retryAfter: '1 hour'
  },
  handler: (req, res, next, options) => {
    res.status(429).json(options.message);
  }
});

module.exports = { aiRateLimiter };
