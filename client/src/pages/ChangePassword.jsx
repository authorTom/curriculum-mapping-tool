import React, { useState } from 'react';
import { api } from '../api';

// Reused by the Account page and by the forced-change gate in App.
// `forced` hides the current-password field (admin has issued a temp password).
export default function ChangePassword({ forced = false, onDone }) {
  const [form, setForm] = useState({ current_password: '', new_password: '', confirm: '' });
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setError(''); setDone(false);
    if (form.new_password !== form.confirm) return setError('The two new passwords do not match');
    try {
      const d = await api.post('/auth/change-password', {
        current_password: form.current_password,
        new_password: form.new_password,
      });
      setForm({ current_password: '', new_password: '', confirm: '' });
      setDone(true);
      if (onDone) onDone(d.user);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <form className="panel" onSubmit={submit}>
      <h2 style={{ marginTop: 0 }}>{forced ? 'Choose a new password' : 'Change password'}</h2>
      {forced && <div className="notice">Your password was reset by an administrator. Please choose a new password to continue.</div>}
      {done && !forced && <div className="success">Password updated.</div>}
      {error && <div className="error">{error}</div>}
      {!forced && (
        <label>Current password
          <input type="password" value={form.current_password} onChange={set('current_password')} required />
        </label>
      )}
      <label>New password <span className="hint">at least 8 characters</span>
        <input type="password" value={form.new_password} onChange={set('new_password')} required />
      </label>
      <label>Confirm new password
        <input type="password" value={form.confirm} onChange={set('confirm')} required />
      </label>
      <button>{forced ? 'Set password and continue' : 'Update password'}</button>
    </form>
  );
}
