// Uses Node's built-in SQLite (node:sqlite, Node 22.5+) - no native build step,
// which keeps deployment to a locked-down NHS server simple.
const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

// DATA_DIR lets the SQLite database live on a mounted persistent volume in
// production (e.g. a Railway volume); falls back to ./data for local dev.
const dataDir = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new DatabaseSync(path.join(dataDir, 'app.db'));
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'trainee',          -- trainee | educator | manager | qa | admin
  status TEXT NOT NULL DEFAULT 'pending',        -- pending | active | disabled
  grade TEXT,                                    -- e.g. FY1, IMT2, ST5, Consultant
  specialty TEXT,
  curriculum_id INTEGER REFERENCES curricula(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS curricula (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  body TEXT,                                     -- awarding/regulatory body, e.g. GMC, UKFPO, JRCPTB
  stage TEXT NOT NULL,                           -- undergraduate | foundation | core | higher | consultant
  description TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS capabilities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  curriculum_id INTEGER NOT NULL REFERENCES curricula(id) ON DELETE CASCADE,
  code TEXT NOT NULL,                            -- e.g. "CiP 1", "FPC 9", "GPC 6"
  domain TEXT,                                   -- grouping within the curriculum
  title TEXT NOT NULL,
  description TEXT
);

CREATE TABLE IF NOT EXISTS opportunities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT,
  type TEXT NOT NULL,                            -- e.g. Simulation, Clinic, Course, Teaching session
  specialty TEXT,
  site TEXT,                                     -- hospital site / location
  schedule TEXT,                                 -- free text: "Weekly, Tuesdays 13:00"
  capacity TEXT,
  audience TEXT,                                 -- intended grades/levels
  lead_name TEXT,
  lead_email TEXT,
  created_by INTEGER NOT NULL REFERENCES users(id),
  qa_status TEXT NOT NULL DEFAULT 'pending',     -- pending | approved | rejected
  qa_reviewer_id INTEGER REFERENCES users(id),
  qa_comments TEXT,
  qa_date TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS opportunity_capabilities (
  opportunity_id INTEGER NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
  capability_id INTEGER NOT NULL REFERENCES capabilities(id) ON DELETE CASCADE,
  PRIMARY KEY (opportunity_id, capability_id)
);

CREATE TABLE IF NOT EXISTS portfolio_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  capability_id INTEGER NOT NULL REFERENCES capabilities(id) ON DELETE CASCADE,
  opportunity_id INTEGER REFERENCES opportunities(id) ON DELETE SET NULL,
  log_date TEXT NOT NULL,
  title TEXT NOT NULL,
  reflection TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS bookmarks (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  opportunity_id INTEGER NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, opportunity_id)
);

CREATE TABLE IF NOT EXISTS ratings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  opportunity_id INTEGER NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL,                        -- 1..5 stars
  comment TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (user_id, opportunity_id)
);

