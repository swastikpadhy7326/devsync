# DevSync Client

The frontend of [DevSync](../README.md): a React single-page app with a Kanban board, task details, comments, notifications and live updates.

## Tech stack

- React and Vite
- Tailwind CSS
- React Router
- dnd-kit for drag and drop
- Socket.IO client for real-time updates

## Requirements

- Node.js 20 or newer
- The [backend](../server/README.md) running on http://localhost:5000

## Setup

1. Install the dependencies:
   ```bash
   npm install
   ```
2. Start the dev server:
   ```bash
   npm run dev
   ```
3. Open http://localhost:5173.

No `.env` file is needed locally. The Vite dev server forwards `/api` and `/socket.io` to `http://localhost:5000` (see `vite.config.js`), so the browser only talks to one address.

## Environment variables

| Variable | When | Description |
|---|---|---|
| `VITE_API_URL` | production builds | Address of the backend, with no trailing slash, for example `https://devsync-api-jt06.onrender.com`. Leave it empty locally |

Vite reads this value at **build time**, so after changing it on your host you must redeploy.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Starts the dev server with hot reload |
| `npm run build` | Creates the production build in `dist/` |
| `npm run preview` | Serves the production build locally |

## Project structure

```
client/
├── index.html
├── vite.config.js            Dev server proxy and plugins
├── vercel.json               Sends every route to index.html (single-page app)
└── src/
    ├── main.jsx              Entry point
    ├── App.jsx               Routes and route guards
    ├── api.js                fetch wrapper with automatic token refresh
    ├── socket.js             Shared Socket.IO connection
    ├── AuthContext.jsx       Logged-in user, login, register, logout
    ├── index.css             Tailwind import
    ├── components/
        │   ├── CalendarView.jsx      Month calendar of tasks by due date
    │   ├── ChatPanel.jsx         Project chat with live messages and unread count
    │   ├── Layout.jsx            Header and page container
    │   ├── ListView.jsx          Sortable and filterable table of tasks
    │   ├── NotificationBell.jsx  Alerts dropdown with live unread count
    │   ├── SummaryPanel.jsx      Project dashboard: counts, charts, workload, activity
    │   └── TaskModal.jsx         Task editing, comments and the optional AI summary
    └── pages/
        ├── AuthPage.jsx          Login and register
        ├── Dashboard.jsx         Your teams, create a team, join with a token
        ├── TeamPage.jsx          Projects, members, roles and invitations
        └        ├── BoardPage.jsx         Kanban board
        ├── InvitePage.jsx        Accepts an emailed invitation
        ├── ForgotPasswordPage.jsx  Asks for a password reset email
        └── ResetPasswordPage.jsx   Sets a new password from the emailed link
```

## Pages

| Route | Page | Access |
|---|---|---|
| `/login` | Login | logged-out users |
| `/register` | Register | logged-out users |
| `/` | Dashboard | logged-in users |
| `/teams/:teamId` | Team page | team members |
| `/projects/:projectId` | Board, List, Calendar and Summary tabs plus the chat panel (`?task=<id>` opens a task) | team members |
| `/forgot-password` | Forgot password | logged-out users |
| `/reset-password/:token` | Set a new password | anyone with the emailed link |
| `/invite/:token` | Accept an invitation (log in or register first) | anyone with the emailed link |

Logged-in users who open `/login`, `/register` or `/forgot-password` are sent to the dashboard, and logged-out users who open a team or board page are sent to `/login`. The invitation and reset pages are open to everyone, because people reach them from emails. The invitation page remembers its token while the person logs in or registers, then finishes joining the team.

## How it works

**Authentication.** Tokens are stored in `localStorage`. `api.js` adds the access token to every request. When a request fails with `401`, it asks the server for a new token pair once, then repeats the request. If that fails, you are logged out. Several requests that fail together share a single refresh call.

**Kanban board.** Dragging a card updates the screen straight away, then sends `PATCH /api/tasks/:id/move` with the new column and position. If the server rejects the move, the board reloads from the server.

**Live updates.** `BoardPage` joins the project room and listens for task events. When teammates change something, the board reloads once (events that arrive together are combined). The board also reloads after a reconnect, so nothing is missed. The "Online" avatars come from the `presence:update` event.

**Notifications.** `NotificationBell` loads your notifications and listens for `notification:new` to update the count instantly. Clicking one opens the task it belongs to.

**Project views.** `BoardPage` shows the same tasks as a Board, List, Calendar or Summary tab. `ListView` and `CalendarView` use the task list the board already loaded, so switching tabs makes no extra request, while `SummaryPanel` asks `GET /api/projects/:id/summary`. `ChatPanel` loads history over REST, listens for `chat:message`, and keeps its unread count from a stored "last seen" time. The charts are drawn with SVG and CSS, with no chart library.

## Deployment

The app is deployed on Vercel:

| Setting | Value |
|---|---|
| Root Directory | `client` |
| Framework Preset | Vite |
| Environment variable | `VITE_API_URL` = your backend address |

`vercel.json` rewrites every path to `index.html`, so reloading a page such as `/projects/123` works. After the first deploy, set `CLIENT_ORIGIN` on the backend to your Vercel address, otherwise the browser blocks the requests (CORS).
