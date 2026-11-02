import mongoose from 'mongoose';import fs from 'node:fs';import {randomUUID} from 'node:crypto';import {Employee,Job,Candidate,Upload} from '../server/src/models.js';import {config} from '../server/src/config.js';
const filename=process.argv[2];if(!filename){console.error('Usage: node scripts/import-data.mjs path/to/backup.json');process.exit(1);}
const input=JSON.parse(fs.readFileSync(filename,'utf8'));for(const k of ['employees','jobs','candidates'])if(!Array.isArray(input[k]))throw Error('Missing '+k+' array');
await mongoose.connect(config.mongoUri);
try{await Promise.all([Employee.init(),Job.init(),Candidate.init(),Upload.init()]);
 if(await Employee.exists({})||await Job.exists({})||await Candidate.exists({}))throw Error('Import requires an empty HR database. Set SEED_DEMO=false before first start, or use a new database. No data was changed.');
 const data=structuredClone(input);for(const c of data.candidates){if(c.stage==='On Hold')c.stage='Hold';if(c.stage==='Shortlisted'){c.stage='Interviewing';c.shortlisted=true;}if(c.resumeMatchScore==='')delete c.resumeMatchScore;c.activity??=[];c.interviews??=[];if(c.source==='Career Site')c.source='Career Page';}
 const allowedMimes=new Set(['application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','text/plain']);
 const uploads=(data.uploads||[]).map(u=>({id:u.id,name:u.name,mime:allowedMimes.has(u.mime)?u.mime:'application/octet-stream',text:u.text||'',data:Buffer.from(u.data,'base64')}));
 for(const c of data.candidates){if(c.resumeFile?.startsWith('data:')){const m=c.resumeFile.match(/^data:([^;]+);base64,(.*)$/s);if(!m)throw Error('Invalid embedded resume for '+c.name);const id=randomUUID();uploads.push({id,name:c.resumeFileName||'resume',mime:allowedMimes.has(m[1])?m[1]:'application/octet-stream',data:Buffer.from(m[2],'base64')});c.resumeFile='/api/uploads/'+id;}}
 // Validate all records before the first write.
 const collections=[[Employee,data.employees],[Job,data.jobs],[Candidate,data.candidates],[Upload,uploads]];
 for(const [Model,records] of collections){const seen=new Set();for(const record of records){if(seen.has(record.id))throw Error('Duplicate id in '+Model.modelName);seen.add(record.id);await new Model(record).validate();}}
 const jobIds=new Set(data.jobs.map(j=>j.id));for(const c of data.candidates)if(!jobIds.has(c.jobId))throw Error('Candidate references a missing job: '+c.name);
 for(const [Model,records] of collections)if(records.length)await Model.insertMany(records);
 console.log('Imported:',data.employees.length,'employees,',data.jobs.length,'jobs,',data.candidates.length,'candidates,',uploads.length,'documents.');
}catch(e){console.error('Import failed:',e.message);process.exitCode=1;}finally{await mongoose.disconnect();}
