import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';

export default function ManagerReport() {
  const [data, setData] = useState(null);
  const [open, setOpen] = useState({});

  useEffect(() => {
    api.get('/reports/provision').then(setData);
  }, []);

  if (!data) return null;
  const { report, totals } = data;
  const totalGaps = report.reduce((n, r) => n + r.gaps, 0);

  return (
    <div>
      <h1>Trust provision report</h1>
      <p className="lede">Where the Trust's QA-approved learning opportunities cover each curriculum — and where the gaps are.</p>

      <div className="stat-row">
        <div className="stat"><div className="n">{totals.opportunities}</div><div className="label">Approved opportunities</div></div>
        <div className={totals.pending_qa ? 'stat warn' : 'stat'}><div className="n">{totals.pending_qa}</div><div className="label">Awaiting QA</div></div>
        <div className={totalGaps ? 'stat warn' : 'stat'}><div className="n">{totalGaps}</div><div className="label">Capabilities with no provision</div></div>
        <div className="stat"><div className="n">{totals.trainees}</div><div className="label">Active trainees</div></div>
        <div className="stat"><div className="n">{totals.logs}</div><div className="label">Portfolio entries logged</div></div>
      </div>

      {report.map(({ curriculum, capabilities, total, gaps }) => (
        <div className="card" key={curriculum.id}>
          <h3>
            {curriculum.name} <span className="tag">{curriculum.stage}</span>{' '}
            {gaps === 0
              ? <span className="tag green">Full coverage</span>
              : <span className="tag red">{gaps} of {total} capabilities uncovered</span>}
          </h3>
          <button className="small secondary" onClick={() => setOpen({ ...open, [curriculum.id]: !open[curriculum.id] })}>
            {open[curriculum.id] ? 'Hide detail' : 'Show detail'}
          </button>
          {open[curriculum.id] && (
            <table style={{ marginTop: 10 }}>
              <thead><tr><th>Capability</th><th>Approved provision</th><th>Awaiting QA</th><th>Trainee demand (logs)</th></tr></thead>
              <tbody>
                {capabilities.map((c) => (
                  <tr key={c.id}>
                    <td><strong>{c.code}</strong> — {c.title}<div className="muted">{c.domain}</div></td>
                    <td>
                      {c.approved_count === 0
                        ? <span className="tag red">Gap — no provision</span>
                        : <Link to={`/browse?capability_id=${c.id}`}><span className="tag green">{c.approved_count}</span></Link>}
                    </td>
                    <td>{c.pending_count > 0 ? <span className="tag amber">{c.pending_count}</span> : <span className="muted">—</span>}</td>
                    <td>{c.trainee_log_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ))}
    </div>
  );
}
