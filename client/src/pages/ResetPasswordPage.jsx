import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api';

export default function ResetPasswordPage() {
  const { token } = useParams();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (password.length < 8) return setError('Password must be at least 8 characters');
    if (password !== confirm) return setError('The two passwords do not match');

    setBusy(true);
    try {
      await api.post('/auth/reset-password', { token, password });
      setDone(true);
    } catch (err) {
      setError(err.errors?.map((x) => x.message).join('. ') || err.message);
    } finally {
      setBusy(false);
    }
  };

  const inputClass = 'mb-4 w-full rounded-lg border border-slate-300 px-3 py-2';

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow">
        <h1 className="mb-1 text-2xl font-bold text-indigo-600">DevSync</h1>
        <p className="mb-6 text-slate-500">Choose a new password</p>

        {done ? (
          <>
            <div className="mb-4 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">
              Your password was updated. You were signed out everywhere, so log in with the new one.
            </div>
            <Link to="/login" className="font-medium text-indigo-600">
              Go to log in
            </Link>
          </>
        ) : (
          <form onSubmit={submit}>
            {error && <div className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
            <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="password">
              New password
            </label>
            <input
              id="password"
              type="password"
              required
              minLength={8}
              maxLength={72}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputClass}
            />
            <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="confirm">
              Confirm new password
            </label>
            <input
              id="confirm"
              type="password"
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className={inputClass}
            />
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-lg bg-indigo-600 px-4 py-2 font-medium text-white disabled:opacity-60"
            >
              {busy ? 'Saving...' : 'Set new password'}
            </button>
            <p className="mt-4 text-center text-sm text-slate-500">
              Link expired? <Link to="/forgot-password" className="text-indigo-600">Ask for a new one</Link>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}