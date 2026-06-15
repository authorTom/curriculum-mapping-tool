const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('./db');

const router = express.Router();

// ---------------------------------------------------------------------------
// Auth helpers
// ---------------------------------------------------------------------------
function currentUser(req) {
  if (!req.session || !req.session.userId) return null;
  return db.prepare("SELECT * FROM users WHERE id = ? AND status = 'active'").get(req.session.userId) || null;
}

function requireAuth(req, res, next) {
  const user = currentUser(req);
  if (!user) return res.status(401).json({ error: 'Not signed in' });
  req.user = user;
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    const user = currentUser(req);
    if (!user) return res.status(401).json({ error: 'Not signed in' });
    if (!roles.includes(user.role)) return res.status(403).json({ error: 'Not permitted for your role' });
    req.user = user;
    next();
  };
}

function publicUser(u) {
  if (!u) return null;
  const { password_hash, ...rest } = u;
  return rest;
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------
router.post('/auth/register', (req, res) => {
  const { name, email, password, requestedRole, grade, specialty } = req.body || {};
  if (!name || !email || !password) return res.status(400).json({ error: 'Name, email and password are required' });
  if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
  const validRoles = ['trainee', 'educator', 'manager', 'qa'];
  const role = validRoles.includes(requestedRole) ? requestedRole : 'trainee';
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.trim());
  if (existing) return res.status(409).json({ error: 'An account with that email already exists' });
  db.prepare(
    `INSERT INTO users (name, email, password_hash, role, status, grade, specialty) VALUES (?,?,?,?, 'pending', ?, ?)`
  ).run(name.trim(), email.trim(), bcrypt.hashSync(password, 10), role, grade || null, specialty || null);
  res.json({ ok: true, message: 'Registration received. An administrator will approve your account.' });
});

router.post('/auth/login', (req, res) => {
  const { email, password } = req.body || {};
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get((email || '').trim());
  if (!user || !bcrypt.compareSync(password || '', user.password_hash)) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }
  if (user.status === 'pending') return res.status(403).json({ error: 'Your account is awaiting administrator approval' });
  if (user.status !== 'active') return res.status(403).json({ error: 'Your account has been disabled' });
  req.session.userId = user.id;
  res.json({ user: publicUser(user) });
});

router.post('/auth/logout', (req, res) => {
  req.session = null;
  res.json({ ok: true });
});

router.get('/auth/me', (req, res) => {
  res.json({ user: publicUser(currentUser(req)) });
});

// Trainees set the curriculum they are working towards.
router.put('/auth/me', requireAuth, (req, res) => {
  const { curriculum_id, grade, specialty } = req.body || {};
  db.prepare('UPDATE users SET curriculum_id = ?, grade = ?, specialty = ? WHERE id = ?')
    .run(curriculum_id || null, grade || null, specialty || null, req.user.id);
  res.json({ user: publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id)) });
});

// ---------------------------------------------------------------------------
// Curricula & capabilities (read: any signed-in user; write: admin)
// ---------------------------------------------------------------------------
router.get('/curricula', requireAuth, (req, res) => {
  const rows = db.prepare(`
    SELECT c.*, COUNT(cap.id) AS capability_count
    FROM curricula c LEFT JOIN capabilities cap ON cap.curriculum_id = c.id
    GROUP BY c.id ORDER BY
      CASE c.stage WHEN 'undergraduate' THEN 0 WHEN 'foundation' THEN 1 WHEN 'core' THEN 2 WHEN 'higher' THEN 3 ELSE 4 END, c.name
  `).all();
  res.json({ curricula: rows });
});

router.get('/curricula/:id', requireAuth, (req, res) => {
  const curriculum = db.prepare('SELECT * FROM curricula WHERE id = ?').get(req.params.id);
  if (!curriculum) return res.status(404).json({ error: 'Curriculum not found' });
  const capabilities = db.prepare(
    'SELECT * FROM capabilities WHERE curriculum_id = ? ORDER BY domain, id'
  ).all(curriculum.id);
  res.json({ curriculum, capabilities });
});

router.post('/curricula', requireRole('admin'), (req, res) => {
  const { name, body, stage, description } = req.body || {};
  if (!name || !stage) return res.status(400).json({ error: 'Name and stage are required' });
  const r = db.prepare('INSERT INTO curricula (name, body, stage, description) VALUES (?,?,?,?)')
    .run(name, body || null, stage, description || null);
  res.json({ id: r.lastInsertRowid });
});

