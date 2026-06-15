import React, { useEffect, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../App';

const ROLES = ['trainee', 'educator', 'manager', 'qa', 'admin'];

export default function AdminUsers() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState([]);
  const [error, setError] = useState('');

  const load = () => api.get('/users').then((d) => setUsers(d.users));
  useEffect(() => { load(); }, []);

  async function update(u, changes) {
    setError('');
    try {
      await api.put(`/users/${u.id}`, { role: u.role, status: u.status, ...changes });
      load();
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
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
