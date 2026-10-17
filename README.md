# DevSync

> A real-time task management platform for developer teams, where members can create projects, assign tasks, and see updates instantly.

**Status:** In development (Step 1: scope defined)

---

## Problem

Small dev teams and student project groups often track work in chat apps and spreadsheets. Updates get lost, nobody knows who owns what, and the board is never current. DevSync gives a team one shared board where every change shows up live for everyone.

## Roles

| Role | Can do |
|---|---|
| **Owner** | Create/delete the team, manage all members and roles, everything an Admin can do |
| **Admin** | Invite/remove members, create projects, assign tasks, everything a Member can do |
| **Member** | View projects, create tasks, update their own tasks, comment |

## User Stories

**Accounts**
- As a user, I can sign up and log in securely.
- As a user, I can stay logged in and log out.

**Teams and projects**
- As an owner, I can create a team.
- As an owner or admin, I can invite people to my team by email.
- As an admin, I can create, rename, and archive projects inside a team.

**Tasks**
- As a member, I can create a task with a title, description, priority, and due date.
- As a member, I can assign a task to a teammate.
- As a member, I can move a task between **To Do**, **In Progress**, and **Done**.
- As a member, I can filter tasks by status or assignee.

**Collaboration**
- As a member, I can comment on a task.
- As a member, I see task changes from teammates instantly, without refreshing.
- As a member, I can see who is currently online in a project.
- As a user, I get a notification when I'm assigned a task or mentioned.
- As a member, I can view an activity feed of what changed in a project.

## Scope

### MVP (must build)
- [ ] Authentication (JWT) and role-based access
- [ ] Teams, invites, and members
- [ ] Projects
- [ ] Tasks with CRUD, assignment, filters, and pagination
- [ ] Kanban board with drag and drop
- [ ] Comments
- [ ] Real-time updates (WebSockets)
- [ ] Notifications and activity feed
- [ ] Tests, CI, Docker, and deployment

### Later (only if time remains)
- [ ] File attachments
- [ ] Task labels and tags
- [ ] Global search
- [ ] Email notifications
- [ ] Dark mode
- [ ] GitHub integration (link commits and PRs to tasks)

### Out of scope
Video calls, built-in code editor, billing, mobile app.

## Screens (rough sketches)

**1. Login / Signup**
```
+---------------------------+
|          DevSync          |
|  [ Email              ]   |
|  [ Password           ]   |
|  [      Log in        ]   |
|  No account? Sign up      |
+---------------------------+
```

**2. Dashboard**
```
+------------------------------------------+
| DevSync        [Notifications]  [Profile]|
|------------------------------------------|
| Your teams                  [+ New team] |
|  > Team Alpha  (3 projects)              |
|  > Team Beta   (1 project)               |
|                                          |
| Recent activity                          |
|  - Riya moved "Login API" to Done        |
+------------------------------------------+
```

**3. Project board (Kanban)**
```
+------------------------------------------------------+
| Project: Website Redesign     Online: Riya, Aman     |
| [Filter: status v] [Filter: assignee v] [+ New task] |
|------------------------------------------------------|
|  TO DO          |  IN PROGRESS    |  DONE            |
|  [Task card]    |  [Task card]    |  [Task card]     |
|  [Task card]    |                 |  [Task card]     |
+------------------------------------------------------+
```

**4. Task detail**
```
+------------------------------------------+
| Task: Build login API          [Priority]|
| Assignee: Aman    Due: 24 Oct    Status  |
|------------------------------------------|
| Description ...                          |
|------------------------------------------|
| Comments                                 |
|  Riya: Please add rate limiting          |
|  [ Write a comment...            ] [Send]|
+------------------------------------------+
```

## Tech Stack

| Layer | Choice | Why |
|---|---|---|
| Frontend | React, Tailwind, React Query | Fast UI, simple API caching |
| Backend | Node.js, Express | Large ecosystem, good for WebSockets |
| Database | PostgreSQL (with Prisma) | Relational data fits teams, projects, tasks |
| Cache / pub-sub | Redis | Caching and scaling real-time across servers |
| Real-time | Socket.IO | Rooms per project, easy reconnects |
| Auth | JWT (access + refresh tokens), bcrypt | Standard and stateless |
| Testing | Jest, Supertest | API and integration tests |
| DevOps | Docker Compose, GitHub Actions | One-command setup, automated tests |
| Hosting | Vercel (frontend), Render/Railway (backend), Neon (DB) | Free tiers |

## Planned Data Model

`users` , `teams` , `team_members` (role) , `projects` , `tasks` , `comments` , `notifications` , `activity_logs`

## Roadmap

| Week | Goal |
|---|---|
| 1 | Schema design, project setup, auth and roles |
| 2 | Core REST API (teams, projects, tasks), Swagger docs |
| 3 | Frontend: dashboard, Kanban board, drag and drop |
| 4 | Real-time updates, notifications, Redis |
| 5 | Tests, CI, rate limiting, load testing |
| 6 | Deployment, architecture diagram, final README |

## Getting Started

_To be filled in once the project is runnable._

```bash
# Planned
git clone https://github.com/<your-username>/devsync.git
cd devsync
docker compose up
```

## Design Decisions

_Add notes here as you build: why PostgreSQL, how roles are enforced, how real-time scales with Redis, and what you would change at larger scale._

## License

MIT