router.put('/curricula/:id', requireRole('admin'), (req, res) => {
  const { name, body, stage, description } = req.body || {};
  db.prepare('UPDATE curricula SET name = ?, body = ?, stage = ?, description = ? WHERE id = ?')
    .run(name, body || null, stage, description || null, req.params.id);
  res.json({ ok: true });
});

router.delete('/curricula/:id', requireRole('admin'), (req, res) => {
  db.prepare('DELETE FROM curricula WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

router.post('/curricula/:id/capabilities', requireRole('admin'), (req, res) => {
  const { code, domain, title, description } = req.body || {};
  if (!code || !title) return res.status(400).json({ error: 'Code and title are required' });
  const r = db.prepare('INSERT INTO capabilities (curriculum_id, code, domain, title, description) VALUES (?,?,?,?,?)')
    .run(req.params.id, code, domain || null, title, description || null);
  res.json({ id: r.lastInsertRowid });
});

router.put('/capabilities/:id', requireRole('admin'), (req, res) => {
  const { code, domain, title, description } = req.body || {};
  db.prepare('UPDATE capabilities SET code = ?, domain = ?, title = ?, description = ? WHERE id = ?')
    .run(code, domain || null, title, description || null, req.params.id);
  res.json({ ok: true });
});

router.delete('/capabilities/:id', requireRole('admin'), (req, res) => {
  db.prepare('DELETE FROM capabilities WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Learning opportunities
// ---------------------------------------------------------------------------
const oppWithMeta = `
  SELECT o.*, u.name AS created_by_name,
    (SELECT COUNT(*) FROM opportunity_capabilities oc WHERE oc.opportunity_id = o.id) AS capability_count
  FROM opportunities o JOIN users u ON u.id = o.created_by
`;

function attachCapabilities(opp) {
  opp.capabilities = db.prepare(`
    SELECT cap.*, cur.name AS curriculum_name, cur.stage AS curriculum_stage
    FROM opportunity_capabilities oc
    JOIN capabilities cap ON cap.id = oc.capability_id
    JOIN curricula cur ON cur.id = cap.curriculum_id
    WHERE oc.opportunity_id = ? ORDER BY cur.name, cap.id
  `).all(opp.id);
  return opp;
}

// Browse: trainees see approved+active only; educators also see their own;
// qa/manager/admin see everything.
router.get('/opportunities', requireAuth, (req, res) => {
  const { capability_id, curriculum_id, type, q, mine, status } = req.query;
  const clauses = [];
  const params = [];

  if (mine === 'true') {
    clauses.push('o.created_by = ?');
    params.push(req.user.id);
  } else if (['qa', 'manager', 'admin'].includes(req.user.role)) {
    if (status) { clauses.push('o.qa_status = ?'); params.push(status); }
  } else {
    clauses.push("o.qa_status = 'approved' AND o.active = 1");
  }
  if (capability_id) {
    clauses.push('o.id IN (SELECT opportunity_id FROM opportunity_capabilities WHERE capability_id = ?)');
    params.push(capability_id);
  }
  if (curriculum_id) {
    clauses.push(`o.id IN (SELECT oc.opportunity_id FROM opportunity_capabilities oc
      JOIN capabilities cap ON cap.id = oc.capability_id WHERE cap.curriculum_id = ?)`);
    params.push(curriculum_id);
  }
  if (type) { clauses.push('o.type = ?'); params.push(type); }
  if (q) {
    clauses.push('(o.title LIKE ? OR o.description LIKE ? OR o.specialty LIKE ?)');
    params.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  const where = clauses.length ? 'WHERE ' + clauses.join(' AND ') : '';
  const rows = db.prepare(`${oppWithMeta} ${where} ORDER BY o.updated_at DESC`).all(...params);
  res.json({ opportunities: rows });
});

router.get('/opportunities/types', requireAuth, (req, res) => {
  const rows = db.prepare('SELECT DISTINCT type FROM opportunities ORDER BY type').all();
  res.json({ types: rows.map(r => r.type) });
});

router.get('/opportunities/:id', requireAuth, (req, res) => {
  const opp = db.prepare(`${oppWithMeta} WHERE o.id = ?`).get(req.params.id);
  if (!opp) return res.status(404).json({ error: 'Opportunity not found' });
  const canSeeUnapproved = ['qa', 'manager', 'admin'].includes(req.user.role) || opp.created_by === req.user.id;
  if (opp.qa_status !== 'approved' && !canSeeUnapproved) return res.status(404).json({ error: 'Opportunity not found' });
  res.json({ opportunity: attachCapabilities(opp) });
});

function validateOpportunity(body) {
  const { title, type } = body || {};
  if (!title || !type) return 'Title and type are required';
  if (!Array.isArray(body.capability_ids) || body.capability_ids.length === 0) {
    return 'Map the opportunity to at least one curriculum capability';
  }
  return null;
}

function setOppCaps(oppId, capIds) {
  db.exec('BEGIN');
  try {
    db.prepare('DELETE FROM opportunity_capabilities WHERE opportunity_id = ?').run(oppId);
    const ins = db.prepare('INSERT OR IGNORE INTO opportunity_capabilities (opportunity_id, capability_id) VALUES (?,?)');
    for (const id of capIds) ins.run(oppId, Number(id));
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

router.post('/opportunities', requireRole('educator', 'admin'), (req, res) => {
  const err = validateOpportunity(req.body);
  if (err) return res.status(400).json({ error: err });
  const b = req.body;
  const r = db.prepare(`
    INSERT INTO opportunities (title, description, type, specialty, site, schedule, capacity, audience, lead_name, lead_email, created_by)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)
  `).run(b.title, b.description || null, b.type, b.specialty || null, b.site || null, b.schedule || null,
    b.capacity || null, b.audience || null, b.lead_name || null, b.lead_email || null, req.user.id);
  setOppCaps(r.lastInsertRowid, b.capability_ids);
  res.json({ id: r.lastInsertRowid, message: 'Submitted for QA review' });
});

router.put('/opportunities/:id', requireRole('educator', 'admin'), (req, res) => {
  const opp = db.prepare('SELECT * FROM opportunities WHERE id = ?').get(req.params.id);
  if (!opp) return res.status(404).json({ error: 'Opportunity not found' });
  if (opp.created_by !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'You can only edit your own opportunities' });
  }
  const err = validateOpportunity(req.body);
  if (err) return res.status(400).json({ error: err });
  const b = req.body;
  // Content changes invalidate the previous QA decision.
  db.prepare(`
    UPDATE opportunities SET title=?, description=?, type=?, specialty=?, site=?, schedule=?, capacity=?, audience=?,
      lead_name=?, lead_email=?, active=?, qa_status='pending', qa_reviewer_id=NULL, qa_comments=NULL, qa_date=NULL,
      updated_at=datetime('now')
    WHERE id=?
  `).run(b.title, b.description || null, b.type, b.specialty || null, b.site || null, b.schedule || null,
    b.capacity || null, b.audience || null, b.lead_name || null, b.lead_email || null,
    b.active === false ? 0 : 1, opp.id);
  setOppCaps(opp.id, b.capability_ids);
  res.json({ ok: true, message: 'Updated and resubmitted for QA review' });
});

// ---------------------------------------------------------------------------
// QA review
// ---------------------------------------------------------------------------
router.get('/qa/queue', requireRole('qa', 'admin'), (req, res) => {
  const rows = db.prepare(`${oppWithMeta} WHERE o.qa_status = 'pending' ORDER BY o.updated_at ASC`).all();
  res.json({ opportunities: rows.map(attachCapabilities) });
});

router.post('/qa/:id/review', requireRole('qa', 'admin'), (req, res) => {
  const { decision, comments } = req.body || {};
  if (!['approved', 'rejected'].includes(decision)) return res.status(400).json({ error: 'Decision must be approved or rejected' });
  if (decision === 'rejected' && !comments) return res.status(400).json({ error: 'Comments are required when rejecting' });
  const opp = db.prepare('SELECT id FROM opportunities WHERE id = ?').get(req.params.id);
  if (!opp) return res.status(404).json({ error: 'Opportunity not found' });
  db.prepare(`
    UPDATE opportunities SET qa_status = ?, qa_reviewer_id = ?, qa_comments = ?, qa_date = date('now') WHERE id = ?
  `).run(decision, req.user.id, comments || null, opp.id);
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Trainee portfolio logs & gap analysis
// ---------------------------------------------------------------------------
router.get('/logs', requireAuth, (req, res) => {
  const rows = db.prepare(`
    SELECT l.*, cap.code AS capability_code, cap.title AS capability_title,
      cur.name AS curriculum_name, o.title AS opportunity_title
    FROM portfolio_logs l
    JOIN capabilities cap ON cap.id = l.capability_id
    JOIN curricula cur ON cur.id = cap.curriculum_id
    LEFT JOIN opportunities o ON o.id = l.opportunity_id
    WHERE l.user_id = ? ORDER BY l.log_date DESC, l.id DESC
  `).all(req.user.id);
  res.json({ logs: rows });
});

router.post('/logs', requireAuth, (req, res) => {
  const { capability_id, opportunity_id, log_date, title, reflection } = req.body || {};
  if (!capability_id || !log_date || !title) return res.status(400).json({ error: 'Capability, date and title are required' });
  const r = db.prepare(
    'INSERT INTO portfolio_logs (user_id, capability_id, opportunity_id, log_date, title, reflection) VALUES (?,?,?,?,?,?)'
  ).run(req.user.id, capability_id, opportunity_id || null, log_date, title, reflection || null);
  res.json({ id: r.lastInsertRowid });
});

router.delete('/logs/:id', requireAuth, (req, res) => {
  db.prepare('DELETE FROM portfolio_logs WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  res.json({ ok: true });
});

// Per-capability view for one trainee: their evidence count vs available provision.
router.get('/gaps', requireAuth, (req, res) => {
  const curriculumId = req.query.curriculum_id || req.user.curriculum_id;
  if (!curriculumId) return res.status(400).json({ error: 'Choose a curriculum first' });
  const rows = db.prepare(`
    SELECT cap.*,
      (SELECT COUNT(*) FROM portfolio_logs l WHERE l.capability_id = cap.id AND l.user_id = ?) AS my_log_count,
      (SELECT COUNT(*) FROM opportunity_capabilities oc
         JOIN opportunities o ON o.id = oc.opportunity_id
         WHERE oc.capability_id = cap.id AND o.qa_status = 'approved' AND o.active = 1) AS opportunity_count
    FROM capabilities cap WHERE cap.curriculum_id = ? ORDER BY cap.domain, cap.id
  `).all(req.user.id, curriculumId);
  res.json({ capabilities: rows });
});

// ---------------------------------------------------------------------------
// Manager provision report
// ---------------------------------------------------------------------------
router.get('/reports/provision', requireRole('manager', 'admin', 'qa'), (req, res) => {
  const curricula = db.prepare('SELECT * FROM curricula ORDER BY name').all();
  const report = curricula.map(cur => {
    const capabilities = db.prepare(`
      SELECT cap.id, cap.code, cap.domain, cap.title,
        (SELECT COUNT(*) FROM opportunity_capabilities oc
           JOIN opportunities o ON o.id = oc.opportunity_id
           WHERE oc.capability_id = cap.id AND o.qa_status = 'approved' AND o.active = 1) AS approved_count,
        (SELECT COUNT(*) FROM opportunity_capabilities oc
           JOIN opportunities o ON o.id = oc.opportunity_id
           WHERE oc.capability_id = cap.id AND o.qa_status = 'pending') AS pending_count,
        (SELECT COUNT(*) FROM portfolio_logs l WHERE l.capability_id = cap.id) AS trainee_log_count
      FROM capabilities cap WHERE cap.curriculum_id = ? ORDER BY cap.domain, cap.id
    `).all(cur.id);
    const gaps = capabilities.filter(c => c.approved_count === 0).length;
    return { curriculum: cur, capabilities, total: capabilities.length, gaps };
  });
  const totals = {
    opportunities: db.prepare("SELECT COUNT(*) AS n FROM opportunities WHERE qa_status = 'approved' AND active = 1").get().n,
    pending_qa: db.prepare("SELECT COUNT(*) AS n FROM opportunities WHERE qa_status = 'pending'").get().n,
    trainees: db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'trainee' AND status = 'active'").get().n,
    logs: db.prepare('SELECT COUNT(*) AS n FROM portfolio_logs').get().n,
  };
  res.json({ report, totals });
});

// ---------------------------------------------------------------------------
// Admin: user management
// ---------------------------------------------------------------------------
router.get('/users', requireRole('admin'), (req, res) => {
  const rows = db.prepare(`
    SELECT id, name, email, role, status, grade, specialty, created_at FROM users
    ORDER BY CASE status WHEN 'pending' THEN 0 ELSE 1 END, created_at DESC
  `).all();
  res.json({ users: rows });
});

router.put('/users/:id', requireRole('admin'), (req, res) => {
  const { role, status } = req.body || {};
  const validRoles = ['trainee', 'educator', 'manager', 'qa', 'admin'];
  const validStatus = ['pending', 'active', 'disabled'];
  if (!validRoles.includes(role) || !validStatus.includes(status)) {
    return res.status(400).json({ error: 'Invalid role or status' });
  }
  const target = db.prepare('SELECT id FROM users WHERE id = ?').get(req.params.id);
  if (!target) return res.status(404).json({ error: 'User not found' });
  if (target.id === req.user.id && (role !== 'admin' || status !== 'active')) {
    return res.status(400).json({ error: 'You cannot demote or disable your own account' });
  }
  db.prepare('UPDATE users SET role = ?, status = ? WHERE id = ?').run(role, status, target.id);
  res.json({ ok: true });
});

module.exports = router;
