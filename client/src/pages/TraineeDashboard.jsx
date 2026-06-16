import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../App';

export default function TraineeDashboard() {
  const { user, setUser } = useAuth();
  const [curricula, setCurricula] = useState([]);
  const [caps, setCaps] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/curricula').then((d) => setCurricula(d.curricula));
  }, []);

  useEffect(() => {
    setError('');
    if (!user.curriculum_id) { setCaps(null); return; }
    api.get('/gaps').then((d) => setCaps(d.capabilities)).catch((e) => setError(e.message));
  }, [user.curriculum_id]);

  async function chooseCurriculum(e) {
    const id = e.target.value || null;
    const d = await api.put('/auth/me', { curriculum_id: id, grade: user.grade, specialty: user.specialty });
    setUser(d.user);
  }

  const gaps = (caps || []).filter((c) => c.my_log_count === 0);
  const covered = (caps || []).filter((c) => c.my_log_count > 0);
  const maxLogs = Math.max(1, ...(caps || []).map((c) => c.my_log_count));

  return (
    <div>
      <h1>My dashboard</h1>
      <p className="lede">Track your evidence against each curriculum capability and find learning to fill the gaps.</p>

      <div className="filters">
        <div>
          <label>My curriculum</label>
          <select value={user.curriculum_id || ''} onChange={chooseCurriculum}>
            <option value="">— choose a curriculum —</option>
            {curricula.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.stage})</option>)}
          </select>
        </div>
      </div>
      {error && <div className="error">{error}</div>}

      {caps && (
        <>
          <div className="stat-row">
            <div className="stat"><div className="n">{caps.length}</div><div className="label">Capabilities in curriculum</div></div>
            <div className="stat"><div className="n">{covered.length}</div><div className="label">With evidence logged</div></div>
            <div className={gaps.length ? 'stat warn' : 'stat'}><div className="n">{gaps.length}</div><div className="label">Gaps — no evidence yet</div></div>
          </div>

          <h2>Capability coverage
            {' '}<a className="btn small secondary" href={`/api/gaps.csv?curriculum_id=${user.curriculum_id}`} style={{ fontWeight: 400 }}>⬇ Export (CSV)</a>
          </h2>
          <div className="table-scroll">
          <table>
            <thead>
              <tr><th>Capability</th><th>My evidence</th><th>Learning available</th><th></th></tr>
            </thead>
            <tbody>
              {caps.map((c) => (
                <tr key={c.id}>
                  <td>
                    <strong>{c.code}</strong> — {c.title}
                    <div className="muted">{c.domain}</div>
                  </td>
                  <td>
                    <span className="bar"><span style={{ width: `${(c.my_log_count / maxLogs) * 100}%` }} /></span>{' '}
                    {c.my_log_count === 0
                      ? <span className="tag red">Gap</span>
                      : <span className="tag green">{c.my_log_count} log{c.my_log_count > 1 ? 's' : ''}</span>}
                  </td>
                  <td>
                    {c.opportunity_count > 0
                      ? <span className="tag blue">{c.opportunity_count} opportunit{c.opportunity_count > 1 ? 'ies' : 'y'}</span>
                      : <span className="muted">none yet</span>}
                  </td>
                  <td>
                    {c.opportunity_count > 0 && (
                      <Link to={`/browse?capability_id=${c.id}`}>Find learning</Link>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </>
      )}

      {!user.curriculum_id && (
        <div className="notice">Choose the curriculum you are working towards to see your coverage and gaps.</div>
      )}
    </div>
  );
}
