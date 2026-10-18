import { Link } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import NotificationBell from './NotificationBell';

export default function Layout({ children, wide = false }) {
  const { user, logout } = useAuth();
  const width = wide ? 'max-w-7xl' : 'max-w-5xl';

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className={`mx-auto flex ${width} items-center justify-between px-4 py-3`}>
          <Link to="/" className="text-xl font-bold text-indigo-600">DevSync</Link>
          <div className="flex items-center gap-3 text-sm">
            <NotificationBell />
            <span className="text-slate-600">{user.name}</span>
            <button
              onClick={logout}
              className="rounded-lg border border-slate-300 px-3 py-1 hover:bg-slate-100"
            >
              Log out
            </button>
          </div>
        </div>
      </header>
      <main className={`mx-auto ${width} px-4 py-8`}>{children}</main>
    </div>
  );
}