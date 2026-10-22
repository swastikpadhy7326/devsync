import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../AuthContext';

const PENDING_KEY = 'devsync_pending_invite';

export default function InvitePage() {
  const { token } = useParams();
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const started = useRef(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (loading) return;

    if (!user) {
      // Remember the token while the person logs in or registers
      try {
        sessionStorage.setItem(PENDING_KEY, token);
      } catch {
        /* storage can be blocked; the person can open the link again */
      }
      return;
    }

    // The token works only once, so make sure we send the request only once
    if (started.current) return;
    started.current = true;

    try {
      sessionStorage.removeItem(PENDING_KEY);
    } catch {
      /* ignore */
    }

    api
      .post('/invitations/accept', { token })
      .then((data) => navigate(`/teams/${data.teamId}`, { replace: true }))
      .catch((err) => setError(err.message));
  }, [loading, user, token, navigate]);

  let body;
  if (loading) {
    body = <p className="text-slate-500">Loading...</p>;
  } else if (!user) {
    body = (
      <>
        <p className="mb-6 text-slate-600">
          You have been invited to join a team. Log in or create an account with the email address
          that received the invitation, and you will join automatically.
        </p>
        <div className="flex gap-3">
          <Link to="/login" className="flex-1 rounded-lg bg-indigo-600 px-4 py-2 text-center font-medium text-white">
            Log in
          </Link>
          <Link to="/register" className="flex-1 rounded-lg border border-slate-300 px-4 py-2 text-center font-medium text-slate-700">
            Create account
          </Link>
        </div>
      </>
    );
  } else if (error) {
    body = (
      <>
        <div className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
        <p className="mb-6 text-sm text-slate-600">
          Make sure you are logged in with the same email address that was invited. Each invitation works once
          and expires after 7 days.
        </p>
        <Link to="/" className="font-medium text-indigo-600">
          Go to your teams
        </Link>
      </>
    );
  } else {
    body = <p className="text-slate-600">Joining the team...</p>;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow">
        <h1 className="mb-4 text-2xl font-bold text-indigo-600">DevSync</h1>
        {body}
      </div>
    </div>
  );
}