# DevSync API

The backend of [DevSync](../README.md): a REST API and a Socket.IO server built with Node.js, Express 5 and PostgreSQL.

## Features

- JWT authentication with short-lived access tokens and rotating refresh tokens
- Teams with owner, admin and member roles, and invitations by one-time token
- Projects, tasks, comments and an activity log
- Kanban ordering handled in database transactions
- Real-time events and presence with Socket.IO
- Notifications that are saved in the database and pushed live
- Request validation with Zod

## Requirements

- Node.js 20 or newer
- A PostgreSQL database (a free Neon project works)

## Setup

1. Install the dependencies:
   ```bash
   npm install
   ```
2. Create the tables by running `db/schema.sql` against your database (for example in DBeaver, or with `psql`).
3. Create a `.env` file in this folder:
   ```
   PORT=5000
   DATABASE_URL=postgresql://user:password@host/dbname?sslmode=verify-full
   JWT_SECRET=a-long-random-string
   ```
4. Start the server:
   ```bash
   npm run dev
   ```
   The API runs at http://localhost:5000. Check http://localhost:5000/api/health, which should return `{"status":"ok", ...}`.

Generate a secret with:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | yes | PostgreSQL connection string |
| `JWT_SECRET` | yes | Secret used to sign access tokens |
| `PORT` | no | Port to listen on (default `5000`; hosting platforms set it for you) |
| `CLIENT_ORIGIN` | in production | Address of the frontend that CORS and Socket.IO accept. Separate several addresses with commas. Leave it empty locally to allow any origin |

Never commit `.env`. It is already listed in `.gitignore`.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Starts the server with nodemon (restarts on every change) |
| `npm start` | Starts the server with Node (used in production) |
| `npm test` | Runs the automated tests (see below) |

## Tests

The API has 107 integration tests written with Jest and Supertest. They call the real Express app and a real PostgreSQL database,and cover authentication (including refresh token rotation and password reset), AI summaries with a stubbedprovider, project chat, private meeting links and the project Summary tab , team roles and invitations, the Kanban move logic, comments, and 
notifications.

**The tests wipe the database they run against**, so they must never point at your real data:

1. Create a separate PostgreSQL database (for example a Neon branch called `test`).
2. Create `server/.env.test`:
   ```
   DATABASE_URL=postgresql://user:password@host/dbname?sslmode=verify-full
   JWT_SECRET=any-test-secret
   ALLOW_TEST_DB_RESET=yes
   ```
3. Run:
   ```bash
   npm test
   ```

Before each run the setup script drops all tables and recreates them from `db/schema.sql`. It refuses to run unless `ALLOW_TEST_DB_RESET=yes` is set, and it refuses to run if the database is the same as the one in `server/.env`.

On every push, GitHub Actions runs the same tests against a temporary PostgreSQL container, and also builds the frontend (see `.github/workflows/ci.yml`).

## Project structure

```
server/
├── db/
│   └── schema.sql            Database tables, enums and indexes
├── scripts/
│   └── socket-test.js        Command-line listener for live events
├── tests/                    Jest + Supertest integration tests
└── src/
    ├── app.js                Express app (used by the server and by the tests)
    ├── index.js              Starts the HTTP server and Socket.IO
    ├── config.js             Reads CLIENT_ORIGIN
    ├── db.js                 PostgreSQL connection pool
    ├── realtime.js           Socket.IO setup, rooms and presence
    ├── controllers/          Request handlers
    ├── routes/               URL to controller mapping
    ├── middleware/           Auth, validation and permission checks
    ├── validators/           Zod schemas
    └── utils/                Tokens, notifications, activity log, helpers
```

## Database

Tables: `users`, `refresh_tokens`, `teams`, `team_members`, `invitations`, `projects`, `tasks`, `comments`, `notifications`, `activity_logs`.

All queries use parameters (`$1`, `$2`, ...), so values never become part of the SQL text. Foreign keys cascade where it makes sense, for example deleting a project deletes its tasks.

## Authentication

- `POST /api/auth/login` returns an access token (valid 15 minutes) and a refresh token (valid 7 days).
- Send the access token in the header `Authorization: Bearer <token>`.
- `POST /api/auth/refresh` swaps a refresh token for a new pair. The old refresh token is revoked, so each one works only once.
- Refresh tokens are stored as SHA-256 hashes. Passwords are hashed with bcrypt.

## Roles

| Role | Can do |
|---|---|
| **owner** | Everything, including changing member roles and inviting admins |
| **admin** | Create and edit projects, invite members, remove members, delete any task or comment |
| **member** | View projects, create and edit tasks, comment, delete their own tasks and comments |

People outside a team receive `404` for its data, so team and project ids cannot be probed.

