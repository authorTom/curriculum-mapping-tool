import React, { createContext, useContext, useEffect, useState } from 'react';
import { Routes, Route, NavLink, Navigate, useNavigate } from 'react-router-dom';
import { api } from './api';
import Login from './pages/Login';
import TraineeDashboard from './pages/TraineeDashboard';
import Portfolio from './pages/Portfolio';
import Browse from './pages/Browse';
import Bookmarks from './pages/Bookmarks';
import OpportunityDetail from './pages/OpportunityDetail';
import MyOpportunities from './pages/MyOpportunities';
import OpportunityForm from './pages/OpportunityForm';
import QAQueue from './pages/QAQueue';
import ManagerReport from './pages/ManagerReport';
import AdminUsers from './pages/AdminUsers';
import AdminCurricula from './pages/AdminCurricula';
import AdminImport from './pages/AdminImport';
import Account from './pages/Account';
import ChangePassword from './pages/ChangePassword';

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

const NAV = {
  trainee: [
    ['/', 'My dashboard'],
    ['/portfolio', 'My portfolio'],
    ['/browse', 'Find learning'],
    ['/bookmarks', 'Saved'],
  ],
  educator: [
    ['/', 'My opportunities'],
    ['/opportunities/new', 'Add opportunity'],
    ['/browse', 'Browse all'],
  ],
  manager: [
    ['/', 'Provision report'],
    ['/browse', 'Browse opportunities'],
  ],
  qa: [
    ['/', 'QA review queue'],
    ['/provision', 'Provision report'],
    ['/browse', 'Browse opportunities'],
  ],
  admin: [
    ['/', 'Users'],
    ['/curricula', 'Curricula'],
    ['/import', 'Import'],
    ['/provision', 'Provision report'],
    ['/qa', 'QA queue'],
    ['/browse', 'Browse'],
  ],
};

function Home() {
  const { user } = useAuth();
  switch (user.role) {
    case 'trainee': return <TraineeDashboard />;
    case 'educator': return <MyOpportunities />;
    case 'manager': return <ManagerReport />;
    case 'qa': return <QAQueue />;
    case 'admin': return <AdminUsers />;
    default: return <Navigate to="/browse" />;
  }
}

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    api.get('/auth/me')
      .then((d) => setUser(d.user))
      .finally(() => setLoading(false));
  }, []);

  async function logout() {
    await api.post('/auth/logout');
    setUser(null);
    navigate('/');
  }

  if (loading) return null;

  // Login and the forced-password-change screen must still sit inside the
  // provider so useAuth() is available to them.
  if (!user) {
    return (
      <AuthContext.Provider value={{ user, setUser }}>
        <Login />
      </AuthContext.Provider>
    );
  }

  if (user.must_change_password) {
    return (
      <AuthContext.Provider value={{ user, setUser }}>
        <main className="auth-wrap">
          <div className="brand-big">Curriculum Mapping Tool</div>
          <ChangePassword forced onDone={(u) => setUser(u)} />
        </main>
      </AuthContext.Provider>
    );
  }

  return (
    <AuthContext.Provider value={{ user, setUser }}>
      <header className="site-header">
        <NavLink to="/" className="brand" onClick={() => setMenuOpen(false)}>Curriculum Mapping Tool</NavLink>
        <button className="nav-toggle" aria-label="Menu" onClick={() => setMenuOpen((o) => !o)}>☰</button>
        <nav className={menuOpen ? 'open' : ''} onClick={() => setMenuOpen(false)}>
          {(NAV[user.role] || []).map(([to, label]) => (
            <NavLink key={to} to={to} end={to === '/'}>{label}</NavLink>
          ))}
          <NavLink to="/account">Account</NavLink>
          <a href="#" onClick={(e) => { e.preventDefault(); logout(); }} className="nav-signout">Sign out</a>
        </nav>
        <div className="spacer" />
        <span className="who">{user.name} · {user.role}</span>
      </header>
      <main>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/portfolio" element={<Portfolio />} />
          <Route path="/browse" element={<Browse />} />
          <Route path="/bookmarks" element={<Bookmarks />} />
          <Route path="/opportunities/new" element={<OpportunityForm />} />
          <Route path="/opportunities/:id/edit" element={<OpportunityForm />} />
          <Route path="/opportunities/:id" element={<OpportunityDetail />} />
          <Route path="/qa" element={<QAQueue />} />
          <Route path="/provision" element={<ManagerReport />} />
          <Route path="/curricula" element={<AdminCurricula />} />
          <Route path="/import" element={<AdminImport />} />
          <Route path="/account" element={<Account />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
        <p className="footer-note">
          Internal pilot — seeded curriculum content is abridged/top-level sample data; verify against official published curricula.
        </p>
      </main>
    </AuthContext.Provider>
  );
}
