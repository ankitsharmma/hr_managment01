import 'dotenv/config';import mongoose from 'mongoose';import bcrypt from 'bcryptjs';import fs from 'node:fs';import {createApp} from './app.js';import {User,Employee,Job,Candidate} from './models.js';
const secret=process.env.JWT_SECRET;
if(!secret||secret.length<32||secret.startsWith('replace-with')){console.error('Set JWT_SECRET in server/.env (32+ random characters). Run the setup script.');process.exit(1);}
try{await mongoose.connect(process.env.MONGODB_URI||'mongodb://127.0.0.1:27017/udata_hr',{serverSelectionTimeoutMS:10000});await Promise.all([User.init(),Employee.init(),Job.init(),Candidate.init()]);
if(!await User.exists({})){if(!process.env.ADMIN_PASSWORD||process.env.ADMIN_PASSWORD.length<10)throw Error('Set ADMIN_PASSWORD (10+ characters)');await User.create({email:(process.env.ADMIN_EMAIL||'admin@udata.local').toLowerCase(),name:'Administrator',role:'admin',passwordHash:await bcrypt.hash(process.env.ADMIN_PASSWORD,12)});}
if(process.env.SEED_DEMO==='true'&&!await Job.exists({})&&!await Candidate.exists({})&&!await Employee.exists({})){const seed=JSON.parse(fs.readFileSync(new URL('./seed.json',import.meta.url)));seed.candidates.forEach(c=>{if(c.resumeMatchScore==='')delete c.resumeMatchScore;});await Employee.insertMany(seed.employees);await Job.insertMany(seed.jobs);await Candidate.insertMany(seed.candidates);}
const server=createApp(secret).listen(Number(process.env.PORT)||4000,()=>console.log('U-data HR: http://localhost:'+(process.env.PORT||4000)));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(async()=>{await mongoose.disconnect();process.exit(0);}));
}catch(e){console.error('Startup failed:',e.message,'\nCheck MongoDB and server/.env');process.exit(1);}
