import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';

export default function QAQueue() {
  const [opps, setOpps] = useState([]);
  const [comments, setComments] = useState({});
  const [error, setError] = useState('');

  const load = () => api.get('/qa/queue').then((d) => setOpps(d.opportunities));
  useEffect(() => { load(); }, []);

  async function review(id, decision) {
    setError('');
    try {
      await api.post(`/qa/${id}/review`, { decision, comments: comments[id] || '' });
      load();
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <div>
      <h1>QA review queue</h1>
      <p className="lede">New and edited learning opportunities awaiting quality assurance. Approved items become visible to trainees; rejections are returned to the educator with your feedback.</p>
      {error && <div className="error">{error}</div>}

      {opps.length === 0 && <div className="success">The queue is clear — nothing awaiting review.</div>}

      {opps.map((o) => (
        <div className="card" key={o.id}>
          <h3><Link to={`/opportunities/${o.id}`}>{o.title}</Link></h3>
          <div className="meta">{o.type}{o.specialty ? ` · ${o.specialty}` : ''}{o.site ? ` · ${o.site}` : ''} · submitted by {o.created_by_name}</div>
          {o.description && <p style={{ margin: '8px 0' }}>{o.description}</p>}
          <div>
            {o.capabilities.map((c) => (
              <span className="tag blue" key={c.id} title={c.curriculum_name}>{c.code} · {c.curriculum_name.split(' (')[0]}</span>
            ))}
          </div>
          <label>Reviewer comments <span className="hint">required if rejecting</span>
            <textarea value={comments[o.id] || ''} onChange={(e) => setComments({ ...comments, [o.id]: e.target.value })} />
          </label>
          <div className="row-actions">
            <button className="small" onClick={() => review(o.id, 'approved')}>Approve</button>
            <button className="small danger" onClick={() => review(o.id, 'rejected')}>Reject</button>
          </div>
        </div>
      ))}
    </div>
  );
}
