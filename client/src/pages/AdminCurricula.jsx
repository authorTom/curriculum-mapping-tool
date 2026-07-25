import React, { useEffect, useState } from 'react';
import { api } from '../api';

const STAGES = ['undergraduate', 'foundation', 'core', 'higher', 'consultant'];
const EMPTY_CUR = { name: '', body: '', stage: 'core', description: '' };
const EMPTY_CAP = { code: '', domain: '', title: '', description: '' };

export default function AdminCurricula() {
  const [curricula, setCurricula] = useState([]);
  const [selected, setSelected] = useState(null); // { curriculum, capabilities }
  const [curForm, setCurForm] = useState(null);   // null | curriculum being edited/created
  const [capForm, setCapForm] = useState(null);   // null | capability being edited/created
  const [error, setError] = useState('');

  const load = () => api.get('/curricula').then((d) => setCurricula(d.curricula)).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  async function openCurriculum(id) {
    setError('');
    try {
      setSelected(await api.get(`/curricula/${id}`));
      setCapForm(null);
    } catch (err) {
      setError(err.message);
    }
  }

  async function saveCurriculum(e) {
    e.preventDefault(); setError('');
    try {
      if (curForm.id) await api.put(`/curricula/${curForm.id}`, curForm);
      else await api.post('/curricula', curForm);
      setCurForm(null); load();
      if (selected && curForm.id === selected.curriculum.id) openCurriculum(curForm.id);
    } catch (err) { setError(err.message); }
  }

  async function deleteCurriculum(c) {
    if (!confirm(`Delete "${c.name}" and all its capabilities? Mapped opportunities lose these mappings. This cannot be undone.`)) return;
    setError('');
    try {
      await api.del(`/curricula/${c.id}`);
      if (selected?.curriculum.id === c.id) setSelected(null);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function saveCapability(e) {
    e.preventDefault(); setError('');
    try {
      if (capForm.id) await api.put(`/capabilities/${capForm.id}`, capForm);
      else await api.post(`/curricula/${selected.curriculum.id}/capabilities`, capForm);
      setCapForm(null);
      openCurriculum(selected.curriculum.id);
      load();
    } catch (err) { setError(err.message); }
  }

  async function deleteCapability(cap) {
    if (!confirm(`Delete capability ${cap.code}? Portfolio logs and opportunity mappings against it will be removed.`)) return;
    setError('');
    try {
      await api.del(`/capabilities/${cap.id}`);
      openCurriculum(selected.curriculum.id);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div>
      <h1>Curricula</h1>
      <p className="lede">Define the curriculum frameworks — from undergraduate to consultant level — that opportunities and portfolios map against.</p>
      {error && <div className="error">{error}</div>}

      {!curForm && <button onClick={() => setCurForm(EMPTY_CUR)}>+ New curriculum</button>}

      {curForm && (
        <form className="panel" onSubmit={saveCurriculum}>
          <h2 style={{ marginTop: 0 }}>{curForm.id ? 'Edit curriculum' : 'New curriculum'}</h2>
          <label>Name *<input type="text" value={curForm.name} onChange={(e) => setCurForm({ ...curForm, name: e.target.value })} required /></label>
          <label>Awarding body <span className="hint">e.g. GMC, UKFPO, JRCPTB, Royal College</span>
            <input type="text" value={curForm.body || ''} onChange={(e) => setCurForm({ ...curForm, body: e.target.value })} /></label>
          <label>Training stage *
            <select value={curForm.stage} onChange={(e) => setCurForm({ ...curForm, stage: e.target.value })}>
              {STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select></label>
          <label>Description<textarea value={curForm.description || ''} onChange={(e) => setCurForm({ ...curForm, description: e.target.value })} /></label>
          <div className="row-actions">
            <button>Save</button>
            <button type="button" className="secondary" onClick={() => setCurForm(null)}>Cancel</button>
          </div>
        </form>
      )}

      <table style={{ marginTop: 16 }}>
        <thead><tr><th>Curriculum</th><th>Body</th><th>Stage</th><th>Capabilities</th><th></th></tr></thead>
        <tbody>
          {curricula.map((c) => (
            <tr key={c.id}>
              <td><a href="#" onClick={(e) => { e.preventDefault(); openCurriculum(c.id); }}>{c.name}</a></td>
              <td>{c.body || '—'}</td>
              <td><span className="tag">{c.stage}</span></td>
              <td>{c.capability_count}</td>
              <td className="row-actions">
                <button className="small secondary" onClick={() => setCurForm({ ...c })}>Edit</button>
                <button className="small danger" onClick={() => deleteCurriculum(c)}>Delete</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {selected && (
        <>
          <h2>{selected.curriculum.name} — capabilities</h2>
          {!capForm && <button className="small" onClick={() => setCapForm(EMPTY_CAP)}>+ Add capability</button>}

          {capForm && (
            <form className="panel" onSubmit={saveCapability} style={{ margin: '12px 0' }}>
              <label>Code * <span className="hint">e.g. "CiP 1", "FPC 9"</span>
                <input type="text" value={capForm.code} onChange={(e) => setCapForm({ ...capForm, code: e.target.value })} required /></label>
              <label>Domain / grouping
                <input type="text" value={capForm.domain || ''} onChange={(e) => setCapForm({ ...capForm, domain: e.target.value })} /></label>
              <label>Title *
                <input type="text" value={capForm.title} onChange={(e) => setCapForm({ ...capForm, title: e.target.value })} required /></label>
              <label>Description
                <textarea value={capForm.description || ''} onChange={(e) => setCapForm({ ...capForm, description: e.target.value })} /></label>
              <div className="row-actions">
                <button>Save capability</button>
                <button type="button" className="secondary" onClick={() => setCapForm(null)}>Cancel</button>
              </div>
            </form>
          )}

          <table style={{ marginTop: 12 }}>
            <thead><tr><th>Code</th><th>Title</th><th>Domain</th><th></th></tr></thead>
            <tbody>
              {selected.capabilities.map((cap) => (
                <tr key={cap.id}>
                  <td><strong>{cap.code}</strong></td>
                  <td>{cap.title}<div className="muted">{cap.description}</div></td>
                  <td className="muted">{cap.domain}</td>
                  <td className="row-actions">
                    <button className="small secondary" onClick={() => setCapForm({ ...cap })}>Edit</button>
                    <button className="small danger" onClick={() => deleteCapability(cap)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
