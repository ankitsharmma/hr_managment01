import crypto from 'node:crypto';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const envFile = fileURLToPath(new URL('../.env', import.meta.url));
const legacyEnvFile = fileURLToPath(new URL('../server/.env', import.meta.url));

if (fs.existsSync(envFile)) {
  console.log('Existing .env kept.');
} else {
  if (fs.existsSync(legacyEnvFile)) {
    fs.copyFileSync(legacyEnvFile, envFile, fs.constants.COPYFILE_EXCL);
    console.log('Existing server/.env copied to the project root as .env.');
  } else {
    const adminPassword = crypto.randomBytes(18).toString('base64url');
    const jwtSecret = crypto.randomBytes(48).toString('hex');
    const values = [
      'NODE_ENV=development',
      'HOST=0.0.0.0',
      'PORT=4000',
      'APP_HOST=127.0.0.1',
      'APP_PORT=4000',
      'MONGODB_URI=mongodb://127.0.0.1:27017/udata_hr',
      'DOCKER_MONGODB_URI=mongodb://mongodb:27017/udata_hr',
      `JWT_SECRET=${jwtSecret}`,
      'ADMIN_EMAIL=admin@udata.local',
      `ADMIN_PASSWORD=${adminPassword}`,
      'SEED_DEMO=true',
      'COOKIE_SECURE=false',
      'SESSION_TTL_HOURS=12',
      'JSON_BODY_LIMIT_MB=12',
      'UPLOAD_MAX_SIZE_MB=8',
      'EXTRACTED_TEXT_LIMIT=150000',
      'LOGIN_RATE_LIMIT_MAX=30',
      'LOGIN_RATE_LIMIT_WINDOW_MS=900000',
      'FEATURE_NOTIFICATIONS=true',
      'FEATURE_REPORTS=true',
      'FEATURE_RESUME_UPLOADS=true',
      'FEATURE_STAFF_ACCOUNTS=true',
      'FEATURE_DATA_BACKUP=true',
      'VITE_API_PROXY_TARGET=http://localhost:4000',
      'VITE_DEV_HOST=0.0.0.0',
      'VITE_DEV_PORT=5173'
    ];

    fs.writeFileSync(envFile, `${values.join('\n')}\n`, { flag: 'wx', mode: 0o600 });
    console.log(`Setup complete. Admin email: admin@udata.local\nAdmin password: ${adminPassword}`);
    console.log('The generated credentials are also saved in the ignored .env file.');
  }
}
