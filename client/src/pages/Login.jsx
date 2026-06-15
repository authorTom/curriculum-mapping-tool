import React, { useState } from 'react';
import { api } from '../api';
import { useAuth } from '../App';

export default function Login() {
  const { setUser } = useAuth();
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ name: '', email: '', password: '', requestedRole: 'trainee', grade: '', specialty: '' });
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setError(''); setMessage(''); setBusy(true);
    try {
      if (mode === 'login') {
        const d = await api.post('/auth/login', { email: form.email, password: form.password });
        setUser(d.user);
      } else {
        const d = await api.post('/auth/register', form);
        setMessage(d.message);
        setMode('login');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-wrap">
      <div className="brand-big">Curriculum Mapping Tool</div>
      <form className="panel" onSubmit={submit}>
        <h1>{mode === 'login' ? 'Sign in' : 'Request an account'}</h1>
        {message && <div className="success">{message}</div>}
        {error && <div className="error">{error}</div>}

        {mode === 'register' && (
          <>
            <label>Full name
              <input type="text" value={form.name} onChange={set('name')} required />
            </label>
            <label>I am a…
              <select value={form.requestedRole} onChange={set('requestedRole')}>
                <option value="trainee">Trainee / student</option>
                <option value="educator">Educator</option>
                <option value="manager">Education manager</option>
                <option value="qa">Quality assurance reviewer</option>
              </select>
              <span className="hint">Your role is confirmed by an administrator at approval.</span>
            </label>
            <label>Grade <span className="hint">e.g. FY1, IMT2, ST5, Consultant (optional)</span>
              <input type="text" value={form.grade} onChange={set('grade')} />
            </label>
            <label>Specialty <span className="hint">optional</span>
              <input type="text" value={form.specialty} onChange={set('specialty')} />
            </label>
          </>
        )}

        <label>Email address
          <input type="email" value={form.email} onChange={set('email')} required autoFocus />
        </label>
        <label>Password {mode === 'register' && <span className="hint">at least 8 characters</span>}
          <input type="password" value={form.password} onChange={set('password')} required />
        </label>

        <button disabled={busy}>{mode === 'login' ? 'Sign in' : 'Request account'}</button>
        <p>
          {mode === 'login' ? (
            <>New here? <a href="#" onClick={(e) => { e.preventDefault(); setMode('register'); setError(''); }}>Request an account</a></>
          ) : (
            <>Already approved? <a href="#" onClick={(e) => { e.preventDefault(); setMode('login'); setError(''); }}>Sign in</a></>
          )}
        </p>
      </form>
    </div>
  );
}