## REST API

All routes except `register`, `login`, `refresh` and `health` need a valid access token.

### Auth

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/auth/register` | Create an account. Body: `name`, `email`, `password` (8 to 72 characters) |
| POST | `/api/auth/login` | Log in. Body: `email`, `password` |
| POST | `/api/auth/refresh` | New token pair. Body: `refreshToken` |
| POST | `/api/auth/logout` | Revoke a refresh token. Body: `refreshToken` |
| GET | `/api/auth/me` | The logged-in user |

### Teams and invitations

| Method | Endpoint | Who | Description |
|---|---|---|---|
| POST | `/api/teams` | any user | Create a team (you become owner) |
| GET | `/api/teams` | any user | Teams you belong to |
| GET | `/api/teams/:teamId` | member | Team details and members |
| POST | `/api/teams/:teamId/invitations` | owner, admin | Invite by email. Only the owner can invite admins. Returns the one-time `inviteToken` |
| PATCH | `/api/teams/:teamId/members/:userId` | owner | Change a role (`admin` or `member`) |
| DELETE | `/api/teams/:teamId/members/:userId` | owner, admin | Remove a member. Members can remove themselves |
| POST | `/api/invitations/accept` | invited user | Join a team. Body: `token` |

### Projects

| Method | Endpoint | Who | Description |
|---|---|---|---|
| POST | `/api/teams/:teamId/projects` | owner, admin | Create a project |
| GET | `/api/teams/:teamId/projects` | member | List projects (`?archived=true` for archived ones) |
| GET | `/api/projects/:projectId` | member | Project details |
| PATCH | `/api/projects/:projectId` | owner, admin | Rename, edit or archive |
| GET | `/api/projects/:projectId/board` | member | Tasks grouped into `todo`, `in_progress` and `done` |

### Tasks

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/projects/:projectId/tasks` | Create a task |
| GET | `/api/projects/:projectId/tasks` | List tasks. Query: `status`, `assignee` (`me` or a user id), `page`, `limit` |
| GET | `/api/tasks/:taskId` | Task details |
| PATCH | `/api/tasks/:taskId` | Edit title, description, priority, assignee or due date |
| PATCH | `/api/tasks/:taskId/move` | Move to a column and position. Body: `status`, `position` |
| DELETE | `/api/tasks/:taskId` | Delete (owner and admin: any task. Member: own tasks only) |

### Comments

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/tasks/:taskId/comments` | Add a comment. Body: `body` |
| GET | `/api/tasks/:taskId/comments` | List comments (`page`, `limit`) |
| DELETE | `/api/comments/:commentId` | Delete (the author, or an owner or admin) |

### Notifications

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/notifications` | Your notifications. Query: `unread=true`, `page`, `limit` |
| PATCH | `/api/notifications/:notificationId/read` | Mark one as read |
| POST | `/api/notifications/read-all` | Mark all as read |

### Health

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/health` | Checks the server and the database |

## Real-time events (Socket.IO)

Connect to the same address as the API and send the access token:
```js
const socket = io(API_URL, { auth: { token: accessToken } });
```
The token is checked when the connection opens. Each user also joins a private room, which is used for notifications.

**Client to server**

| Event | Payload | Description |
|---|---|---|
| `project:join` | `projectId` (with an acknowledgement callback) | Join a project room. Fails if you are not in the project's team |
| `project:leave` | `projectId` | Leave the room |

**Server to client**

| Event | Sent to | Payload |
|---|---|---|
| `task:created` | project room | `{ task, by }` |
| `task:updated` | project room | `{ task, by }` |
| `task:moved` | project room | `{ task, fromStatus, by }` |
| `task:deleted` | project room | `{ taskId, by }` |
| `comment:added` | project room | `{ comment, by }` |
| `comment:deleted` | project room | `{ commentId, taskId, by }` |
| `presence:update` | project room | `{ projectId, users }` |
| `notification:new` | one user | `{ notification }` |

Presence is kept in memory, so it resets when the server restarts. Running several servers would need the Socket.IO Redis adapter.

### Try it from the command line

```bash
node scripts/socket-test.js <email> <password> <projectId>
```
It logs in, joins the project and prints every event it receives. Run it in one terminal, then change tasks from the app or from another terminal.

## Deployment

The API runs on Render as a Web Service:

| Setting | Value |
|---|---|
| Root Directory | `server` |
| Build Command | `npm install` |
| Start Command | `npm start` |
| Health Check Path | `/api/health` |
| Environment | `DATABASE_URL`, `JWT_SECRET`, `CLIENT_ORIGIN`, `NODE_VERSION=22` |

On a free instance the service sleeps when idle, so the first request after a pause can take about a minute.
