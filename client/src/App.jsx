import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './AuthContext';
import AuthPage from './pages/AuthPage';
import Dashboard from './pages/Dashboard';
import TeamPage from './pages/TeamPage';
import BoardPage from './pages/BoardPage';

function Protected({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="p-8 text-slate-500">Loading...</div>;
  return user ? children : <Navigate to="/login" replace />;
}

function GuestOnly({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="p-8 text-slate-500">Loading...</div>;
  return user ? <Navigate to="/" replace /> : children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<GuestOnly><AuthPage mode="login" /></GuestOnly>} />
      <Route path="/register" element={<GuestOnly><AuthPage mode="register" /></GuestOnly>} />
      <Route path="/" element={<Protected><Dashboard /></Protected>} />
      <Route path="/teams/:teamId" element={<Protected><TeamPage /></Protected>} />
      <Route path="/projects/:projectId" element={<Protected><BoardPage /></Protected>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}