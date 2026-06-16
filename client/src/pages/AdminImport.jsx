import React, { useState } from 'react';
import { api } from '../api';

const KINDS = {
  curricula: {
    label: 'Curricula & capabilities',
    endpoint: '/import/curricula',
    template: 'curriculum_name,body,stage,code,domain,title,description\n' +
      '"Internal Medicine Training","JRCPTB","core","CiP 1","Clinical CiPs","Managing an acute unselected take","Manages the acute medical take."\n' +
      '"Internal Medicine Training","JRCPTB","core","CiP 2","Clinical CiPs","Managing inpatients","Provides continuity of inpatient care."',
    help: 'One row per capability. Rows that share a curriculum_name are grouped into the same curriculum. stage is one of: undergraduate, foundation, core, higher, consultant. Existing capabilities (same code in the same curriculum) are skipped.',
  },
  users: {
    label: 'Users',
    endpoint: '/import/users',
    template: 'name,email,role,status,grade,specialty,password\n' +
      '"Dr Asha Khan","akhan@example.nhs.uk","educator","active","Consultant","Cardiology",""\n' +
      '"Dr Tom Lee","tlee@example.nhs.uk","trainee","active","IMT2","",""',
    help: 'role: trainee, educator, manager, qa or admin (default trainee). status default active. Leave password blank to auto-generate a temporary one — the user is then forced to set their own at first login. Existing emails are skipped.',
  },
  opportunities: {
    label: 'Learning opportunities (courses)',
    endpoint: '/import/opportunities',
    template: 'title,type,specialty,site,schedule,capacity,audience,lead_name,lead_email,booking_url,qa_status,capabilities\n' +
      '"ECG Masterclass","Course","Cardiology","Education Centre","Monthly","20","FY1-IMT3","Dr Khan","akhan@example.nhs.uk","https://intranet/ecg","approved","CiP 1; FPC 13"',
    help: 'capabilities is a list of capability codes separated by semicolons. If a code exists in more than one curriculum, disambiguate with "Curriculum name::Code" (e.g. "RCGP::Cap 4"). qa_status approved makes it live immediately; otherwise it goes to the QA queue.',
  },
};

function downloadTemplate(kind) {
  const blob = new Blob([KINDS[kind].template], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `${kind}-template.csv`; a.click();
  URL.revokeObjectURL(url);
}

export default function AdminImport() {
  const [kind, setKind] = useState('curricula');
  const [csv, setCsv] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const cfg = KINDS[kind];

  function onFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setCsv(reader.result);
    reader.readAsText(file);
  }

  async function submit() {
    setError(''); setResult(null); setBusy(true);
    try {
      const d = await api.post(cfg.endpoint, { csv });
      setResult(d);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <h1>Bulk import</h1>
      <p className="lede">Upload a spreadsheet (CSV) to load curricula, users or courses in bulk. Download a template to see the exact columns.</p>

      <div className="filters">
        <div>
          <label>What are you importing?</label>
          <select value={kind} onChange={(e) => { setKind(e.target.value); setResult(null); setError(''); }}>
            {Object.entries(KINDS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </div>
        <div>
          <label>&nbsp;</label>
          <button type="button" className="secondary small" onClick={() => downloadTemplate(kind)}>⬇ Download {kind} template</button>
        </div>
      </div>

      <div className="notice">{cfg.help}</div>

      <div className="panel">
        <label>Upload a CSV file
          <input type="file" accept=".csv,text/csv" onChange={onFile} />
        </label>
        <label>…or paste CSV here
          <textarea value={csv} onChange={(e) => setCsv(e.target.value)} style={{ minHeight: 160, fontFamily: 'monospace', maxWidth: 720 }}
            placeholder="Paste the contents of your spreadsheet, including the header row" />
        </label>
        {error && <div className="error">{error}</div>}
        <button disabled={busy || !csv.trim()} onClick={submit}>{busy ? 'Importing…' : 'Import'}</button>
      </div>

      {result && (
        <div className="card" style={{ marginTop: 16 }}>
          <h3>Import complete</h3>
          <div className="success" style={{ marginTop: 0 }}>
            {Object.entries(result.summary).filter(([k]) => k !== 'errors').map(([k, v]) => (
              <span key={k} className="tag green">{k.replace(/([A-Z])/g, ' $1')}: {v}</span>
            ))}
          </div>
          {result.tempPasswords && result.tempPasswords.length > 0 && (
            <>
              <h4>Temporary passwords (share securely; users must change at first login)</h4>
              <table style={{ maxWidth: 520 }}>
                <thead><tr><th>Email</th><th>Temporary password</th></tr></thead>
                <tbody>
                  {result.tempPasswords.map((t) => (
                    <tr key={t.email}><td>{t.email}</td><td><code>{t.temporary_password}</code></td></tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
          {result.summary.errors && result.summary.errors.length > 0 && (
            <>
              <h4>Notes &amp; skipped rows</h4>
              <ul>{result.summary.errors.map((er, i) => <li key={i} className="muted">{er}</li>)}</ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}
