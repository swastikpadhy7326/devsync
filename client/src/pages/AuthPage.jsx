import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext';

export default function AuthPage({ mode }) {
  const isRegister = mode === 'register';
  const { login, register } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const update = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      if (isRegister) await register(form.name, form.email, form.password);
      else await login(form.email, form.password);
      navigate('/');
    } catch (err) {
      setError(err.errors?.map((x) => x.message).join('. ') || err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const input = 'w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200';

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <form onSubmit={submit} className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-md">
        <h1 className="mb-1 text-2xl font-bold text-indigo-600">DevSync</h1>
        <p className="mb-6 text-sm text-slate-500">
          {isRegister ? 'Create your account' : 'Log in to your workspace'}
        </p>

        {error && <div className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

        {isRegister && (
          <label className="mb-4 block text-sm font-medium">
            Name
            <input className={`${input} mt-1`} value={form.name} onChange={update('name')} required />
          </label>
        )}
        <label className="mb-4 block text-sm font-medium">
          Email
          <input type="email" className={`${input} mt-1`} value={form.email} onChange={update('email')} required />
        </label>
        <label className="mb-6 block text-sm font-medium">
          Password
          <input type="password" className={`${input} mt-1`} value={form.password} onChange={update('password')} required />
        </label>

        <button
          disabled={submitting}
          className="w-full rounded-lg bg-indigo-600 py-2 font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
        >
          {submitting ? 'Please wait...' : isRegister ? 'Sign up' : 'Log in'}
        </button>

        {!isRegister && (
          <p className="mt-3 text-center text-sm">
            <Link to="/forgot-password" className="text-indigo-600">Forgot your password?</Link>
          </p>
        )}

        <p className="mt-4 text-center text-sm text-slate-500">
          {isRegister ? (
            <>Already have an account? <Link to="/login" className="text-indigo-600">Log in</Link></>
          ) : (
            <>New here? <Link to="/register" className="text-indigo-600">Create an account</Link></>
          )}
        </p>
      </form>
    </div>
  );
}