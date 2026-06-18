import React, { useEffect, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../App';

const ROLES = ['trainee', 'educator', 'manager', 'qa', 'admin'];

const EMPTY_NEW = { name: '', email: '', role: 'trainee', status: 'active', grade: '', specialty: '', password: '' };

export default function AdminUsers() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState([]);
  const [error, setError] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState(EMPTY_NEW);
  const setF = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const load = () => api.get('/users').then((d) => setUsers(d.users));
  useEffect(() => { load(); }, []);

  async function addUser(e) {
    e.preventDefault();
    setError('');
    try {
      const d = await api.post('/users', form);
      setForm(EMPTY_NEW);
      setShowAdd(false);
      load();
      if (d.temporary_password) {
        alert(`Account created for ${form.email}.\n\nTemporary password: ${d.temporary_password}\n\nShare this securely — they'll choose their own at first login.`);
      } else {
        alert(`Account created for ${form.email}.`);
      }
    } catch (err) {
      setError(err.message);
    }
  }

  async function update(u, changes) {
    setError('');
    try {
      await api.put(`/users/${u.id}`, { role: u.role, status: u.status, ...changes });
      load();
    } catch (e) {
      setError(e.message);
    }
  }

  async function resetPassword(u) {
    if (!confirm(`Reset the password for ${u.name}? They'll get a temporary password and must change it at next login.`)) return;
    setError('');
    try {
      const d = await api.post(`/users/${u.id}/reset-password`);
      alert(`Temporary password for ${u.email}:\n\n${d.temporary_password}\n\nShare this securely. They'll be asked to set their own at next login.`);
    } catch (e) {
      setError(e.message);
    }
  }

  const pending = users.filter((u) => u.status === 'pending');

  return (
    <div>
      <h1>User management</h1>
      <p className="lede">Approve new registrations and assign roles. Roles control what each user can see and do.</p>
      {error && <div className="error">{error}</div>}
      {pending.length > 0 && <div className="notice">{pending.length} account{pending.length > 1 ? 's' : ''} awaiting approval.</div>}

      {!showAdd && <button onClick={() => setShowAdd(true)}>+ Add a user account</button>}
      {showAdd && (
        <form className="panel" onSubmit={addUser} style={{ margin: '12px 0' }}>
          <h2 style={{ marginTop: 0 }}>Add a user account</h2>
          <div className="form-grid">
            <label>Full name *<input type="text" value={form.name} onChange={setF('name')} required /></label>
            <label>Email *<input type="email" value={form.email} onChange={setF('email')} required /></label>
            <label>Role
              <select value={form.role} onChange={setF('role')}>{ROLES.map((r) => <option key={r} value={r}>{r}</option>)}</select>
            </label>
            <label>Status
              <select value={form.status} onChange={setF('status')}>
                <option value="active">active</option><option value="disabled">disabled</option><option value="pending">pending</option>
              </select>
            </label>
            <label>Grade <span className="hint">optional</span><input type="text" value={form.grade} onChange={setF('grade')} /></label>
            <label>Specialty <span className="hint">optional</span><input type="text" value={form.specialty} onChange={setF('specialty')} /></label>
          </div>
          <label>Password <span className="hint">leave blank to auto-generate a temporary one (user must change it at first login)</span>
            <input type="text" value={form.password} onChange={setF('password')} placeholder="(optional)" />
          </label>
          <div className="row-actions">
            <button>Create account</button>
            <button type="button" className="secondary" onClick={() => { setShowAdd(false); setForm(EMPTY_NEW); }}>Cancel</button>
          </div>
        </form>
      )}

      <div className="table-scroll">
      <table>
        <thead><tr><th>Name</th><th>Email</th><th>Grade / specialty</th><th>Role</th><th>Status</th><th></th></tr></thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id}>
              <td>{u.name}{u.id === me.id && <span className="tag blue">you</span>}</td>
              <td>{u.email}</td>
              <td className="muted">{[u.grade, u.specialty].filter(Boolean).join(' · ') || '—'}</td>
              <td>
                <select value={u.role} disabled={u.id === me.id} onChange={(e) => update(u, { role: e.target.value })}>
                  {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </td>
              <td>
                {u.status === 'pending' && <span className="tag amber">pending</span>}
                {u.status === 'active' && <span className="tag green">active</span>}
                {u.status === 'disabled' && <span className="tag red">disabled</span>}
              </td>
              <td className="row-actions">
                {u.status === 'pending' && <button className="small" onClick={() => update(u, { status: 'active' })}>Approve</button>}
                {u.status === 'active' && u.id !== me.id && <button className="small danger" onClick={() => update(u, { status: 'disabled' })}>Disable</button>}
                {u.status === 'disabled' && <button className="small secondary" onClick={() => update(u, { status: 'active' })}>Re-enable</button>}
                {u.status !== 'pending' && <button className="small secondary" onClick={() => resetPassword(u)}>Reset password</button>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  );
}
