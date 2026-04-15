const rateLimit = require('express-rate-limit');

// NOTE: standardHeaders disabled because SSE endpoints call res.flushHeaders() early,
// and express-rate-limit async checks try to set headers after they're sent,
// causing ERR_HTTP_HEADERS_SENT crashes.
const generalLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 60000,
  max: parseInt(process.env.RATE_LIMIT_MAX) || 100,
  message: { error: 'Too many requests, please try again later' },
  standardHeaders: false, // disabled — SSE endpoints call res.flushHeaders() early,
  legacyHeaders: false,   // causing ERR_HTTP_HEADERS_SENT if this tries to set headers after
});

const loginLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 60000,
  max: parseInt(process.env.LOGIN_RATE_LIMIT_MAX) || 5,
  message: { error: 'Too many login attempts, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = { generalLimiter, loginLimiter };
