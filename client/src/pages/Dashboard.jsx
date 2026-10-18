import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import Layout from '../components/Layout';

const input = 'rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200';
const button = 'rounded-lg bg-indigo-600 px-4 py-2 font-medium text-white hover:bg-indigo-700 disabled:opacity-60';

export default function Dashboard() {
  const [teams, setTeams] = useState(null);
  const [name, setName] = useState('');
  const [token, setToken] = useState('');
  const [message, setMessage] = useState({ type: '', text: '' });

  const load = async () => {
    const data = await api.get('/teams');
    setTeams(data.teams);
  };

  useEffect(() => { load().catch((e) => setMessage({ type: 'error', text: e.message })); }, []);

  const createTeam = async (e) => {
    e.preventDefault();
    setMessage({ type: '', text: '' });
    try {
      await api.post('/teams', { name });
      setName('');
      await load();
    } catch (err) {
      setMessage({ type: 'error', text: err.errors?.map((x) => x.message).join('. ') || err.message });
    }
  };

  const acceptInvite = async (e) => {
    e.preventDefault();
    setMessage({ type: '', text: '' });
    try {
      await api.post('/invitations/accept', { token: token.trim() });
      setToken('');
      setMessage({ type: 'success', text: 'You joined the team.' });
      await load();
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    }
  };

  return (
    <Layout>
      <h2 className="mb-4 text-xl font-semibold">Your teams</h2>

      {message.text && (
        <div className={`mb-4 rounded-lg px-3 py-2 text-sm ${message.type === 'error' ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
          {message.text}
        </div>
      )}

      {teams === null ? (
        <p className="text-slate-500">Loading...</p>
      ) : teams.length === 0 ? (
        <p className="mb-6 text-slate-500">You are not in any team yet. Create one below, or join with an invite token.</p>
      ) : (
        <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {teams.map((t) => (
            <Link
              key={t.id}
              to={`/teams/${t.id}`}
              className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm hover:border-indigo-400 hover:shadow"
            >
              <div className="font-semibold">{t.name}</div>
              <div className="mt-1 text-sm text-slate-500">
                {t.member_count} {t.member_count === 1 ? 'member' : 'members'} · you are {t.role}
              </div>
            </Link>
          ))}
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        <form onSubmit={createTeam} className="rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="mb-3 font-semibold">Create a team</h3>
          <div className="flex gap-2">
            <input className={`${input} flex-1`} placeholder="Team name" value={name} onChange={(e) => setName(e.target.value)} required />
            <button className={button}>Create</button>
          </div>
        </form>

        <form onSubmit={acceptInvite} className="rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="mb-3 font-semibold">Join with an invite token</h3>
          <div className="flex gap-2">
            <input className={`${input} flex-1`} placeholder="Paste invite token" value={token} onChange={(e) => setToken(e.target.value)} required />
            <button className={button}>Join</button>
          </div>
        </form>
      </div>
    </Layout>
  );
}