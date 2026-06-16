import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../App';
import Stars from '../components/Stars';

const QA_TAG = { approved: ['green', 'QA approved'], pending: ['amber', 'Awaiting QA'], rejected: ['red', 'Rejected'] };

export default function Browse() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const [opps, setOpps] = useState([]);
  const [curricula, setCurricula] = useState([]);
  const [types, setTypes] = useState([]);

  const filters = {
    q: params.get('q') || '',
    curriculum_id: params.get('curriculum_id') || '',
    capability_id: params.get('capability_id') || '',
    type: params.get('type') || '',
  };

  useEffect(() => {
    api.get('/curricula').then((d) => setCurricula(d.curricula));
    api.get('/opportunities/types').then((d) => setTypes(d.types));
  }, []);

  useEffect(() => {
    const qs = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => v && qs.set(k, v));
    api.get(`/opportunities?${qs}`).then((d) => setOpps(d.opportunities));
  }, [params]);

  const setFilter = (k) => (e) => {
    const next = new URLSearchParams(params);
    if (e.target.value) next.set(k, e.target.value); else next.delete(k);
    if (k !== 'capability_id') next.delete('capability_id');
    setParams(next, { replace: true });
  };

  const seesQaStatus = ['educator', 'qa', 'manager', 'admin'].includes(user.role);

  return (
    <div>
      <h1>Learning opportunities</h1>
      <p className="lede">
        {user.role === 'trainee'
          ? 'Browse QA-approved learning across the Trust, filtered by the capabilities you need.'
          : 'All learning opportunities across the Trust.'}
      </p>

      <div className="filters">
        <div>
          <label>Search</label>
          <input type="text" value={filters.q} onChange={setFilter('q')} placeholder="title, specialty…" />
        </div>
        <div>
          <label>Curriculum</label>
          <select value={filters.curriculum_id} onChange={setFilter('curriculum_id')}>
            <option value="">All</option>
            {curricula.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label>Type</label>
          <select value={filters.type} onChange={setFilter('type')}>
            <option value="">All</option>
            {types.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        {filters.capability_id && (
          <div>
            <label>&nbsp;</label>
            <span className="tag blue">Filtered by capability <a href="#" onClick={(e) => { e.preventDefault(); setFilter('capability_id')({ target: { value: '' } }); }}>✕</a></span>
          </div>
        )}
      </div>

      {opps.length === 0 && <p className="muted">No opportunities match these filters yet.</p>}
      <div className="grid">
        {opps.map((o) => (
          <div className="card" key={o.id}>
            <h3><Link to={`/opportunities/${o.id}`}>{o.title}</Link></h3>
            <div className="meta">{o.type}{o.specialty ? ` · ${o.specialty}` : ''}{o.site ? ` · ${o.site}` : ''}</div>
            {o.schedule && <div className="meta">{o.schedule}</div>}
            <div style={{ marginTop: 6 }}>
              <span className="tag">{o.capability_count} capabilit{o.capability_count === 1 ? 'y' : 'ies'} mapped</span>
              {seesQaStatus && o.qa_status && (
                <span className={`tag ${QA_TAG[o.qa_status][0]}`}>{QA_TAG[o.qa_status][1]}</span>
              )}
              {o.rating_count > 0 && <Stars value={o.rating_avg} count={o.rating_count} small />}
            </div>
            {o.booking_url && (
              <p style={{ margin: '8px 0 0' }}>
                <a className="btn small" href={o.booking_url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>Book / find out more ↗</a>
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
