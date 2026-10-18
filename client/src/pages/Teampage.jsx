import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../AuthContext';
import Layout from '../components/Layout';

const input = 'rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200';
const button = 'rounded-lg bg-indigo-600 px-4 py-2 font-medium text-white hover:bg-indigo-700 disabled:opacity-60';

export default function TeamPage() {
  const { teamId } = useParams();
  const { user } = useAuth();

  const [team, setTeam] = useState(null);
  const [members, setMembers] = useState([]);
  const [yourRole, setYourRole] = useState('');
  const [projects, setProjects] = useState([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [projectName, setProjectName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('member');
  const [inviteToken, setInviteToken] = useState('');

  const canManage = yourRole === 'owner' || yourRole === 'admin';
  const isOwner = yourRole === 'owner';

  const load = async () => {
    try {
      const [teamData, projectData] = await Promise.all([
        api.get(`/teams/${teamId}`),
        api.get(`/teams/${teamId}/projects`),
      ]);
      setTeam(teamData.team);
      setMembers(teamData.members);
      setYourRole(teamData.yourRole);
      setProjects(projectData.projects);
    } catch (err) {
      setError(err.message);
    }
  };

  useEffect(() => { load(); }, [teamId]);

  const run = async (fn) => {
    setError('');
    setNotice('');
    try {
      await fn();
    } catch (err) {
      setError(err.errors?.map((x) => x.message).join('. ') || err.message);
    }
  };

  const createProject = (e) => {
    e.preventDefault();
    run(async () => {
      await api.post(`/teams/${teamId}/projects`, { name: projectName });
      setProjectName('');
      await load();
    });
  };

  const invite = (e) => {
    e.preventDefault();
    run(async () => {
      const data = await api.post(`/teams/${teamId}/invitations`, { email: inviteEmail, role: inviteRole });
      setInviteToken(data.inviteToken);
      setNotice(`Invitation created for ${inviteEmail}. Share the token below. It expires in 7 days.`);
      setInviteEmail('');
    });
  };

  const changeRole = (userId, role) => run(async () => {
    await api.patch(`/teams/${teamId}/members/${userId}`, { role });
    await load();
  });

  const removeMember = (userId) => run(async () => {
    if (!window.confirm('Remove this member?')) return;
    await api.delete(`/teams/${teamId}/members/${userId}`);
    await load();
  });

  if (!team) {
    return <Layout>{error ? <p className="text-red-600">{error}</p> : <p className="text-slate-500">Loading...</p>}</Layout>;
  }

  return (
    <Layout>
      <Link to="/" className="text-sm text-indigo-600">← All teams</Link>
      <h2 className="mb-1 mt-2 text-2xl font-bold">{team.name}</h2>
      <p className="mb-6 text-sm text-slate-500">Your role: {yourRole}</p>

      {error && <div className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {notice && <div className="mb-4 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">{notice}</div>}

      <section className="mb-8">
        <h3 className="mb-3 text-lg font-semibold">Projects</h3>
        {projects.length === 0 ? (
          <p className="text-slate-500">No projects yet.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {projects.map((p) => (
              <div key={p.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="font-semibold">{p.name}</div>
                {p.description && <div className="mt-1 text-sm text-slate-500">{p.description}</div>}
                <div className="mt-2 text-sm text-slate-500">{p.done_count} of {p.task_count} tasks done</div>
              </div>
            ))}
          </div>
        )}

        {canManage && (
          <form onSubmit={createProject} className="mt-4 flex gap-2">
            <input className={`${input} flex-1`} placeholder="New project name" value={projectName} onChange={(e) => setProjectName(e.target.value)} required />
            <button className={button}>Add project</button>
          </form>
        )}
      </section>

      <section className="mb-8">
        <h3 className="mb-3 text-lg font-semibold">Members ({members.length})</h3>
        <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
          {members.map((m) => (
            <div key={m.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div>
                <div className="font-medium">{m.name} {m.id === user.id && <span className="text-xs text-slate-400">(you)</span>}</div>
                <div className="text-sm text-slate-500">{m.email}</div>
              </div>
              <div className="flex items-center gap-2">
                {isOwner && m.role !== 'owner' ? (
                  <select className="rounded-lg border border-slate-300 px-2 py-1 text-sm" value={m.role} onChange={(e) => changeRole(m.id, e.target.value)}>
                    <option value="member">member</option>
                    <option value="admin">admin</option>
                  </select>
                ) : (
                  <span className="rounded-full bg-slate-100 px-2 py-1 text-xs">{m.role}</span>
                )}
                {m.role !== 'owner' && (isOwner || (yourRole === 'admin' && m.role === 'member') || m.id === user.id) && (
                  <button onClick={() => removeMember(m.id)} className="text-sm text-red-600 hover:underline">
                    {m.id === user.id ? 'Leave' : 'Remove'}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      {canManage && (
        <section>
          <h3 className="mb-3 text-lg font-semibold">Invite someone</h3>
          <form onSubmit={invite} className="flex flex-wrap gap-2">
            <input type="email" className={`${input} min-w-64 flex-1`} placeholder="Their email address" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} required />
            <select className={input} value={inviteRole} onChange={(e) => setInviteRole(e.target.value)}>
              <option value="member">member</option>
              {isOwner && <option value="admin">admin</option>}
            </select>
            <button className={button}>Create invite</button>
          </form>

          {inviteToken && (
            <div className="mt-3 rounded-lg bg-slate-100 p-3 text-sm">
              <div className="mb-1 font-medium">Invite token (shown once)</div>
              <code className="break-all">{inviteToken}</code>
              <p className="mt-2 text-slate-500">
                They must log in with the invited email address, then paste this token on their dashboard under "Join with an invite token".
              </p>
            </div>
          )}
        </section>
      )}
    </Layout>
  );
}