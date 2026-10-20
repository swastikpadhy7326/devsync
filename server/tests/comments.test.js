const {
  request, app, registerUser, createTeam, addMember, createProject, createTask, closeDb,
} = require('./helpers');

afterAll(closeDb);

async function setup() {
  const owner = await registerUser('Owner');
  const member = await registerUser('Member');
  const outsider = await registerUser('Outsider');
  const team = await createTeam(owner);
  await addMember(team, owner, member);
  const project = await createProject(owner, team);
  const task = await createTask(owner, project, { title: 'Discuss me' });
  return { owner, member, outsider, task };
}

const comment = (user, task, body) =>
  request(app).post(`/api/tasks/${task.id}/comments`).set(user.auth).send({ body });

describe('comments', () => {
  test('a member can comment and the list shows the author', async () => {
    const { member, task } = await setup();
    const res = await comment(member, task, 'Looks good to me');
    expect(res.status).toBe(201);
    expect(res.body.comment.user_name).toBe('Member');

    const list = await request(app).get(`/api/tasks/${task.id}/comments`).set(member.auth);
    expect(list.status).toBe(200);
    expect(list.body.total).toBe(1);
    expect(list.body.comments[0].body).toBe('Looks good to me');
  });

  test('comments are listed oldest first', async () => {
    const { owner, task } = await setup();
    await comment(owner, task, 'first');
    await comment(owner, task, 'second');

    const list = await request(app).get(`/api/tasks/${task.id}/comments`).set(owner.auth);
    expect(list.body.comments.map((c) => c.body)).toEqual(['first', 'second']);
  });

  test('an empty comment is rejected', async () => {
    const { owner, task } = await setup();
    const res = await comment(owner, task, '   ');

    expect(res.status).toBe(400);
  });

  test('an outsider cannot read or write comments', async () => {
    const { outsider, task } = await setup();

    const write = await comment(outsider, task, 'hello');
    expect(write.status).toBe(404);

    const read = await request(app).get(`/api/tasks/${task.id}/comments`).set(outsider.auth);
    expect(read.status).toBe(404);
  });

  test('members delete only their own comments, owners can delete any', async () => {
    const { owner, member, task } = await setup();
    const ownersComment = (await comment(owner, task, 'from the owner')).body.comment;
    const membersComment = (await comment(member, task, 'from the member')).body.comment;

    const denied = await request(app).delete(`/api/comments/${ownersComment.id}`).set(member.auth);
    expect(denied.status).toBe(403);

    const own = await request(app).delete(`/api/comments/${membersComment.id}`).set(member.auth);
    expect(own.status).toBe(200);

    const byOwner = await request(app).delete(`/api/comments/${ownersComment.id}`).set(owner.auth);
    expect(byOwner.status).toBe(200);
  });
});
