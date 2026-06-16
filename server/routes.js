const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const db = require('./db');
const { parseCsv, toCsv } = require('./csv');
const { sendMail } = require('./mailer');

const router = express.Router();

// Email helpers ------------------------------------------------------------
function adminEmails() {
  return db.prepare("SELECT email FROM users WHERE role = 'admin' AND status = 'active'").all().map((u) => u.email);
}
function qaEmails() {
  return db.prepare("SELECT email FROM users WHERE role IN ('qa','admin') AND status = 'active'").all().map((u) => u.email);
}

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
  sendMail(adminEmails(), 'New account awaiting approval',
    `${name.trim()} (${email.trim()}) has requested a ${role} account and is awaiting approval.`);
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

// Self-service password change. Clears any admin-forced change flag.
router.post('/auth/change-password', requireAuth, (req, res) => {
  const { current_password, new_password } = req.body || {};
  if (!new_password || new_password.length < 8) return res.status(400).json({ error: 'New password must be at least 8 characters' });
  const fresh = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  // Users forced to change at next login don't need their (temporary) current password.
  if (!fresh.must_change_password) {
    if (!bcrypt.compareSync(current_password || '', fresh.password_hash)) {
      return res.status(400).json({ error: 'Your current password is incorrect' });
    }
  }
  db.prepare('UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?')
    .run(bcrypt.hashSync(new_password, 10), req.user.id);
  res.json({ ok: true, user: publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id)) });
});

// Admin resets another user's password to a temporary one (forced change at next login).
router.post('/users/:id/reset-password', requireRole('admin'), (req, res) => {
  const target = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!target) return res.status(404).json({ error: 'User not found' });
  const temp = 'cmt-' + crypto.randomBytes(4).toString('hex'); // e.g. cmt-9f3a2b71
  db.prepare('UPDATE users SET password_hash = ?, must_change_password = 1 WHERE id = ?')
    .run(bcrypt.hashSync(temp, 10), target.id);
  sendMail(target.email, 'Your password has been reset',
    `An administrator has reset your password. Sign in with the temporary password "${temp}" and you will be asked to choose a new one.`);
  res.json({ ok: true, temporary_password: temp });
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
    (SELECT COUNT(*) FROM opportunity_capabilities oc WHERE oc.opportunity_id = o.id) AS capability_count,
    (SELECT COUNT(*) FROM ratings r WHERE r.opportunity_id = o.id) AS rating_count,
    (SELECT ROUND(AVG(r.rating), 1) FROM ratings r WHERE r.opportunity_id = o.id) AS rating_avg
  FROM opportunities o JOIN users u ON u.id = o.created_by
`;

// Only allow http(s) booking links - never javascript:/data: etc.
function safeUrl(u) {
  if (!u) return null;
  const s = String(u).trim();
  if (/^https?:\/\//i.test(s)) return s;
  if (/^[\w.-]+\.[a-z]{2,}(\/|$|\?)/i.test(s)) return 'https://' + s; // bare domain -> https
  return null;
}

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
  opp.is_bookmarked = !!db.prepare('SELECT 1 FROM bookmarks WHERE user_id = ? AND opportunity_id = ?').get(req.user.id, opp.id);
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
    INSERT INTO opportunities (title, description, type, specialty, site, schedule, capacity, audience, lead_name, lead_email, booking_url, created_by)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(b.title, b.description || null, b.type, b.specialty || null, b.site || null, b.schedule || null,
    b.capacity || null, b.audience || null, b.lead_name || null, b.lead_email || null, safeUrl(b.booking_url), req.user.id);
  setOppCaps(r.lastInsertRowid, b.capability_ids);
  sendMail(qaEmails(), 'New learning opportunity for QA review',
    `"${b.title}" was submitted by ${req.user.name} and is awaiting QA review.`);
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
      lead_name=?, lead_email=?, booking_url=?, active=?, qa_status='pending', qa_reviewer_id=NULL, qa_comments=NULL, qa_date=NULL,
      updated_at=datetime('now')
    WHERE id=?
  `).run(b.title, b.description || null, b.type, b.specialty || null, b.site || null, b.schedule || null,
    b.capacity || null, b.audience || null, b.lead_name || null, b.lead_email || null, safeUrl(b.booking_url),
    b.active === false ? 0 : 1, opp.id);
  setOppCaps(opp.id, b.capability_ids);
  sendMail(qaEmails(), 'Updated learning opportunity for QA review',
    `"${b.title}" was updated by ${req.user.name} and is awaiting QA review.`);
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
  const opp = db.prepare(`
    SELECT o.id, o.title, u.email AS creator_email FROM opportunities o JOIN users u ON u.id = o.created_by WHERE o.id = ?
  `).get(req.params.id);
  if (!opp) return res.status(404).json({ error: 'Opportunity not found' });
  db.prepare(`
    UPDATE opportunities SET qa_status = ?, qa_reviewer_id = ?, qa_comments = ?, qa_date = date('now') WHERE id = ?
  `).run(decision, req.user.id, comments || null, opp.id);
  sendMail(opp.creator_email, `Your learning opportunity was ${decision}`,
    `"${opp.title}" has been ${decision} by the QA team.` + (comments ? `\n\nReviewer comments: ${comments}` : ''));
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Bookmarks (any signed-in user, but aimed at trainees building a shortlist)
// ---------------------------------------------------------------------------
router.get('/bookmarks', requireAuth, (req, res) => {
  const rows = db.prepare(`
    ${oppWithMeta}
    WHERE o.id IN (SELECT opportunity_id FROM bookmarks WHERE user_id = ?)
      AND o.qa_status = 'approved' AND o.active = 1
    ORDER BY o.title
  `).all(req.user.id);
  res.json({ opportunities: rows });
});

