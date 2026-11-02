import express from 'express';
import helmet from 'helmet';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import mammoth from 'mammoth';
import pdf from 'pdf-parse/lib/pdf-parse.js';
import PDFDocument from 'pdfkit';
import path from 'node:path';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { Employee, Job, Candidate, User, Upload, Notification } from './models.js';
import { track, decide, jobStage, actionCandidate, assert } from './workflow.js';
import { registerAccountRoutes, registerPublicAuthRoutes } from './routes/auth.routes.js';
import { registerNotificationRoutes } from './routes/notifications.routes.js';
import { registerReportRoutes } from './routes/reports.routes.js';
import { config as defaultConfig } from './config.js';
const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const clean = o => JSON.parse(JSON.stringify(o));
const employeeFields = ['name', 'role', 'dept', 'email', 'status', 'salary', 'joinDate', 'managerId'];
const jobFields = ['jobCode', 'title', 'designation', 'dept', 'subDept', 'location', 'openings', 'reqType', 'replacementOf', 'grade', 'ctc', 'jd', 'eligibility', 'qualification', 'roleExpType', 'roleExpYears', 'raisedBy', 'deptHead', 'assignedRecruiterId', 'postedDate'];
const candidateFields = ['name', 'jobId', 'email', 'phone', 'resumeUrl', 'resumeFile', 'resumeFileName', 'source', 'referredBy', 'notes', 'experienceType', 'experienceYears', 'gender', 'dob', 'noticePeriod', 'currentCTC', 'expectedCTC', 'currentAddress', 'education', 'appliedDate'];
const pick = (o, keys) => Object.fromEntries(keys.filter(k => o[k] !== undefined).map(k => [k, o[k]]));
function actor(req) {
  return req.user.name || req.user.email;
}
function allow(req, roles) {
  const isAdminRole = req.user.role === 'admin' || req.user.role === 'superadmin';
  if (!roles.includes(req.user.role) && !(isAdminRole && roles.includes('admin'))) {
    const e = new Error('Your role does not have permission for this action');
    e.status = 403;
    throw e;
  }
}
function approvalRole(req, step) {
  allow(req, ['admin', step]);
}
async function candidateAccess(req, c) {
  if (req.user.role === 'manager') {
    const e = await Employee.findOne({
      id: req.user.employeeId
    });
    const j = await Job.findOne({
      id: c.jobId
    });
    assert(e && (c.cvSharedWith === e.name || j?.raisedBy === e.name), 'Candidate is not assigned to you');
  }
}
async function updateVersion(Model, id, version, data) {
  assert(Number.isInteger(version), 'Version is required');
  const updated = await Model.findOneAndUpdate({
    id,
    version
  }, {
    $set: data,
    $inc: {
      version: 1
    }
  }, {
    new: true,
    runValidators: true
  });
  if (!updated) {
    const e = new Error('Record changed or was deleted. Refresh before saving.');
    e.status = 409;
    throw e;
  }
  return updated;
}
function linkSafe(value) {
  assert(!value || /^https?:\/\//i.test(value), 'Resume link must start with http:// or https://');
}
async function notifyTeam(req, {
  title,
  message,
  href = '/notifications',
  type = 'activity'
}, config = defaultConfig) {
  if (!config.features.notifications) return;
  try {
    const users = await User.find({
      _id: {
        $ne: req.user._id
      }
    }).select('_id');
    if (users.length) await Notification.insertMany(users.map(u => ({
      id: randomUUID(),
      userId: String(u._id),
      actorId: String(req.user._id),
      actorName: actor(req),
      type,
      title,
      message,
      href
    })));
  } catch (error) {
    console.error('Notification delivery failed:', error.message);
  }
}
export function createApp(secret, config = defaultConfig) {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet({
    contentSecurityPolicy: false
  }));
  app.use((req, res, next) => {
    const origin = req.get('origin');
    if (!origin) return next();

    const sameOrigin = origin === `${req.protocol}://${req.get('host')}`;
    if (!sameOrigin && !config.frontendUrls.includes(origin)) {
      return res.status(403).json({ error: 'Origin is not allowed' });
    }

    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET,HEAD,POST,PUT,PATCH,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Vary', 'Origin');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });
  app.use(express.json({
    limit: `${config.jsonBodyLimitMb}mb`
  }));
  app.get('/api/health', (_, res) => res.json({
    ok: true
  }));
  registerPublicAuthRoutes(app, { secret, wrap, config });
  app.use('/api', wrap(async (req, res, next) => {
    const token = (req.headers.cookie || '').split(';').map(s => s.trim()).find(s => s.startsWith('udata_token='))?.slice(12);
    try {
      const payload = jwt.verify(token || '', secret);
      const u = await User.findById(payload.id);
      if (!u) throw Error();
      req.user = u;
      next();
    } catch {
      if (req.method === 'GET' && req.path === '/auth/me') return res.json({
        user: null
      });
      res.status(401).json({
        error: 'Please sign in'
      });
    }
  }));
  app.use('/api', (req, res, next) => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.headers.origin &&
      req.headers.origin !== `${req.protocol}://${req.get('host')}` &&
      !config.frontendUrls.includes(req.headers.origin)) {
      return res.status(403).json({
        error: 'Cross-origin writes are blocked'
      });
    }
    next();
  });
  registerAccountRoutes(app, { wrap, allow, assert, config });
  if (config.features.notifications) registerNotificationRoutes(app, { wrap, assert });
  if (config.features.reports) registerReportRoutes(app, { wrap, jobStage });
  app.get('/api/bootstrap', wrap(async (req, res) => {
    let [employees, jobs, candidates] = await Promise.all([Employee.find(), Job.find(), Candidate.find()]);
    if (req.user.role === 'manager') {
      const e = employees.find(e => e.id === req.user.employeeId);
      const myJobs = jobs.filter(j => j.raisedBy === e?.name);
      candidates = candidates.filter(c => c.cvSharedWith === e?.name || myJobs.some(j => j.id === c.jobId));
      jobs = jobs.filter(j => myJobs.some(x => x.id === j.id) || candidates.some(c => c.jobId === j.id));
    }
    res.json({
      employees,
      jobs,
      candidates,
      config: {
        features: config.features,
        uploadMaxSizeMb: config.uploadMaxSizeMb
      }
    });
  }));
  for (const [name, Model, fields] of [['employees', Employee, employeeFields], ['jobs', Job, jobFields], ['candidates', Candidate, candidateFields]]) {
    app.get(`/api/${name}`, wrap(async (req, res) => {
      allow(req, ['admin', 'recruiter', 'hod', 'siteHead', 'taHead']);
      res.json(await Model.find());
    }));
    app.post(`/api/${name}`, wrap(async (req, res) => {
      allow(req, name === 'employees' ? ['admin', 'recruiter'] : ['admin', 'recruiter', ...(name === 'jobs' ? ['manager'] : [])]);
      const data = pick(req.body, fields);
      data.id = randomUUID();
      data.version = 0;
      if (name === 'jobs') {
        assert(data.title?.trim() && data.jobCode?.trim(), 'Title and job code required');
        assert(Number.isInteger(Number(data.openings)) && Number(data.openings) > 0, 'Openings must be a positive integer');
        Object.assign(data, {
          approvals: track(),
          closed: false,
          cancelled: false
        });
        if (req.user.role === 'manager') {
          const e = await Employee.findOne({
            id: req.user.employeeId
          });
          assert(e, 'Manager employee not found');
          data.raisedBy = e.name;
        }
      }
      if (name === 'employees') {
        assert(data.name?.trim(), 'Employee name required');
        await validateManager(data);
      }
      if (name === 'candidates') {
        assert(data.name?.trim(), 'Candidate name required');
        const j = await Job.findOne({
          id: data.jobId
        });
        assert(j && jobStage(j) === 'Live', 'Select a live approved requisition');
        linkSafe(data.resumeUrl);
        await validateResume(data);
        Object.assign(data, {
          stage: 'Applied',
          shortlisted: false,
          interviews: [],
          activity: [{
            date: new Date().toISOString(),
            message: 'Application created by ' + actor(req)
          }],
          offerStatus: '',
          cvShareStatus: '',
          cvSharedWith: ''
        });
      }
      const created = await Model.create(data);
      if (name === 'jobs') await notifyTeam(req, {
        title: 'New requisition',
        message: `${actor(req)} created ${data.jobCode} — ${data.title}.`,
        type: 'requisition'
      }, config);
      if (name === 'candidates') await notifyTeam(req, {
        title: 'New candidate',
        message: `${data.name} applied for requisition ${data.jobId}.`,
        type: 'candidate'
      }, config);
      res.status(201).json(created);
    }));
    app.put(`/api/${name}/:id`, wrap(async (req, res) => {
      allow(req, ['admin', 'recruiter']);
      const old = await Model.findOne({
        id: req.params.id
      });
      assert(old, 'Record not found');
      const data = pick(req.body, fields);
      if (data.name !== undefined) assert(data.name?.trim(), 'Name required');
      if (name === 'candidates') {
        assert(!data.jobId || data.jobId === old.jobId, 'Job cannot be changed after application');
        linkSafe(data.resumeUrl);
        await validateResume(data);
      }
      if (name === 'jobs') {
        assert(jobStage(old) === 'Pending Approval' && Object.values(clean(old.approvals)).every(a => a.status === 'Pending'), 'Reset approval track before changing a reviewed requisition');
        assert(Number.isInteger(Number(data.openings ?? old.openings)) && Number(data.openings ?? old.openings) > 0, 'Openings must be a positive integer');
      }
      if (name === 'employees') await validateManager({
        ...clean(old),
        ...data
      });
      res.json(await updateVersion(Model, old.id, req.body.version, data));
    }));
    app.delete(`/api/${name}/:id`, wrap(async (req, res) => {
      allow(req, ['admin', 'recruiter']);
      if (name === 'jobs') assert(!(await Candidate.exists({
        jobId: req.params.id
      })), 'Requisition has candidates. Close it instead.');
      if (name === 'employees') {
        assert(!(await User.exists({
          employeeId: req.params.id
        })), 'Employee has a login account');
        assert(!(await Employee.exists({
          managerId: req.params.id
        })), 'Reassign direct reports first');
        assert(!(await Job.exists({
          assignedRecruiterId: req.params.id
        })), 'Reassign recruiter on requisitions first');
      }
      assert(Number.isInteger(req.body.version), 'Version required');
      const deleted = await Model.findOneAndDelete({
        id: req.params.id,
        version: req.body.version
      });
      if (!deleted) return res.status(409).json({
        error: 'Record changed. Refresh before deleting.'
      });
      res.json({
        ok: true
      });
    }));
  }
  app.post('/api/jobs/:id/action', wrap(async (req, res) => {
    const j = await Job.findOne({
      id: req.params.id
    });
    assert(j, 'Job not found');
    const d = clean(j);
    const {
      action,
      step,
      decision
    } = req.body;
    if (action === 'approve') {
      approvalRole(req, step);
      assert(!j.closed && !j.cancelled, 'Closed or cancelled requisition');
      d.approvals = decide(d.approvals, step, decision, actor(req));
    } else {
      allow(req, ['admin', 'recruiter']);
      if (action === 'reset') {
        d.approvals = track();
        d.closed = false;
        d.cancelled = false;
      } else if (action === 'close') d.closed = !d.closed;else if (action === 'cancel') d.cancelled = !d.cancelled;else assert(false, 'Unknown action');
    }
    delete d.version;
    const updated = await updateVersion(Job, j.id, req.body.version, d);
    await notifyTeam(req, {
      title: 'Requisition updated',
      message: `${j.jobCode} — ${j.title}: ${action === 'approve' ? `${step} ${decision.toLowerCase()}` : action}.`,
      href: '/approvals',
      type: 'requisition'
    });
    res.json(updated);
  }));
  app.post('/api/candidates/:id/action', wrap(async (req, res) => {
    const c = await Candidate.findOne({
      id: req.params.id
    });
    assert(c, 'Candidate not found');
    const {
      action
    } = req.body;
    if (action === 'package-approval') approvalRole(req, req.body.step);else if (action === 'letter-approval') allow(req, ['admin', 'taHead']);else if (['shortlist', 'reject', 'feedback', 'no-show', 'reschedule'].includes(action)) {
      allow(req, ['admin', 'recruiter', 'manager']);
      await candidateAccess(req, c);
    } else allow(req, ['admin', 'recruiter']);
    const d = actionCandidate(clean(c), req.body, actor(req));
    delete d.version;
    // Hiring is an atomic candidate change; employee creation is idempotent and recoverable.
    const updated = await updateVersion(Candidate, c.id, req.body.version, d);
    if (action === 'hire') await ensureEmployee(updated);
    await notifyTeam(req, {
      title: 'Candidate workflow updated',
      message: `${c.name}: ${String(action).replaceAll('-', ' ')}${req.body.decision ? ` — ${req.body.decision}` : ''}.`,
      href: '/candidates',
      type: 'candidate'
    }, config);
    res.json(updated);
  }));
  async function ensureEmployee(c) {
    const j = await Job.findOne({
      id: c.jobId
    });
    return Employee.findOneAndUpdate({
      candidateId: c.id
    }, {
      $setOnInsert: {
        id: 'hired-' + c.id,
        version: 0,
        name: c.name,
        email: c.email,
        role: j?.designation || j?.title,
        dept: j?.dept,
        salary: Number(String(c.negotiatedCTC || 0).replace(/,/g, '')),
        joinDate: c.hiredDate,
        status: 'Active',
        candidateId: c.id
      }
    }, {
      upsert: true,
      new: true,
      runValidators: true
    });
  }
  app.post('/api/candidates/:id/sync-employee', wrap(async (req, res) => {
    allow(req, ['admin', 'recruiter']);
    const c = await Candidate.findOne({
      id: req.params.id
    });
    assert(c?.stage === 'Hired', 'Candidate must be hired');
    res.json(await ensureEmployee(c));
  }));
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: config.uploadMaxSizeMb * 1024 * 1024
    }
  });
  if (config.features.resumeUploads) app.post('/api/uploads', upload.single('file'), wrap(async (req, res) => {
    allow(req, ['admin', 'recruiter']);
    const f = req.file;
    assert(f, 'Choose a file');
    const ext = path.extname(f.originalname).toLowerCase();
    assert(['.pdf', '.docx', '.doc', '.txt'].includes(ext), 'Upload PDF, DOCX, DOC or TXT');
    let text = '',
      warning = '';
    try {
      if (ext === '.pdf') {
        assert(f.buffer.subarray(0, 5).toString() === '%PDF-', 'Invalid PDF');
        text = (await pdf(f.buffer)).text;
      } else if (ext === '.docx') {
        assert(f.buffer[0] === 0x50 && f.buffer[1] === 0x4b, 'Invalid DOCX');
        text = (await mammoth.extractRawText({
          buffer: f.buffer
        })).value;
      } else if (ext === '.txt') text = f.buffer.toString('utf8');else warning = 'Legacy DOC stored. Convert to DOCX for text extraction.';
    } catch (e) {
      warning = 'Text extraction failed; file stored. Fill details manually.';
    }
    const u = await Upload.create({
      id: randomUUID(),
      name: path.basename(f.originalname),
      mime: ext === '.pdf' ? 'application/pdf' : ext === '.docx' ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' : ext === '.doc' ? 'application/msword' : 'text/plain',
      data: f.buffer,
      text: text.slice(0, config.extractedTextLimit),
      createdBy: req.user.id
    });
    const email = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] || '';
    const phone = text.match(/(?:\+91[\s-]?)?[6-9]\d{9}/)?.[0] || '';
    const name = text.split('\n').map(x => x.trim()).find(x => /^[a-zA-Z][a-zA-Z .'-]{2,60}$/.test(x)) || '';
    let score = null;
    if (req.body.jobId) {
      const j = await Job.findOne({
        id: req.body.jobId
      });
      const words = [...new Set(String(j?.jd || '').toLowerCase().match(/[a-z]{4,}/g) || [])];
      score = words.length ? Math.round(words.filter(w => text.toLowerCase().includes(w)).length / words.length * 100) : null;
    }
    res.status(201).json({
      resumeFile: '/api/uploads/' + u.id,
      resumeFileName: u.name,
      resumeMatchScore: score,
      extracted: {
        name,
        email,
        phone
      },
      warning
    });
  }));
  app.get('/api/uploads/:id', wrap(async (req, res) => {
    if (req.user.role === 'manager') {
      const c = await Candidate.findOne({
        resumeFile: '/api/uploads/' + req.params.id
      });
      assert(c, 'Document is not assigned');
      await candidateAccess(req, c);
    }
    const u = await Upload.findOne({
      id: req.params.id
    });
    if (!u) return res.status(404).json({
      error: 'Document not found'
    });
    res.set('Content-Type', u.mime);
    res.set('Content-Disposition', `attachment; filename="${u.name.replace(/[^a-zA-Z0-9._ -]/g, '_')}"`);
    res.send(u.data);
  }));
  app.get('/api/candidates/:id/offer.pdf', wrap(async (req, res) => {
    const c = await Candidate.findOne({
      id: req.params.id
    });
    assert(c?.offerLetterGenerated, 'Generate the offer letter first');
    await candidateAccess(req, c);
    const j = await Job.findOne({
      id: c.jobId
    });
    res.type('pdf');
    res.set('Content-Disposition', 'attachment; filename="offer-letter.pdf"');
    const doc = new PDFDocument({
      margin: 60
    });
    doc.pipe(res);
    doc.fontSize(24).text('U-data HR | Offer Letter');
    doc.moveDown().fontSize(11).text('Date: ' + new Date().toISOString().slice(0, 10));
    doc.moveDown().text('Dear ' + c.name + ',');
    doc.moveDown().text(`We are pleased to offer you the position of ${j?.designation || j?.title || 'Employee'} in ${j?.dept || 'our team'}, based at ${j?.location || 'the agreed location'}.`);
    doc.moveDown().text('Annual CTC: INR ' + c.negotiatedCTC);
    doc.moveDown().text('Notice period: ' + (c.noticePeriod || 'To be agreed'));
    doc.moveDown().text('Approval status: ' + (c.offerLetterApproval?.status || 'Draft'));
    doc.moveDown().text('Joining date and employment terms must be agreed in writing before commencement.');
    doc.moveDown().text('HR Team');
    doc.end();
  }));
  app.get('/api/candidates/:id/interviews/:roundId/calendar.ics', wrap(async (req, res) => {
    const c = await Candidate.findOne({
      id: req.params.id
    });
    assert(c, 'Candidate not found');
    await candidateAccess(req, c);
    const r = c.interviews.find(x => x.id === req.params.roundId);
    assert(r, 'Round not found');
    const start = new Date(r.date + 'T' + r.time + ':00+05:30');
    assert(!Number.isNaN(+start), 'Invalid interview date');
    const fmt = d => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const esc = s => String(s).replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/[,;]/g, '\\$&');
    res.type('text/calendar').set('Content-Disposition', 'attachment; filename="interview.ics"').send(['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//U-data//HR//EN', 'BEGIN:VEVENT', 'UID:' + r.id + '@udata.local', 'DTSTAMP:' + fmt(new Date()), 'DTSTART:' + fmt(start), 'DTEND:' + fmt(new Date(+start + 3600000)), 'SUMMARY:' + esc(r.round + ' — ' + c.name), 'DESCRIPTION:' + esc('Interviewer: ' + r.hiringManager), 'END:VEVENT', 'END:VCALENDAR'].join('\r\n'));
  }));
  if (config.features.dataBackup) app.get('/api/backup', wrap(async (req, res) => {
    allow(req, ['admin']);
    const [employees, jobs, candidates, uploads] = await Promise.all([Employee.find(), Job.find(), Candidate.find(), Upload.find()]);
    res.json({
      format: 'udata-hr-mern-v1',
      exportedAt: new Date().toISOString(),
      employees,
      jobs,
      candidates,
      uploads: uploads.map(u => ({
        id: u.id,
        name: u.name,
        mime: u.mime,
        text: u.text,
        data: u.data.toString('base64')
      }))
    });
  }));
  const dist = path.resolve('..', 'client', 'dist');
  if (fs.existsSync(dist)) {
    app.use(express.static(dist));
    app.get('*', (req, res) => {
      if (req.path.startsWith('/api')) return res.status(404).json({
        error: 'API route not found'
      });
      res.sendFile(path.join(dist, 'index.html'));
    });
  }
  app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);
    const status = err.status || (err.code === 11000 ? 409 : err.name === 'ValidationError' || err.name === 'MulterError' ? 400 : 500);
    console.error(status >= 500 ? err : err.message);
    res.status(status).json({
      error: status === 500 ? 'Server error. Check server logs.' : err.code === 11000 ? 'This code or email already exists' : err.message
    });
  });
  return app;
}
async function validateResume(data) {
  if (data.resumeFile) {
    assert(/^\/api\/uploads\/[a-zA-Z0-9-]+$/.test(data.resumeFile), 'Invalid resume reference');
    const u = await Upload.findOne({
      id: data.resumeFile.split('/').pop()
    }).select('text');
    assert(u, 'Resume not found');
    const j = await Job.findOne({
      id: data.jobId
    });
    const words = [...new Set(String(j?.jd || '').toLowerCase().match(/[a-z]{4,}/g) || [])];
    if (words.length && u.text) data.resumeMatchScore = Math.round(words.filter(w => u.text.toLowerCase().includes(w)).length / words.length * 100);
  }
}
async function validateManager(data) {
  if (data.managerId) {
    assert(data.managerId !== data.id, 'Employee cannot report to themselves');
    let id = data.managerId;
    const seen = new Set([data.id]);
    while (id) {
      assert(!seen.has(id), 'Reporting line would create a cycle');
      seen.add(id);
      const e = await Employee.findOne({
        id
      });
      assert(e, 'Manager not found');
      id = e.managerId;
    }
  }
}
