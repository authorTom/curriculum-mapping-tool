import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';

// Split a curriculum's capabilities into covered / pending-only / gap.
function breakdown(capabilities) {
  let covered = 0, pending = 0, gap = 0;
  for (const c of capabilities) {
    if (c.approved_count > 0) covered++;
    else if (c.pending_count > 0) pending++;
    else gap++;
  }
  return { covered, pending, gap, total: capabilities.length };
}

function CoverageBar({ covered, pending, gap, total }) {
  if (total === 0) return <div className="muted">No capabilities defined yet.</div>;
  const pct = (n) => (n / total) * 100;
  const seg = (n, cls, label) => n > 0 && (
    <div className={`seg ${cls}`} style={{ width: `${pct(n)}%` }} title={`${label}: ${n} of ${total}`}>
      {pct(n) >= 9 ? n : ''}
    </div>
  );
  return (
    <div className="coverage-bar" role="img" aria-label={`${covered} of ${total} capabilities covered`}>
      {seg(covered, 'covered', 'Covered')}
      {seg(pending, 'pending', 'Awaiting QA only')}
      {seg(gap, 'gap', 'Gap')}
    </div>
  );
}

export default function ManagerReport() {
  const [data, setData] = useState(null);
  const [open, setOpen] = useState({});
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/reports/provision').then(setData).catch((e) => setError(e.message));
  }, []);

  if (error) return <div className="error">{error}</div>;
  if (!data) return null;
  const { report, totals } = data;
  const totalGaps = report.reduce((n, r) => n + r.gaps, 0);

  // Trust-wide coverage across every capability of every curriculum.
  const overall = report.reduce((acc, r) => {
    const b = breakdown(r.capabilities);
    return { covered: acc.covered + b.covered, pending: acc.pending + b.pending, gap: acc.gap + b.gap, total: acc.total + b.total };
  }, { covered: 0, pending: 0, gap: 0, total: 0 });
  const overallPct = overall.total ? Math.round((overall.covered / overall.total) * 100) : 0;

  return (
    <div>
      <h1>Trust provision report</h1>
      <p className="lede">Where the Trust's QA-approved learning opportunities cover each curriculum — and where the gaps are.</p>
      <p><a className="btn small secondary" href="/api/reports/provision.csv">⬇ Download full report (CSV)</a></p>

      <div className="stat-row">
        <div className="stat"><div className="n">{totals.opportunities}</div><div className="label">Approved opportunities</div></div>
        <div className={totals.pending_qa ? 'stat warn' : 'stat'}><div className="n">{totals.pending_qa}</div><div className="label">Awaiting QA</div></div>
        <div className={totalGaps ? 'stat warn' : 'stat'}><div className="n">{totalGaps}</div><div className="label">Capabilities with no provision</div></div>
        <div className="stat"><div className="n">{totals.trainees}</div><div className="label">Active trainees</div></div>
        <div className="stat"><div className="n">{totals.logs}</div><div className="label">Portfolio entries logged</div></div>
      </div>

      <div className="card">
        <h3 style={{ marginBottom: 2 }}>Overall coverage <span className="coverage-pct">{overallPct}%</span></h3>
        <div className="muted" style={{ marginBottom: 6 }}>
          {overall.covered} of {overall.total} capabilities across all curricula have at least one approved learning opportunity.
        </div>
        <CoverageBar {...overall} />
        <div className="coverage-legend">
          <span className="l-covered">Covered (approved provision)</span>
          <span className="l-pending">Awaiting QA only</span>
          <span className="l-gap">Gap — no provision</span>
        </div>
      </div>

      <h2>By curriculum</h2>
      {report.map(({ curriculum, capabilities, total, gaps }) => {
        const b = breakdown(capabilities);
        const pct = total ? Math.round((b.covered / total) * 100) : 0;
        return (
          <div className="card" key={curriculum.id}>
            <h3 style={{ marginBottom: 2 }}>
              {curriculum.name} <span className="tag">{curriculum.stage}</span>{' '}
              <span className="coverage-pct">{pct}% covered</span>
            </h3>
            <div className="muted" style={{ marginBottom: 4 }}>
              {b.covered}/{total} capabilities covered{b.pending ? `, ${b.pending} awaiting QA` : ''}{b.gap ? `, ${b.gap} with no provision` : ''}
            </div>
            <CoverageBar {...b} />
            <button className="small secondary" style={{ marginTop: 10 }} onClick={() => setOpen({ ...open, [curriculum.id]: !open[curriculum.id] })}>
              {open[curriculum.id] ? 'Hide capability detail' : 'Show capability detail'}
            </button>
            {open[curriculum.id] && (
              <div className="table-scroll">
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
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