CREATE TABLE IF NOT EXISTS schema_migrations (
  key TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- The provision report and the trainee gap analysis run a correlated subquery
-- per capability, each one counting rows in these tables by foreign key. Without
-- these indexes every count is a full table scan, and the report is the slowest
-- page in the app once a Trust has a few thousand portfolio entries.
CREATE INDEX IF NOT EXISTS idx_capabilities_curriculum ON capabilities(curriculum_id);
CREATE INDEX IF NOT EXISTS idx_opp_caps_capability ON opportunity_capabilities(capability_id);
CREATE INDEX IF NOT EXISTS idx_logs_capability ON portfolio_logs(capability_id);
CREATE INDEX IF NOT EXISTS idx_logs_user ON portfolio_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_ratings_opportunity ON ratings(opportunity_id);
CREATE INDEX IF NOT EXISTS idx_opportunities_created_by ON opportunities(created_by);
CREATE INDEX IF NOT EXISTS idx_opportunities_qa_status ON opportunities(qa_status);
`);

// ---------------------------------------------------------------------------
// Migration helpers. The production database already exists on a mounted
// volume, so new columns and one-off data changes must be applied in place -
// CREATE TABLE IF NOT EXISTS never alters an existing table.
// ---------------------------------------------------------------------------
function addColumnIfMissing(table, column, definition) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

function runOnce(key, fn) {
  const done = db.prepare('SELECT 1 FROM schema_migrations WHERE key = ?').get(key);
  if (done) return;
  fn();
  db.prepare('INSERT INTO schema_migrations (key) VALUES (?)').run(key);
}

// Columns added after the original release.
addColumnIfMissing('opportunities', 'booking_url', 'TEXT');
addColumnIfMissing('users', 'must_change_password', 'INTEGER NOT NULL DEFAULT 0');

// ---------------------------------------------------------------------------
// Seed data. Runs once, on an empty database. Curriculum content below is an
// ABRIDGED SAMPLE for demonstration - verify against the official published
// curricula before clinical-education use.
//
// The demo accounts all share a published password, so seeding is opt-in via
// CMT_SEED_DEMO. It defaults ON for a source checkout (`npm start`), which is
// the behaviour the README describes, and is turned OFF in the Docker image so
// that a container published to a network never boots with known credentials.
// ---------------------------------------------------------------------------
function seed() {
  const userCount = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
  if (userCount > 0) return;

  const hash = bcrypt.hashSync('demo1234', 10);
  const insertUser = db.prepare(
    `INSERT INTO users (name, email, password_hash, role, status, grade, specialty) VALUES (?,?,?,?,?,?,?)`
  );
  const admin = insertUser.run('Demo Admin', 'admin@demo.nhs.uk', hash, 'admin', 'active', null, null);
  const educator = insertUser.run('Demo Educator', 'educator@demo.nhs.uk', hash, 'educator', 'active', 'Consultant', 'Acute Medicine');
  insertUser.run('Demo Manager', 'manager@demo.nhs.uk', hash, 'manager', 'active', null, null);
  const qa = insertUser.run('Demo QA Reviewer', 'qa@demo.nhs.uk', hash, 'qa', 'active', null, null);
  const trainee = insertUser.run('Demo Trainee', 'trainee@demo.nhs.uk', hash, 'trainee', 'active', 'IMT1', 'Internal Medicine');

  const insertCurriculum = db.prepare(
    `INSERT INTO curricula (name, body, stage, description) VALUES (?,?,?,?)`
  );
  const insertCap = db.prepare(
    `INSERT INTO capabilities (curriculum_id, code, domain, title, description) VALUES (?,?,?,?,?)`
  );

  // --- GMC Generic Professional Capabilities (sample) ---
  const gpc = insertCurriculum.run(
    'Generic Professional Capabilities (sample)', 'GMC', 'higher',
    'GMC framework of professional capabilities common to all postgraduate curricula. Sample content - verify against the official framework.'
  ).lastInsertRowid;
  [
    ['GPC 1', 'Professional values and behaviours', 'Acts with honesty and integrity, maintains trust, and demonstrates compassion in all interactions.'],
    ['GPC 2', 'Professional skills', 'Practitioner skills including communication, consultation, history-taking, examination and prescribing.'],
    ['GPC 3', 'Professional knowledge', 'Knowledge of professional requirements, national legislation and the health service within which the doctor works.'],
    ['GPC 4', 'Health promotion and illness prevention', 'Applies the principles of health promotion and illness prevention in clinical practice.'],
    ['GPC 5', 'Leadership and team working', 'Works effectively within teams and demonstrates appropriate leadership behaviours.'],
    ['GPC 6', 'Patient safety and quality improvement', 'Contributes to and promotes patient safety; engages in quality improvement activity.'],
    ['GPC 7', 'Safeguarding vulnerable groups', 'Recognises and takes appropriate action to safeguard children, young people and vulnerable adults.'],
    ['GPC 8', 'Education and training', 'Plans and delivers effective teaching, training and assessment; supports learners.'],
    ['GPC 9', 'Research and scholarship', 'Applies evidence to practice and engages in research and scholarly activity.'],
  ].forEach(([code, title, desc]) => insertCap.run(gpc, code, 'Generic Professional Capabilities', title, desc));

  // --- UKMLA / undergraduate (sample) ---
  const ukmla = insertCurriculum.run(
    'UKMLA Content Map (sample)', 'GMC', 'undergraduate',
    'Sample outcomes drawn from the Medical Licensing Assessment content map for undergraduate education. Abridged for demonstration.'
  ).lastInsertRowid;
  [
    ['MLA-CP 1', 'Clinical and professional capabilities', 'Assessing a patient: history and examination', 'Takes a focused history and performs an appropriate physical examination.'],
    ['MLA-CP 2', 'Clinical and professional capabilities', 'Formulating a differential diagnosis', 'Synthesises clinical findings to generate and prioritise differential diagnoses.'],
    ['MLA-CP 3', 'Clinical and professional capabilities', 'Ordering and interpreting investigations', 'Selects appropriate investigations and interprets common results.'],
    ['MLA-CP 4', 'Clinical and professional capabilities', 'Safe prescribing', 'Prescribes commonly used medications safely, including calculations and monitoring.'],
    ['MLA-CP 5', 'Clinical and professional capabilities', 'Recognising the deteriorating patient', 'Identifies and initiates management of the acutely unwell or deteriorating patient.'],
    ['MLA-CP 6', 'Clinical and professional capabilities', 'Communicating with patients and colleagues', 'Communicates effectively and sensitively with patients, relatives and the healthcare team.'],
    ['MLA-PK 1', 'Professional knowledge', 'Ethical and legal principles', 'Applies ethical reasoning and relevant law to clinical scenarios including consent and capacity.'],
    ['MLA-PK 2', 'Professional knowledge', 'Patient safety and quality', 'Understands human factors, raising concerns, and the principles of quality improvement.'],
  ].forEach(([code, domain, title, desc]) => insertCap.run(ukmla, code, domain, title, desc));

  // --- UK Foundation Programme (sample) ---
  const fp = insertCurriculum.run(
    'UK Foundation Programme Curriculum (sample)', 'UKFPO', 'foundation',
    'Sample of the Foundation Professional Capabilities (FPCs) grouped under the three Higher Level Outcomes. Abridged for demonstration.'
  ).lastInsertRowid;
  [
    ['FPC 1', 'HLO 1: An accountable, capable and compassionate doctor', 'Clinical assessment', 'Performs an accurate clinical assessment: history, examination and formulation of a management plan.'],
    ['FPC 2', 'HLO 1: An accountable, capable and compassionate doctor', 'Clinical prioritisation', 'Recognises and prioritises the acutely unwell and deteriorating patient.'],
    ['FPC 3', 'HLO 1: An accountable, capable and compassionate doctor', 'Holistic planning', 'Develops patient-centred management plans incorporating long-term conditions and psychosocial context.'],
    ['FPC 4', 'HLO 1: An accountable, capable and compassionate doctor', 'Communication and consultation', 'Communicates effectively with patients, relatives and colleagues, including in difficult conversations.'],
    ['FPC 5', 'HLO 1: An accountable, capable and compassionate doctor', 'Continuity of care', 'Delivers safe ongoing care including handover, documentation and discharge planning.'],
    ['FPC 6', 'HLO 2: A valuable member of the healthcare workforce', 'Sharing the vision', 'Works within NHS structures and contributes to the goals of the organisation and wider health service.'],
    ['FPC 7', 'HLO 2: A valuable member of the healthcare workforce', 'Fitness to practise', 'Maintains personal health and wellbeing and practises sustainably and professionally.'],
    ['FPC 8', 'HLO 2: A valuable member of the healthcare workforce', 'Upholding values', 'Acts in accordance with GMC guidance, demonstrating honesty, integrity and respect.'],
    ['FPC 9', 'HLO 2: A valuable member of the healthcare workforce', 'Quality improvement', 'Participates in quality improvement and clinical governance activity.'],
    ['FPC 10', 'HLO 3: A professional, responsible for own practice and development', 'Teaching the teacher', 'Delivers teaching and supports the learning of others.'],
    ['FPC 11', 'HLO 3: A professional, responsible for own practice and development', 'Self-directed learning', 'Engages with the e-portfolio, supervision and curriculum to direct own learning.'],
    ['FPC 12', 'HLO 3: A professional, responsible for own practice and development', 'Evidence-based practice', 'Applies evidence and guidelines to clinical decision-making.'],
    ['FPC 13', 'HLO 3: A professional, responsible for own practice and development', 'Safe prescribing', 'Prescribes, monitors and reviews medications safely including high-risk drugs.'],
  ].forEach(([code, domain, title, desc]) => insertCap.run(fp, code, domain, title, desc));

  // --- Internal Medicine Training stage 1 (sample) ---
  const imt = insertCurriculum.run(
    'Internal Medicine Training - Stage 1 (sample)', 'JRCPTB', 'core',
    'Sample Capabilities in Practice (CiPs) from the IMT curriculum. Abridged for demonstration.'
  ).lastInsertRowid;
  [
    ['CiP 1', 'Clinical CiPs', 'Managing an acute unselected take', 'Manages the assessment, investigation and initial treatment of acutely unwell medical patients on the unselected take.'],
    ['CiP 2', 'Clinical CiPs', 'Managing the acute care of inpatients', 'Provides continuity of care to medical inpatients, including management of comorbidities and deterioration.'],
    ['CiP 3', 'Clinical CiPs', 'Outpatient and ambulatory care', 'Manages patients in outpatient clinics, ambulatory and community settings, including referrals.'],
    ['CiP 4', 'Clinical CiPs', 'Managing medical problems in other specialties', 'Provides medical advice and review for patients under the care of other specialties.'],
    ['CiP 5', 'Clinical CiPs', 'Procedural skills', 'Performs the practical procedures required by the curriculum safely, with appropriate supervision.'],
    ['CiP 6', 'Clinical CiPs', 'End of life care', 'Recognises the dying patient and manages end of life and palliative care appropriately.'],
    ['CiP 7', 'Clinical CiPs', 'Resuscitation', 'Leads and participates in resuscitation, including decisions about escalation and CPR status.'],
    ['CiP 8', 'Generic CiPs', 'Quality improvement and patient safety', 'Engages in quality improvement, audit and incident review to improve patient care.'],
  ].forEach(([code, domain, title, desc]) => insertCap.run(imt, code, domain, title, desc));

  // --- Sample learning opportunities ---
  const insertOpp = db.prepare(`
    INSERT INTO opportunities (title, description, type, specialty, site, schedule, capacity, audience,
      lead_name, lead_email, created_by, qa_status, qa_reviewer_id, qa_date)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `);
  const linkCap = db.prepare(
    `INSERT INTO opportunity_capabilities (opportunity_id, capability_id) VALUES (?,?)`
  );
  const capId = (curriculum, code) =>
    db.prepare('SELECT id FROM capabilities WHERE curriculum_id = ? AND code = ?').get(curriculum, code).id;

  const opps = [
    {
      title: 'Acute Medicine Simulation: The Deteriorating Patient',
      description: 'High-fidelity simulation covering recognition and initial management of the deteriorating ward patient, with structured debrief on human factors and escalation.',
      type: 'Simulation', specialty: 'Acute Medicine', site: 'Education Centre, Main Site',
      schedule: 'Monthly, first Wednesday 09:00-13:00', capacity: '8 per session',
      audience: 'FY1-IMT3, final-year students', qa: 'approved',
      caps: [[fp, 'FPC 2'], [imt, 'CiP 1'], [imt, 'CiP 7'], [ukmla, 'MLA-CP 5']],
    },
    {
      title: 'Prescribing Safety Workshop',
      description: 'Case-based workshop on high-risk prescribing: anticoagulants, insulin, opioids and renal dose adjustment. Includes formative prescribing assessment.',
      type: 'Workshop', specialty: 'Clinical Pharmacology', site: 'Postgraduate Centre',
      schedule: 'Quarterly', capacity: '20',
      audience: 'Final-year students, FY1-FY2', qa: 'approved',
      caps: [[fp, 'FPC 13'], [ukmla, 'MLA-CP 4']],
    },
    {
      title: 'Palliative Care Clinic Attachment',
      description: 'Half-day supervised attachment in the hospice outpatient clinic with a consultant in palliative medicine. Exposure to advance care planning and symptom control.',
      type: 'Clinical attachment', specialty: 'Palliative Medicine', site: 'St. Margaret’s Hospice',
      schedule: 'Weekly, Thursdays PM - book via education centre', capacity: '1 per session',
      audience: 'IMT1-IMT3, FY2', qa: 'approved',
      caps: [[imt, 'CiP 6'], [imt, 'CiP 3'], [fp, 'FPC 3']],
    },
    {
      title: 'Quality Improvement Project Clinic',
      description: 'Drop-in support clinic for trainees planning or running QI projects, run by the clinical governance team. Help with measurement, driver diagrams and write-up.',
      type: 'Mentoring / support', specialty: 'Cross-specialty', site: 'Clinical Governance Office',
      schedule: 'Fortnightly, Tuesdays 14:00-16:00', capacity: 'Drop-in',
      audience: 'All grades', qa: 'approved',
      caps: [[fp, 'FPC 9'], [imt, 'CiP 8'], [gpc, 'GPC 6'], [ukmla, 'MLA-PK 2']],
    },
    {
      title: 'Teaching Skills for Doctors',
      description: 'One-day course on lesson planning, small-group teaching and giving feedback. Maps to education requirements across foundation and specialty curricula.',
      type: 'Course', specialty: 'Medical Education', site: 'Education Centre, Main Site',
      schedule: 'Twice yearly (spring and autumn)', capacity: '16',
      audience: 'FY2 and above', qa: 'pending',
      caps: [[fp, 'FPC 10'], [gpc, 'GPC 8']],
    },
    {
      title: 'Lumbar Puncture and Pleural Procedures Skills Lab',
      description: 'Hands-on procedural skills session using part-task trainers, supervised by acute and respiratory medicine consultants.',
      type: 'Skills lab', specialty: 'Acute Medicine', site: 'Clinical Skills Lab',
      schedule: 'Monthly, third Friday', capacity: '6',
      audience: 'IMT1-IMT3', qa: 'pending',
      caps: [[imt, 'CiP 5']],
    },
  ];

  const oppIdByTitle = {};
  for (const o of opps) {
    const r = insertOpp.run(
      o.title, o.description, o.type, o.specialty, o.site, o.schedule, o.capacity, o.audience,
      'Demo Educator', 'educator@demo.nhs.uk', educator.lastInsertRowid,
      o.qa, o.qa === 'approved' ? qa.lastInsertRowid : null, o.qa === 'approved' ? '2026-05-20' : null
    );
    oppIdByTitle[o.title] = r.lastInsertRowid;
    for (const [cur, code] of o.caps) linkCap.run(r.lastInsertRowid, capId(cur, code));
  }

  // Demo trainee: enrolled on IMT with a partial portfolio, so gaps are visible.
  db.prepare('UPDATE users SET curriculum_id = ? WHERE id = ?').run(imt, trainee.lastInsertRowid);
  const insertLog = db.prepare(
    `INSERT INTO portfolio_logs (user_id, capability_id, opportunity_id, log_date, title, reflection) VALUES (?,?,?,?,?,?)`
  );
  insertLog.run(trainee.lastInsertRowid, capId(imt, 'CiP 1'), oppIdByTitle['Acute Medicine Simulation: The Deteriorating Patient'], '2026-04-14',
    'Deteriorating patient simulation', 'Led the sim scenario for a patient with sepsis; debrief highlighted earlier escalation to critical care.');
  insertLog.run(trainee.lastInsertRowid, capId(imt, 'CiP 1'), null, '2026-05-02',
    'Acute take - 12 clerkings', 'Unselected take including DKA and upper GI bleed; discussed management with consultant on post-take round.');
  insertLog.run(trainee.lastInsertRowid, capId(imt, 'CiP 2'), null, '2026-05-10',
    'Ward cover weekend', 'Managed deteriorating inpatients across two wards; handover and escalation went well.');
  insertLog.run(trainee.lastInsertRowid, capId(imt, 'CiP 8'), oppIdByTitle['Quality Improvement Project Clinic'], '2026-05-21',
    'QI project: VTE assessment compliance', 'First PDSA cycle complete with governance team support.');

  console.log('Database seeded with demo users (password: demo1234), sample curricula and opportunities.');
}

// ---------------------------------------------------------------------------
// First-run bootstrap. Without demo seeding an empty database has no accounts,
// and self-registration creates users as 'pending' with nobody able to approve
// them - so a real admin is created instead. Credentials come from
// ADMIN_EMAIL/ADMIN_PASSWORD; a missing password is generated and printed once
// to the container log, and either way the account must change it at first
// sign-in.
// ---------------------------------------------------------------------------
function bootstrapAdmin() {
  if (db.prepare('SELECT COUNT(*) AS n FROM users').get().n > 0) return;

  const email = process.env.ADMIN_EMAIL || 'admin@localhost';
  const generated = !process.env.ADMIN_PASSWORD;
  const password = process.env.ADMIN_PASSWORD || crypto.randomBytes(12).toString('base64url');

  db.prepare(
    `INSERT INTO users (name, email, password_hash, role, status, must_change_password)
     VALUES (?,?,?,'admin','active',1)`
  ).run('Administrator', email, bcrypt.hashSync(password, 10));

  console.log(`Created first admin account: ${email}`);
  if (generated) {
    console.log(`Generated password (shown once, change it at first sign-in): ${password}`);
    console.log('Set ADMIN_EMAIL and ADMIN_PASSWORD to choose these yourself.');
  }
}

const seedDemo = String(process.env.CMT_SEED_DEMO ?? 'true').toLowerCase() !== 'false';
const freshDatabase = db.prepare('SELECT COUNT(*) AS n FROM curricula').get().n === 0;

if (seedDemo) seed();
bootstrapAdmin();

// One-off data migrations (apply to existing live databases too).
const { seedExtraCurricula } = require('./extraCurricula');
if (seedDemo || !freshDatabase) {
  runOnce('extra-curricula-2026-06', () => seedExtraCurricula(db));
} else {
  // Nothing to expand on a database that was never seeded with the samples.
  // Recorded as applied so it cannot fire later against real curriculum data.
  runOnce('extra-curricula-2026-06', () => {});
}

module.exports = db;
