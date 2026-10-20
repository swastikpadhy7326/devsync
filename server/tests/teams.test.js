const {
  request, app, registerUser, createTeam, addMember, closeDb,
} = require('./helpers');

afterAll(closeDb);

describe('creating and viewing teams', () => {
  test('the creator becomes the owner', async () => {
    const owner = await registerUser();
    const res = await request(app).post('/api/teams').set(owner.auth).send({ name: 'Alpha' });

    expect(res.status).toBe(201);
    expect(res.body.team.role).toBe('owner');
  });

  test('a team name must have at least 2 characters', async () => {
    const owner = await registerUser();
    const res = await request(app).post('/api/teams').set(owner.auth).send({ name: 'A' });

    expect(res.status).toBe(400);
  });

  test('lists only the teams you belong to', async () => {
    const owner = await registerUser();
    const other = await registerUser();
    const mine = await createTeam(owner, 'Mine');
    await createTeam(other, 'Theirs');

    const res = await request(app).get('/api/teams').set(owner.auth);

    expect(res.status).toBe(200);
    expect(res.body.teams.map((t) => t.id)).toEqual([mine.id]);
    expect(res.body.teams[0].member_count).toBe(1);
  });

  test('a non-member gets 404, so team ids cannot be probed', async () => {
    const owner = await registerUser();
    const outsider = await registerUser();
    const team = await createTeam(owner);

    const res = await request(app).get(`/api/teams/${team.id}`).set(outsider.auth);

    expect(res.status).toBe(404);
  });

  test('an invalid team id gives 400', async () => {
    const owner = await registerUser();
    const res = await request(app).get('/api/teams/not-a-uuid').set(owner.auth);

    expect(res.status).toBe(400);
  });
});

describe('invitations', () => {
  test('a member cannot invite people', async () => {
    const owner = await registerUser();
    const member = await registerUser();
    const team = await createTeam(owner);
    await addMember(team, owner, member);

    const res = await request(app)
      .post(`/api/teams/${team.id}/invitations`)
      .set(member.auth)
      .send({ email: `someone${Date.now()}@example.com` });

    expect(res.status).toBe(403);
  });

  test('an admin can invite members, but only the owner can invite admins', async () => {
    const owner = await registerUser();
    const admin = await registerUser();
    const team = await createTeam(owner);
    await addMember(team, owner, admin, 'admin');

    const asMember = await request(app)
      .post(`/api/teams/${team.id}/invitations`)
      .set(admin.auth)
      .send({ email: `a${Date.now()}@example.com`, role: 'member' });
    expect(asMember.status).toBe(201);

    const asAdmin = await request(app)
      .post(`/api/teams/${team.id}/invitations`)
      .set(admin.auth)
      .send({ email: `b${Date.now()}@example.com`, role: 'admin' });
    expect(asAdmin.status).toBe(403);
  });

  test('cannot invite someone who is already in the team', async () => {
    const owner = await registerUser();
    const member = await registerUser();
    const team = await createTeam(owner);
    await addMember(team, owner, member);

    const res = await request(app)
      .post(`/api/teams/${team.id}/invitations`)
      .set(owner.auth)
      .send({ email: member.email });

    expect(res.status).toBe(409);
  });

  test('the invitation works once, and only for the invited email', async () => {
    const owner = await registerUser();
    const invited = await registerUser();
    const stranger = await registerUser();
    const team = await createTeam(owner);

    const inv = await request(app)
      .post(`/api/teams/${team.id}/invitations`)
      .set(owner.auth)
      .send({ email: invited.email });
    expect(inv.status).toBe(201);
    const token = inv.body.inviteToken;

    // Someone else cannot use the token
    const wrongUser = await request(app)
      .post('/api/invitations/accept')
      .set(stranger.auth)
      .send({ token });
    expect(wrongUser.status).toBe(400);

    // The invited person can
    const ok = await request(app)
      .post('/api/invitations/accept')
      .set(invited.auth)
      .send({ token });
    expect(ok.status).toBe(200);
    expect(ok.body.role).toBe('member');

    // ...but only once
    const again = await request(app)
      .post('/api/invitations/accept')
      .set(invited.auth)
      .send({ token });
    expect(again.status).toBe(400);
  });
});

describe('roles and removing members', () => {
  test('only the owner can change roles', async () => {
    const owner = await registerUser();
    const member = await registerUser();
    const other = await registerUser();
    const team = await createTeam(owner);
    await addMember(team, owner, member);
    await addMember(team, owner, other);

    const byMember = await request(app)
      .patch(`/api/teams/${team.id}/members/${other.user.id}`)
      .set(member.auth)
      .send({ role: 'admin' });
    expect(byMember.status).toBe(403);

    const byOwner = await request(app)
      .patch(`/api/teams/${team.id}/members/${other.user.id}`)
      .set(owner.auth)
      .send({ role: 'admin' });
    expect(byOwner.status).toBe(200);
    expect(byOwner.body.member.role).toBe('admin');
  });

  test('the owner cannot be removed or demoted', async () => {
    const owner = await registerUser();
    const team = await createTeam(owner);

    const remove = await request(app)
      .delete(`/api/teams/${team.id}/members/${owner.user.id}`)
      .set(owner.auth);
    expect(remove.status).toBe(400);

    const demote = await request(app)
      .patch(`/api/teams/${team.id}/members/${owner.user.id}`)
      .set(owner.auth)
      .send({ role: 'member' });
    expect(demote.status).toBe(404);
  });

  test('a member can leave the team and then loses access', async () => {
    const owner = await registerUser();
    const member = await registerUser();
    const team = await createTeam(owner);
    await addMember(team, owner, member);

    const leave = await request(app)
      .delete(`/api/teams/${team.id}/members/${member.user.id}`)
      .set(member.auth);
    expect(leave.status).toBe(200);

    const after = await request(app).get(`/api/teams/${team.id}`).set(member.auth);
    expect(after.status).toBe(404);
  });

  test('an admin can remove a member but not another admin', async () => {
    const owner = await registerUser();
    const admin = await registerUser();
    const otherAdmin = await registerUser();
    const member = await registerUser();
    const team = await createTeam(owner);
    await addMember(team, owner, admin, 'admin');
    await addMember(team, owner, otherAdmin, 'admin');
    await addMember(team, owner, member);

    const removeAdmin = await request(app)
      .delete(`/api/teams/${team.id}/members/${otherAdmin.user.id}`)
      .set(admin.auth);
    expect(removeAdmin.status).toBe(403);

    const removeMember = await request(app)
      .delete(`/api/teams/${team.id}/members/${member.user.id}`)
      .set(admin.auth);
    expect(removeMember.status).toBe(200);
  });
});
