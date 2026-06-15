import React, { createContext, useContext, useEffect, useState } from 'react';
import { Routes, Route, NavLink, Navigate, useNavigate } from 'react-router-dom';
import { api } from './api';
import Login from './pages/Login';
import TraineeDashboard from './pages/TraineeDashboard';
import Portfolio from './pages/Portfolio';
import Browse from './pages/Browse';
import OpportunityDetail from './pages/OpportunityDetail';
import MyOpportunities from './pages/MyOpportunities';
import OpportunityForm from './pages/OpportunityForm';
import QAQueue from './pages/QAQueue';
import ManagerReport from './pages/ManagerReport';
import AdminUsers from './pages/AdminUsers';
import AdminCurricula from './pages/AdminCurricula';

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

const NAV = {
  trainee: [
    ['/', 'My dashboard'],
    ['/portfolio', 'My portfolio'],
    ['/browse', 'Find learning'],
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

  return (
    <AuthContext.Provider value={{ user, setUser }}>
      {!user ? (
        <Login />
      ) : (
        <>
          <header className="site-header">
            <NavLink to="/" className="brand">Curriculum Mapping Tool</NavLink>
            <nav>
              {(NAV[user.role] || []).map(([to, label]) => (
                <NavLink key={to} to={to} end={to === '/'}>{label}</NavLink>
              ))}
            </nav>
            <div className="spacer" />
            <span className="who">{user.name} · {user.role}</span>
            <button className="small secondary" onClick={logout} style={{ margin: '10px 0' }}>Sign out</button>
          </header>
          <main>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/portfolio" element={<Portfolio />} />
              <Route path="/browse" element={<Browse />} />
              <Route path="/opportunities/new" element={<OpportunityForm />} />
              <Route path="/opportunities/:id/edit" element={<OpportunityForm />} />
              <Route path="/opportunities/:id" element={<OpportunityDetail />} />
              <Route path="/qa" element={<QAQueue />} />
              <Route path="/provision" element={<ManagerReport />} />
              <Route path="/curricula" element={<AdminCurricula />} />
              <Route path="*" element={<Navigate to="/" />} />
            </Routes>
            <p className="footer-note">
              Internal pilot — seeded curriculum content is abridged sample data; verify against official published curricula.
            </p>
          </main>
        </>
      )}
    </AuthContext.Provider>
  );
}
