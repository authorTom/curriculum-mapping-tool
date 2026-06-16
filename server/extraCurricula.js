// ---------------------------------------------------------------------------
// A few real, well-established UK medical-education frameworks, added on top of
// the original demo samples. Only the TOP-LEVEL capabilities are included -
// the colleges' full curricula contain many sub-descriptors, which should be
// loaded via the bulk import (Admin -> Import) from the official published
// files. Everything here is flagged "verify against the official source".
//
// Exposed as a function taking `db` to avoid a circular require with db.js.
// ---------------------------------------------------------------------------
const VERIFY = ' (Top-level framework only - verify wording against the official published curriculum before clinical-education use.)';

const CURRICULA = [
  {
    name: 'GMC Outcomes for Graduates (2018)',
    body: 'GMC',
    stage: 'undergraduate',
    description: 'The three themes of the GMC Outcomes for Graduates, the outcomes every UK medical graduate must demonstrate.' + VERIFY,
    domain: 'Outcomes for Graduates',
    capabilities: [
      ['OfG 1', 'Professional values and behaviours', 'Demonstrates the professional values and behaviours required of a doctor, working within the principles of Good Medical Practice.'],
      ['OfG 2', 'Professional skills', 'Demonstrates the clinical and practical skills needed of a new doctor, including communication, examination, diagnosis, prescribing and procedures.'],
      ['OfG 3', 'Professional knowledge', 'Applies the biomedical, psychological, social and population knowledge that underpins safe and effective medical practice.'],
    ],
  },
  {
    name: 'RCGP — GP Specialty Training: Core Capabilities',
    body: 'RCGP',
    stage: 'higher',
    description: 'The thirteen RCGP core capabilities assessed across GP specialty training and the MRCGP.' + VERIFY,
    domain: 'Core Capabilities',
    capabilities: [
      ['Cap 1', 'Fitness to practise', 'Maintains professional behaviour, insight and personal health, taking action when fitness to practise may be impaired.'],
      ['Cap 2', 'Maintaining an ethical approach', 'Practises ethically, with respect for diversity, equality and the rights of patients.'],
      ['Cap 3', 'Communication and consultation skills', 'Communicates effectively and conducts patient-centred consultations.'],
      ['Cap 4', 'Data gathering and interpretation', 'Gathers and interprets information from history, examination and investigation.'],
      ['Cap 5', 'Clinical examination and procedural skills', 'Performs appropriate, proficient physical examinations and clinical procedures.'],
      ['Cap 6', 'Making a diagnosis / making decisions', 'Adopts a structured, evidence-based approach to decision-making and diagnosis.'],
      ['Cap 7', 'Clinical management', 'Provides safe and appropriate management of acute and chronic problems in primary care.'],
      ['Cap 8', 'Managing medical complexity', 'Manages co-morbidity, uncertainty and risk, and promotes health across the life course.'],
      ['Cap 9', 'Working with colleagues and in teams', 'Works effectively with colleagues and within multidisciplinary teams.'],
      ['Cap 10', 'Maintaining performance, learning and teaching', 'Maintains performance and develops self and others through learning and teaching.'],
      ['Cap 11', 'Organisation, management and leadership', 'Applies organisation, management and leadership skills to patient care and the practice.'],
      ['Cap 12', 'Practising holistically, promoting health and safeguarding', 'Operates holistically, promotes health and safeguards the vulnerable.'],
      ['Cap 13', 'Community orientation', 'Manages the health and social care of the practice population and local community.'],
    ],
  },
  {
    name: 'GMC Good Medical Practice (Domains)',
    body: 'GMC',
    stage: 'consultant',
    description: 'The four domains of Good Medical Practice, used across appraisal, revalidation and consultant-level CPD.' + VERIFY,
    domain: 'Good Medical Practice',
    capabilities: [
      ['GMP 1', 'Knowledge, skills and performance', 'Maintains and develops professional knowledge and skills; provides a good standard of practice and care.'],
      ['GMP 2', 'Safety and quality', 'Contributes to and complies with systems to protect patients; responds to risks to safety; engages in quality improvement.'],
      ['GMP 3', 'Communication, partnership and teamwork', 'Communicates effectively, works in partnership with patients and colleagues, and teaches and supports others.'],
      ['GMP 4', 'Maintaining trust', 'Shows respect for patients, treats people fairly and without discrimination, and acts with honesty and integrity.'],
    ],
  },
];

function seedExtraCurricula(db) {
  const insertCurriculum = db.prepare('INSERT INTO curricula (name, body, stage, description) VALUES (?,?,?,?)');
  const insertCap = db.prepare('INSERT INTO capabilities (curriculum_id, code, domain, title, description) VALUES (?,?,?,?,?)');
  const existsByName = db.prepare('SELECT id FROM curricula WHERE name = ?');

  let added = 0;
  for (const c of CURRICULA) {
    if (existsByName.get(c.name)) continue; // never duplicate
    const id = insertCurriculum.run(c.name, c.body, c.stage, c.description).lastInsertRowid;
    for (const [code, title, desc] of c.capabilities) insertCap.run(id, code, c.domain, title, desc);
    added++;
  }
  if (added) console.log(`Added ${added} additional curriculum framework(s).`);
}

module.exports = { seedExtraCurricula };
