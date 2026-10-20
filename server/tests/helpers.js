const request = require('supertest');
const app = require('../src/app');
const pool = require('../src/db');

const PASSWORD = 'Password123';
let counter = 0;
const unique = () => `${Date.now()}${process.pid}${counter++}`;

// Creates a new user and returns their tokens and a ready-to-use auth header
async function registerUser(name = 'Test User') {
  const email = `user${unique()}@example.com`;
  const res = await request(app)
    .post('/api/auth/register')
    .send({ name, email, password: PASSWORD });
  if (res.status !== 201) throw new Error(`register failed: ${res.status} ${JSON.stringify(res.body)}`);
  return {
    name,
    email,
    password: PASSWORD,
    user: res.body.user,
    accessToken: res.body.accessToken,
    refreshToken: res.body.refreshToken,
    auth: { Authorization: `Bearer ${res.body.accessToken}` },
  };
}

async function createTeam(owner, name = 'Test Team') {
  const res = await request(app).post('/api/teams').set(owner.auth).send({ name });
  if (res.status !== 201) throw new Error(`createTeam failed: ${res.status}`);
  return res.body.team;
}

// Invites `member` into the team and makes them accept
async function addMember(team, owner, member, role = 'member') {
  const inv = await request(app)
    .post(`/api/teams/${team.id}/invitations`)
    .set(owner.auth)
    .send({ email: member.email, role });
  if (inv.status !== 201) throw new Error(`invite failed: ${inv.status} ${JSON.stringify(inv.body)}`);
  const accepted = await request(app)
    .post('/api/invitations/accept')
    .set(member.auth)
    .send({ token: inv.body.inviteToken });
  if (accepted.status !== 200) throw new Error(`accept failed: ${accepted.status}`);
}

async function createProject(owner, team, name = 'Test Project') {
  const res = await request(app)
    .post(`/api/teams/${team.id}/projects`)
    .set(owner.auth)
    .send({ name });
  if (res.status !== 201) throw new Error(`createProject failed: ${res.status}`);
  return res.body.project;
}

async function createTask(user, project, body) {
  const res = await request(app)
    .post(`/api/projects/${project.id}/tasks`)
    .set(user.auth)
    .send(body);
  if (res.status !== 201) throw new Error(`createTask failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.task;
}

async function getBoard(user, project) {
  const res = await request(app).get(`/api/projects/${project.id}/board`).set(user.auth);
  return res.body.board;
}

const closeDb = () => pool.end();

module.exports = {
  request,
  app,
  PASSWORD,
  registerUser,
  createTeam,
  addMember,
  createProject,
  createTask,
  getBoard,
  closeDb,
};
