import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await api.post('/auth/forgot-password', { email: email.trim() });
      setSent(true);
    } catch (err) {
      setError(err.errors?.map((x) => x.message).join('. ') || err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow">
        <h1 className="mb-1 text-2xl font-bold text-indigo-600">DevSync</h1>
        <p className="mb-6 text-slate-500">Reset your password</p>

        {sent ? (
          <>
            <div className="mb-4 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">
              If that email has an account, we sent a reset link. It expires in 1 hour. Check your spam folder too.
            </div>
            <Link to="/login" className="font-medium text-indigo-600">
              Back to log in
            </Link>
          </>
        ) : (
          <form onSubmit={submit}>
            {error && <div className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
            <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mb-4 w-full rounded-lg border border-slate-300 px-3 py-2"
            />
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-lg bg-indigo-600 px-4 py-2 font-medium text-white disabled:opacity-60"
            >
              {busy ? 'Sending...' : 'Send reset link'}
            </button>
            <p className="mt-4 text-center text-sm text-slate-500">
              <Link to="/login" className="text-indigo-600">
                Back to log in
              </Link>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}