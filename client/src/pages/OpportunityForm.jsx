import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';

const TYPES = ['Course', 'Workshop', 'Simulation', 'Skills lab', 'Clinical attachment', 'Teaching session', 'Grand round', 'E-learning', 'Mentoring / support', 'Audit / QI activity', 'Conference', 'Other'];

const EMPTY = {
  title: '', description: '', type: '', specialty: '', site: '', schedule: '',
  capacity: '', audience: '', lead_name: '', lead_email: '', booking_url: '', active: true,
};

export default function OpportunityForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [form, setForm] = useState(EMPTY);
  const [selectedCaps, setSelectedCaps] = useState(new Set());
  const [curricula, setCurricula] = useState([]); // [{curriculum, capabilities}]
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get('/curricula')
      .then(async (d) => {
        const full = await Promise.all(d.curricula.map((c) => api.get(`/curricula/${c.id}`)));
        setCurricula(full);
      })
      .catch((e) => setError(e.message));
    if (id) {
      api.get(`/opportunities/${id}`).then((d) => {
        const o = d.opportunity;
        setForm({
          title: o.title, description: o.description || '', type: o.type, specialty: o.specialty || '',
          site: o.site || '', schedule: o.schedule || '', capacity: o.capacity || '', audience: o.audience || '',
          lead_name: o.lead_name || '', lead_email: o.lead_email || '', booking_url: o.booking_url || '', active: !!o.active,
        });
        setSelectedCaps(new Set(o.capabilities.map((c) => c.id)));
      }).catch((e) => setError(e.message));
    }
  }, [id]);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const toggleCap = (capId) => {
    const next = new Set(selectedCaps);
    next.has(capId) ? next.delete(capId) : next.add(capId);
    setSelectedCaps(next);
  };

  async function submit(e) {
    e.preventDefault();
    setError(''); setBusy(true);
    try {
      const body = { ...form, capability_ids: [...selectedCaps] };
      if (id) {
        await api.put(`/opportunities/${id}`, body);
        navigate(`/opportunities/${id}`);
      } else {
        const d = await api.post('/opportunities', body);
        navigate(`/opportunities/${d.id}`);
      }
    } catch (err) {
      setError(err.message);
      window.scrollTo(0, 0);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <h1>{id ? 'Edit learning opportunity' : 'Add a learning opportunity'}</h1>
      <p className="lede">Describe the opportunity and map it to every curriculum capability it helps trainees meet. It will be visible to trainees once approved by the QA team.</p>
      {error && <div className="error">{error}</div>}

      <form className="panel form-tidy" onSubmit={submit}>
        <label>Title *
          <input type="text" value={form.title} onChange={set('title')} required />
        </label>
        <label>Description <span className="hint">what happens, what learners will get out of it, how to book</span>
          <textarea value={form.description} onChange={set('description')} />
        </label>

        <div className="form-grid">
          <label>Type *
            <select value={form.type} onChange={set('type')} required>
              <option value="">— choose —</option>
              {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
          <label>Specialty
            <input type="text" value={form.specialty} onChange={set('specialty')} placeholder="e.g. Acute Medicine" />
          </label>
          <label>Site / location
            <input type="text" value={form.site} onChange={set('site')} placeholder="e.g. Education Centre, Main Site" />
          </label>
          <label>Schedule / frequency
            <input type="text" value={form.schedule} onChange={set('schedule')} placeholder='e.g. "Monthly, first Wednesday"' />
          </label>
          <label>Capacity
            <input type="text" value={form.capacity} onChange={set('capacity')} placeholder='e.g. "8 per session"' />
          </label>
          <label>Intended audience
            <input type="text" value={form.audience} onChange={set('audience')} placeholder="e.g. FY1-IMT3" />
          </label>
          <label>Lead educator name
            <input type="text" value={form.lead_name} onChange={set('lead_name')} />
          </label>
          <label>Lead educator email
            <input type="email" value={form.lead_email} onChange={set('lead_email')} />
          </label>
          <label className="span-2">Booking / information link <span className="hint">a web address trainees can click to book or read more (e.g. an intranet or booking-system page)</span>
            <input type="text" value={form.booking_url} onChange={set('booking_url')} placeholder="https://…" />
          </label>
        </div>

        <label>Curriculum capabilities * <span className="hint">tick every capability this opportunity helps meet — across any curriculum, undergraduate to consultant ({selectedCaps.size} selected)</span></label>
        <div className="cap-picker">
          {curricula.map(({ curriculum, capabilities }) => (
            <div key={curriculum.id}>
              <div className="domain">{curriculum.name}</div>
              {capabilities.map((c) => (
                <label key={c.id}>
                  <input type="checkbox" checked={selectedCaps.has(c.id)} onChange={() => toggleCap(c.id)} />
                  <span><strong>{c.code}</strong> — {c.title}</span>
                </label>
              ))}
            </div>
          ))}
        </div>

        {id && (
          <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input type="checkbox" style={{ width: 'auto' }} checked={form.active}
              onChange={(e) => setForm({ ...form, active: e.target.checked })} />
            Active (visible to trainees once QA approved)
          </label>
        )}

        <div className="row-actions">
          <button disabled={busy}>{id ? 'Save and resubmit for QA' : 'Submit for QA review'}</button>
          <button type="button" className="secondary" onClick={() => navigate(-1)}>Cancel</button>
        </div>
      </form>
    </div>
  );
}