router.post('/opportunities/:id/bookmark', requireAuth, (req, res) => {
  const opp = db.prepare('SELECT id FROM opportunities WHERE id = ?').get(req.params.id);
  if (!opp) return res.status(404).json({ error: 'Opportunity not found' });
  const existing = db.prepare('SELECT 1 FROM bookmarks WHERE user_id = ? AND opportunity_id = ?').get(req.user.id, opp.id);
  if (existing) {
    db.prepare('DELETE FROM bookmarks WHERE user_id = ? AND opportunity_id = ?').run(req.user.id, opp.id);
    res.json({ bookmarked: false });
  } else {
    db.prepare('INSERT INTO bookmarks (user_id, opportunity_id) VALUES (?, ?)').run(req.user.id, opp.id);
    res.json({ bookmarked: true });
  }
});

// ---------------------------------------------------------------------------
// Ratings (one per user per opportunity; upsert)
// ---------------------------------------------------------------------------
router.get('/opportunities/:id/ratings', requireAuth, (req, res) => {
  const ratings = db.prepare(`
    SELECT r.rating, r.comment, r.updated_at, u.name AS user_name
    FROM ratings r JOIN users u ON u.id = r.user_id
    WHERE r.opportunity_id = ? AND (r.comment IS NOT NULL AND r.comment != '')
    ORDER BY r.updated_at DESC
  `).all(req.params.id);
  const mine = db.prepare('SELECT rating, comment FROM ratings WHERE opportunity_id = ? AND user_id = ?')
    .get(req.params.id, req.user.id) || null;
  res.json({ ratings, mine });
});

