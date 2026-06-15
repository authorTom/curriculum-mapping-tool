import React, { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../App';

export default function Portfolio() {
  const { user } = useAuth();
  const [params] = useSearchParams();
  const [logs, setLogs] = useState([]);
  const [curricula, setCurricula] = useState([]);
  const [caps, setCaps] = useState([]);
  const [showForm, setShowForm] = useState(params.get('add') === '1');
  const [form, setForm] = useState({
    curriculum_id: user.curriculum_id || '',
    capability_id: params.get('capability_id') || '',
    opportunity_id: params.get('opportunity_id') || '',
    log_date: new Date().toISOString().slice(0, 10),
    title: params.get('title') || '',
    reflection: '',
  });
  const [error, setError] = useState('');

  const load = () => api.get('/logs').then((d) => setLogs(d.logs));
  useEffect(() => { load(); api.get('/curricula').then((d) => setCurricula(d.curricula)); }, []);

  useEffect(() => {
    if (!form.curriculum_id) { setCaps([]); return; }
    api.get(`/curricula/${form.curriculum_id}`).then((d) => setCaps(d.capabilities));
  }, [form.curriculum_id]);

  // If arriving from an opportunity page with a capability preselected, find its curriculum.
  useEffect(() => {
    const capId = params.get('capability_id');
    const curId = params.get('curriculum_id');
    if (capId && curId) {
      setForm((f) => ({ ...f, curriculum_id: curId, capability_id: capId }));
      setShowForm(true);
    }
  }, []);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setError('');
    try {
      await api.post('/logs', form);
      setForm({ ...form, title: '', reflection: '', opportunity_id: '' });
      setShowForm(false);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function remove(id) {
    if (!confirm('Delete this portfolio entry?')) return;
    await api.del(`/logs/${id}`);
    load();
  }

  return (
    <div>
      <h1>My portfolio</h1>
      <p className="lede">Log evidence against curriculum capabilities. Entries here power your gap analysis.</p>

      {!showForm && <button onClick={() => setShowForm(true)}>+ Log new evidence</button>}

      {showForm && (
        <form className="panel" onSubmit={submit}>
          <h2 style={{ marginTop: 0 }}>Log evidence</h2>
          {error && <div className="error">{error}</div>}
          <label>Curriculum
            <select value={form.curriculum_id} onChange={set('curriculum_id')} required>
              <option value="">— choose —</option>
              {curricula.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label>Capability
            <select value={form.capability_id} onChange={set('capability_id')} required>
              <option value="">— choose —</option>
              {caps.map((c) => <option key={c.id} value={c.id}>{c.code} — {c.title}</option>)}
            </select>
          </label>
          <label>Date
            <input type="date" value={form.log_date} onChange={set('log_date')} required />
          </label>
          <label>Title <span className="hint">e.g. "Acute take — 12 clerkings" or the name of a course attended</span>
            <input type="text" value={form.title} onChange={set('title')} required />
          </label>
          <label>Reflection <span className="hint">optional</span>
            <textarea value={form.reflection} onChange={set('reflection')} />
          </label>
          <div className="row-actions">
            <button>Save entry</button>
            <button type="button" className="secondary" onClick={() => setShowForm(false)}>Cancel</button>
          </div>
        </form>
      )}

      <h2>Entries ({logs.length})</h2>
      {logs.length === 0 && <p className="muted">No entries yet. Log your first piece of evidence above.</p>}
      {logs.map((l) => (
        <div className="card" key={l.id}>
          <h3>{l.title}</h3>
          <div className="meta">{l.log_date} · <span className="tag blue">{l.capability_code}</span> {l.capability_title} · {l.curriculum_name}</div>
          {l.opportunity_title && <div className="meta">Linked opportunity: {l.opportunity_title}</div>}
          {l.reflection && <p style={{ margin: '8px 0 4px' }}>{l.reflection}</p>}
          <button className="small danger" onClick={() => remove(l.id)}>Delete</button>
        </div>
      ))}
    </div>
  );
}
