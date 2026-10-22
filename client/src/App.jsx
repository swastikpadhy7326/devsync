import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './AuthContext';
import AuthPage from './pages/AuthPage';
import Dashboard from './pages/Dashboard';
import TeamPage from './pages/TeamPage';
import BoardPage from './pages/BoardPage';
import InvitePage from './pages/InvitePage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import ResetPasswordPage from './pages/ResetPasswordPage';

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

// After login the app goes to "/". If an invitation link was waiting, finish it first.
function Home() {
  let pending = null;
  try {
    pending = sessionStorage.getItem('devsync_pending_invite');
  } catch {
    /* ignore */
  }
  if (pending) return <Navigate to={`/invite/${pending}`} replace />;
  return <Dashboard />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<GuestOnly><AuthPage mode="login" /></GuestOnly>} />
      <Route path="/register" element={<GuestOnly><AuthPage mode="register" /></GuestOnly>} />
      <Route path="/invite/:token" element={<InvitePage />} />
            <Route path="/forgot-password" element={<GuestOnly><ForgotPasswordPage /></GuestOnly>} />
      <Route path="/reset-password/:token" element={<ResetPasswordPage />} />
      <Route path="/" element={<Protected><Home /></Protected>} />
      <Route path="/teams/:teamId" element={<Protected><TeamPage /></Protected>} />
      <Route path="/projects/:projectId" element={<Protected><BoardPage /></Protected>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}