router.post('/opportunities/:id/rating', requireAuth, (req, res) => {
  const rating = Number(req.body && req.body.rating);
  const comment = (req.body && req.body.comment) || null;
  if (!(rating >= 1 && rating <= 5)) return res.status(400).json({ error: 'Rating must be between 1 and 5' });
  const opp = db.prepare("SELECT id FROM opportunities WHERE id = ? AND qa_status = 'approved'").get(req.params.id);
  if (!opp) return res.status(404).json({ error: 'Opportunity not found' });
  db.prepare(`
    INSERT INTO ratings (user_id, opportunity_id, rating, comment) VALUES (?,?,?,?)
    ON CONFLICT(user_id, opportunity_id) DO UPDATE SET rating = excluded.rating, comment = excluded.comment, updated_at = datetime('now')
  `).run(req.user.id, opp.id, rating, comment);
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

// ---------------------------------------------------------------------------
// Bulk CSV import (admin). Body: { csv: "<file text>" }. Each importer is
// lenient and returns a summary so the admin can see what happened.
// ---------------------------------------------------------------------------
const STAGES = ['undergraduate', 'foundation', 'core', 'higher', 'consultant'];

router.post('/import/curricula', requireRole('admin'), (req, res) => {
  let rows;
  try { rows = parseCsv((req.body && req.body.csv) || ''); }
  catch (e) { return res.status(400).json({ error: 'Could not read the CSV: ' + e.message }); }
  if (rows.length === 0) return res.status(400).json({ error: 'No rows found. Check the file has a header row and at least one data row.' });

  const findCur = db.prepare('SELECT id FROM curricula WHERE name = ?');
  const insCur = db.prepare('INSERT INTO curricula (name, body, stage, description) VALUES (?,?,?,?)');
  const findCap = db.prepare('SELECT id FROM capabilities WHERE curriculum_id = ? AND code = ?');
  const insCap = db.prepare('INSERT INTO capabilities (curriculum_id, code, domain, title, description) VALUES (?,?,?,?,?)');

  let curriculaCreated = 0, capsCreated = 0, skipped = 0;
  const errors = [];
  rows.forEach((row, i) => {
    const name = row.curriculum_name || row.curriculum || row.name;
    const code = row.code, title = row.title;
    if (!name || !code || !title) { errors.push(`Row ${i + 2}: needs curriculum_name, code and title`); return; }
    let cur = findCur.get(name);
    if (!cur) {
      const stage = STAGES.includes((row.stage || '').toLowerCase()) ? row.stage.toLowerCase() : 'higher';
      const id = insCur.run(name, row.body || null, stage, row.description_curriculum || row.curriculum_description || null).lastInsertRowid;
      cur = { id };
      curriculaCreated++;
    }
    if (findCap.get(cur.id, code)) { skipped++; return; } // capability already exists
    insCap.run(cur.id, code, row.domain || null, title, row.description || null);
    capsCreated++;
  });
  res.json({ summary: { curriculaCreated, capabilitiesCreated: capsCreated, skipped, errors } });
});

router.post('/import/users', requireRole('admin'), (req, res) => {
  let rows;
  try { rows = parseCsv((req.body && req.body.csv) || ''); }
  catch (e) { return res.status(400).json({ error: 'Could not read the CSV: ' + e.message }); }
  if (rows.length === 0) return res.status(400).json({ error: 'No rows found. Check the file has a header row.' });

  const validRoles = ['trainee', 'educator', 'manager', 'qa', 'admin'];
  const validStatus = ['pending', 'active', 'disabled'];
  const exists = db.prepare('SELECT id FROM users WHERE email = ?');
  const ins = db.prepare(`INSERT INTO users (name, email, password_hash, role, status, grade, specialty, must_change_password) VALUES (?,?,?,?,?,?,?,?)`);

  let created = 0, skipped = 0;
  const errors = [], tempPasswords = [];
  rows.forEach((row, i) => {
    const name = row.name, email = row.email;
    if (!name || !email) { errors.push(`Row ${i + 2}: needs name and email`); return; }
    if (exists.get(email.trim())) { skipped++; return; }
    const role = validRoles.includes((row.role || '').toLowerCase()) ? row.role.toLowerCase() : 'trainee';
    const status = validStatus.includes((row.status || '').toLowerCase()) ? row.status.toLowerCase() : 'active';
    let mustChange = 0, password = row.password;
    if (!password || password.length < 8) { password = 'cmt-' + crypto.randomBytes(4).toString('hex'); mustChange = 1; }
    ins.run(name.trim(), email.trim(), bcrypt.hashSync(password, 10), role, status, row.grade || null, row.specialty || null, mustChange);
    if (mustChange) tempPasswords.push({ email: email.trim(), temporary_password: password });
    created++;
  });
  res.json({ summary: { created, skipped, errors }, tempPasswords });
});

function findCapabilityToken(token) {
  const t = (token || '').trim();
  if (!t) return null;
  if (t.includes('::')) {
    const [curName, code] = t.split('::').map((s) => s.trim());
    return db.prepare(`SELECT cap.id FROM capabilities cap JOIN curricula cur ON cur.id = cap.curriculum_id
      WHERE cap.code = ? AND cur.name LIKE ?`).get(code, `%${curName}%`);
  }
  const matches = db.prepare('SELECT id FROM capabilities WHERE code = ?').all(t);
  return matches.length === 1 ? matches[0] : null; // ambiguous codes need Curriculum::Code form
}

router.post('/import/opportunities', requireRole('admin'), (req, res) => {
  let rows;
  try { rows = parseCsv((req.body && req.body.csv) || ''); }
  catch (e) { return res.status(400).json({ error: 'Could not read the CSV: ' + e.message }); }
  if (rows.length === 0) return res.status(400).json({ error: 'No rows found. Check the file has a header row.' });

  const ins = db.prepare(`INSERT INTO opportunities
    (title, description, type, specialty, site, schedule, capacity, audience, lead_name, lead_email, booking_url, created_by, qa_status, qa_reviewer_id, qa_date)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);

  let created = 0; const errors = [];
  rows.forEach((row, i) => {
    if (!row.title || !row.type) { errors.push(`Row ${i + 2}: needs title and type`); return; }
    const tokens = (row.capabilities || row.capability_codes || '').split(/[;|]/).map((s) => s.trim()).filter(Boolean);
    const capIds = []; const unmatched = [];
    tokens.forEach((tk) => { const c = findCapabilityToken(tk); c ? capIds.push(c.id) : unmatched.push(tk); });
    if (capIds.length === 0) { errors.push(`Row ${i + 2} ("${row.title}"): no capabilities matched (${unmatched.join(', ') || 'none provided'})`); return; }
    const approved = (row.qa_status || '').toLowerCase() === 'approved';
    const id = ins.run(row.title, row.description || null, row.type, row.specialty || null, row.site || null,
      row.schedule || null, row.capacity || null, row.audience || null, row.lead_name || null, row.lead_email || null,
      safeUrl(row.booking_url), req.user.id, approved ? 'approved' : 'pending', approved ? req.user.id : null,
      approved ? new Date().toISOString().slice(0, 10) : null).lastInsertRowid;
    setOppCaps(id, capIds);
    if (unmatched.length) errors.push(`Row ${i + 2} ("${row.title}"): imported, but these capabilities were not found: ${unmatched.join(', ')}`);
    created++;
  });
  res.json({ summary: { created, errors } });
});

// ---------------------------------------------------------------------------
// CSV exports (download links; rely on the session cookie)
// ---------------------------------------------------------------------------
function sendCsv(res, filename, csv) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(csv);
}

router.get('/reports/provision.csv', requireRole('manager', 'admin', 'qa'), (req, res) => {
  const rows = db.prepare(`
    SELECT cur.name AS curriculum, cur.stage, cap.code, cap.domain, cap.title,
      (SELECT COUNT(*) FROM opportunity_capabilities oc JOIN opportunities o ON o.id = oc.opportunity_id
         WHERE oc.capability_id = cap.id AND o.qa_status = 'approved' AND o.active = 1) AS approved_provision,
      (SELECT COUNT(*) FROM opportunity_capabilities oc JOIN opportunities o ON o.id = oc.opportunity_id
         WHERE oc.capability_id = cap.id AND o.qa_status = 'pending') AS pending_provision,
      (SELECT COUNT(*) FROM portfolio_logs l WHERE l.capability_id = cap.id) AS trainee_logs
    FROM capabilities cap JOIN curricula cur ON cur.id = cap.curriculum_id
    ORDER BY cur.name, cap.domain, cap.id
  `).all();
  const cols = [
    { key: 'curriculum', label: 'Curriculum' }, { key: 'stage', label: 'Stage' },
    { key: 'code', label: 'Capability code' }, { key: 'domain', label: 'Domain' }, { key: 'title', label: 'Capability' },
    { key: 'approved_provision', label: 'Approved provision' }, { key: 'pending_provision', label: 'Pending provision' },
    { key: 'trainee_logs', label: 'Trainee logs' },
  ];
  sendCsv(res, 'provision-report.csv', toCsv(cols, rows));
});

router.get('/gaps.csv', requireAuth, (req, res) => {
  const curriculumId = req.query.curriculum_id || req.user.curriculum_id;
  if (!curriculumId) return res.status(400).json({ error: 'Choose a curriculum first' });
  const rows = db.prepare(`
    SELECT cap.code, cap.domain, cap.title,
      (SELECT COUNT(*) FROM portfolio_logs l WHERE l.capability_id = cap.id AND l.user_id = ?) AS my_evidence,
      (SELECT COUNT(*) FROM opportunity_capabilities oc JOIN opportunities o ON o.id = oc.opportunity_id
         WHERE oc.capability_id = cap.id AND o.qa_status = 'approved' AND o.active = 1) AS opportunities_available
    FROM capabilities cap WHERE cap.curriculum_id = ? ORDER BY cap.domain, cap.id
  `).all(req.user.id, curriculumId);
  const cols = [
    { key: 'code', label: 'Capability code' }, { key: 'domain', label: 'Domain' }, { key: 'title', label: 'Capability' },
    { key: 'my_evidence', label: 'My evidence count' }, { key: 'opportunities_available', label: 'Opportunities available' },
  ];
  sendCsv(res, 'my-gaps.csv', toCsv(cols, rows));
});

module.exports = router;
