'use strict';
function validateRuntime(env = process.env) {
  const errors = [];
  if (!env.DATABASE_URL) errors.push('DATABASE_URL is required');
  if (!env.JWT_SECRET || env.JWT_SECRET.length < 32) errors.push('JWT_SECRET must contain at least 32 characters');
  if (env.NODE_ENV === 'production' && (!env.FRONTEND_URL || env.FRONTEND_URL.includes('*'))) errors.push('Production FRONTEND_URL must be an explicit origin');
  if (errors.length) throw new Error(`Invalid runtime configuration: ${errors.join('; ')}`);
  return { production: env.NODE_ENV === 'production' };
}
module.exports = { validateRuntime };
