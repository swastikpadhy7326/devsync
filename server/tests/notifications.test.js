const {
  request, app, registerUser, createTeam, addMember, createProject, createTask, closeDb,
} = require('./helpers');

afterAll(closeDb);

async function setup() {
  const owner = await registerUser('Owner');
  const member = await registerUser('Member');
  const team = await createTeam(owner);
  await addMember(team, owner, member);
  const project = await createProject(owner, team);
  return { owner, member, project };
}

const inbox = async (user, query = '') => {
  const res = await request(app).get(`/api/notifications${query}`).set(user.auth);
  return res.body;
};

describe('notifications', () => {
  test('assigning a task notifies the assignee', async () => {
    const { owner, member, project } = await setup();
    await createTask(owner, project, { title: 'Do this', assigneeId: member.user.id });

    const data = await inbox(member);
    expect(data.unreadCount).toBe(1);
    expect(data.notifications[0].type).toBe('task_assigned');
    expect(data.notifications[0].message).toContain('Do this');
    expect(data.notifications[0].project_id).toBe(project.id);
  });

  test('assigning a task to yourself does not notify you', async () => {
    const { owner, project } = await setup();
    await createTask(owner, project, { title: 'My own task', assigneeId: owner.user.id });

    const data = await inbox(owner);
    expect(data.unreadCount).toBe(0);
  });

  test('changing the assignee later notifies the new assignee', async () => {
    const { owner, member, project } = await setup();
    const task = await createTask(owner, project, { title: 'Reassign me' });

    await request(app)
      .patch(`/api/tasks/${task.id}`)
      .set(owner.auth)
      .send({ assigneeId: member.user.id });

    const data = await inbox(member);
    expect(data.unreadCount).toBe(1);
  });

  test('a comment notifies the task creator and assignee, but not the commenter', async () => {
    const { owner, member, project } = await setup();
    const task = await createTask(owner, project, { title: 'Talk', assigneeId: member.user.id });

    await request(app)
      .post(`/api/tasks/${task.id}/comments`)
      .set(member.auth)
      .send({ body: 'On it' });

    const ownerInbox = await inbox(owner);
    expect(ownerInbox.notifications.map((n) => n.type)).toEqual(['comment_added']);

    // The member has only the assignment notification, nothing for their own comment
    const memberInbox = await inbox(member);
    expect(memberInbox.notifications.map((n) => n.type)).toEqual(['task_assigned']);
  });

  test('marking notifications as read updates the unread count', async () => {
    const { owner, member, project } = await setup();
    await createTask(owner, project, { title: 'One', assigneeId: member.user.id });
    await createTask(owner, project, { title: 'Two', assigneeId: member.user.id });

    const before = await inbox(member, '?unread=true');
    expect(before.unreadCount).toBe(2);

    const readOne = await request(app)
      .patch(`/api/notifications/${before.notifications[0].id}/read`)
      .set(member.auth);
    expect(readOne.status).toBe(200);
    expect((await inbox(member)).unreadCount).toBe(1);

    await request(app).post('/api/notifications/read-all').set(member.auth);
    expect((await inbox(member)).unreadCount).toBe(0);
    expect((await inbox(member, '?unread=true')).notifications).toHaveLength(0);
  });

  test("you cannot mark someone else's notification as read", async () => {
    const { owner, member, project } = await setup();
    await createTask(owner, project, { title: 'Private', assigneeId: member.user.id });
    const memberInbox = await inbox(member);

    const res = await request(app)
      .patch(`/api/notifications/${memberInbox.notifications[0].id}/read`)
      .set(owner.auth);

    expect(res.status).toBe(404);
  });
});
