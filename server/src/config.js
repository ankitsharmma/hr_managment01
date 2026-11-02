import dotenv from 'dotenv';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const rootEnvPath = fileURLToPath(new URL('../../.env', import.meta.url));
const legacyEnvPath = fileURLToPath(new URL('../.env', import.meta.url));

dotenv.config({
  path: fs.existsSync(rootEnvPath) ? rootEnvPath : legacyEnvPath
});

function readBoolean(env, name, fallback) {
  const value = env[name];
  if (value === undefined || value === '') return fallback;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new Error(`${name} must be "true" or "false"`);
}

function readInteger(env, name, fallback, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) {
  const value = env[name];
  if (value === undefined || value === '') return fallback;

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`${name} must be a whole number between ${min} and ${max}`);
  }
  return parsed;
}

export function readConfig(env = process.env) {
  const jwtSecret = env.JWT_SECRET || '';
  if (jwtSecret && (jwtSecret.length < 32 || jwtSecret.startsWith('replace-with'))) {
    throw new Error('JWT_SECRET must be a random value of at least 32 characters');
  }
  const cookieSameSite = env.COOKIE_SAME_SITE || 'strict';
  if (!['strict', 'lax', 'none'].includes(cookieSameSite)) {
    throw new Error('COOKIE_SAME_SITE must be "strict", "lax" or "none"');
  }
  if (cookieSameSite === 'none' && !readBoolean(env, 'COOKIE_SECURE', false)) {
    throw new Error('COOKIE_SECURE must be true when COOKIE_SAME_SITE is "none"');
  }

  return Object.freeze({
    nodeEnv: env.NODE_ENV || 'development',
    host: env.HOST || '0.0.0.0',
    port: readInteger(env, 'PORT', 4000, { max: 65535 }),
    appHost: env.APP_HOST || '127.0.0.1',
    appPort: readInteger(env, 'APP_PORT', 4000, { max: 65535 }),
    frontendUrls: (env.FRONTEND_URLS || 'http://localhost:5173,http://127.0.0.1:5173,https://hr-managment01-dpy5.vercel.app')
      .split(',')
      .map(url => url.trim().replace(/\/+$/, ''))
      .filter(Boolean),
    mongoUri: env.MONGODB_URI || 'mongodb://127.0.0.1:27017/udata_hr',
    dockerMongoUri: env.DOCKER_MONGODB_URI || 'mongodb://mongodb:27017/udata_hr',
    jwtSecret,
    adminEmail: (env.ADMIN_EMAIL || 'admin@udata.local').trim().toLowerCase(),
    adminPassword: env.ADMIN_PASSWORD || '',
    seedDemo: readBoolean(env, 'SEED_DEMO', false),
    cookieSecure: readBoolean(env, 'COOKIE_SECURE', false),
    cookieSameSite,
    sessionTtlHours: readInteger(env, 'SESSION_TTL_HOURS', 12, { max: 720 }),
    jsonBodyLimitMb: readInteger(env, 'JSON_BODY_LIMIT_MB', 12, { max: 100 }),
    uploadMaxSizeMb: readInteger(env, 'UPLOAD_MAX_SIZE_MB', 8, { max: 50 }),
    extractedTextLimit: readInteger(env, 'EXTRACTED_TEXT_LIMIT', 150000, { max: 1000000 }),
    loginRateLimitMax: readInteger(env, 'LOGIN_RATE_LIMIT_MAX', 30, { max: 10000 }),
    loginRateLimitWindowMs: readInteger(env, 'LOGIN_RATE_LIMIT_WINDOW_MS', 900000, { max: 86400000 }),
    features: Object.freeze({
      notifications: readBoolean(env, 'FEATURE_NOTIFICATIONS', true),
      reports: readBoolean(env, 'FEATURE_REPORTS', true),
      resumeUploads: readBoolean(env, 'FEATURE_RESUME_UPLOADS', true),
      staffAccounts: readBoolean(env, 'FEATURE_STAFF_ACCOUNTS', true),
      dataBackup: readBoolean(env, 'FEATURE_DATA_BACKUP', true)
    })
  });
}

export const config = readConfig();
