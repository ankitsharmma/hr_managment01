import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { Employee, User } from '../models.js';
import rateLimit from 'express-rate-limit';

export function registerPublicAuthRoutes(app, { secret, wrap, config }) {
  app.post('/api/auth/login', rateLimit({
    windowMs: config.loginRateLimitWindowMs,
    limit: config.loginRateLimitMax,
    standardHeaders: true,
    legacyHeaders: false
  }), wrap(async (req, res) => {
    const email = String(req.body.email || '').trim().toLowerCase();
    const user = await User.findOne({ email });
    if (!user || !(await bcrypt.compare(String(req.body.password || ''), user.passwordHash))) {
      return res.status(401).json({ error: 'Email or password is incorrect' });
    }

    res.cookie('udata_token', jwt.sign({ id: String(user._id) }, secret, {
      expiresIn: `${config.sessionTtlHours}h`
    }), {
      httpOnly: true,
      sameSite: config.cookieSameSite,
      secure: config.cookieSecure,
      maxAge: config.sessionTtlHours * 60 * 60 * 1000,
      path: '/'
    });
    res.json({
      user: {
        id: String(user._id),
        name: user.name,
        email: user.email,
        role: user.role,
        employeeId: user.employeeId
      }
    });
  }));

  app.post('/api/auth/logout', (_, res) => {
    res.clearCookie('udata_token', {
      httpOnly: true,
      sameSite: config.cookieSameSite,
      secure: config.cookieSecure,
      path: '/'
    });
    res.json({ ok: true });
  });
}

export function registerAccountRoutes(app, { wrap, allow, assert, config }) {
  app.get('/api/auth/me', (req, res) => res.json({
    user: {
      id: String(req.user._id),
      name: req.user.name,
      email: req.user.email,
      role: req.user.role,
      employeeId: req.user.employeeId
    }
  }));

  app.post('/api/auth/password', wrap(async (req, res) => {
    assert(await bcrypt.compare(String(req.body.current || ''), req.user.passwordHash), 'Current password is incorrect');
    assert(String(req.body.password || '').length >= 10, 'Use a password with at least 10 characters');
    req.user.passwordHash = await bcrypt.hash(req.body.password, 12);
    await req.user.save();
    res.json({ ok: true });
  }));

  if (config.features.staffAccounts) {
    app.get('/api/users', wrap(async (req, res) => {
      allow(req, ['admin']);
      res.json(await User.find().select('-passwordHash'));
    }));

    app.post('/api/users', wrap(async (req, res) => {
      allow(req, ['admin']);
      const { name, email, password, role, employeeId } = req.body;
      assert(name && email && String(password || '').length >= 10, 'Name, email and password (10+ characters) required');
      assert(['admin', 'superadmin', 'recruiter', 'manager', 'hod', 'siteHead', 'taHead'].includes(role), 'Invalid role');
      if (role === 'manager') {
        assert(employeeId && await Employee.exists({ id: employeeId }), 'Link manager to an employee');
      }

      const user = await User.create({
        name,
        email: email.toLowerCase().trim(),
        passwordHash: await bcrypt.hash(password, 12),
        role,
        employeeId
      });
      res.status(201).json({ id: user.id, email: user.email, role: user.role });
    }));
  }
}
