import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import fs from 'node:fs';
import { createApp } from './app.js';
import { config } from './config.js';
import { User, Employee, Job, Candidate } from './models.js';
const secret = config.jwtSecret;
if (!secret || secret.length < 32 || secret.startsWith('replace-with')) {
  console.error('Set JWT_SECRET in .env (32+ random characters). Run the setup script.');
  process.exit(1);
}
try {
  await mongoose.connect(config.mongoUri, {
    serverSelectionTimeoutMS: 10000
  });
  await Promise.all([User.init(), Employee.init(), Job.init(), Candidate.init()]);
  if (!(await User.exists({}))) {
    if (config.adminPassword.length < 10) throw Error('Set ADMIN_PASSWORD (10+ characters)');
    await User.create({
      email: config.adminEmail,
      name: 'Administrator',
      role: 'admin',
      passwordHash: await bcrypt.hash(config.adminPassword, 12)
    });
  }
  if (config.seedDemo && !(await Job.exists({})) && !(await Candidate.exists({})) && !(await Employee.exists({}))) {
    const seed = JSON.parse(fs.readFileSync(new URL('./seed.json', import.meta.url)));
    seed.candidates.forEach(c => {
      if (c.resumeMatchScore === '') delete c.resumeMatchScore;
    });
    await Employee.insertMany(seed.employees);
    await Job.insertMany(seed.jobs);
    await Candidate.insertMany(seed.candidates);
  }
  const server = createApp(secret).listen(config.port, config.host, () => console.log(`U-data HR: http://localhost:${config.port}`));
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(async () => {
    await mongoose.disconnect();
    process.exit(0);
  }));
} catch (e) {
  console.error('Startup failed:', e.message, '\nCheck MongoDB and .env configuration.');
  process.exit(1);
}
