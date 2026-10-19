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
    │   ├── Layout.jsx            Header and page container
    │   ├── NotificationBell.jsx  Alerts dropdown with live unread count
    │   └── TaskModal.jsx         Task editing and comments
    └── pages/
        ├── AuthPage.jsx          Login and register
        ├── Dashboard.jsx         Your teams, create a team, join with a token
        ├── TeamPage.jsx          Projects, members, roles and invitations
        └── BoardPage.jsx         Kanban board
```

## Pages

| Route | Page | Access |
|---|---|---|
| `/login` | Login | logged-out users |
| `/register` | Register | logged-out users |
| `/` | Dashboard | logged-in users |
| `/teams/:teamId` | Team page | team members |
| `/projects/:projectId` | Kanban board (`?task=<id>` opens a task) | team members |

Logged-in users who open `/login` are sent to the dashboard, and logged-out users who open any other page are sent to `/login`.

## How it works

**Authentication.** Tokens are stored in `localStorage`. `api.js` adds the access token to every request. When a request fails with `401`, it asks the server for a new token pair once, then repeats the request. If that fails, you are logged out. Several requests that fail together share a single refresh call.

**Kanban board.** Dragging a card updates the screen straight away, then sends `PATCH /api/tasks/:id/move` with the new column and position. If the server rejects the move, the board reloads from the server.

**Live updates.** `BoardPage` joins the project room and listens for task events. When teammates change something, the board reloads once (events that arrive together are combined). The board also reloads after a reconnect, so nothing is missed. The "Online" avatars come from the `presence:update` event.

**Notifications.** `NotificationBell` loads your notifications and listens for `notification:new` to update the count instantly. Clicking one opens the task it belongs to.

## Deployment

The app is deployed on Vercel:

| Setting | Value |
|---|---|
| Root Directory | `client` |
| Framework Preset | Vite |
| Environment variable | `VITE_API_URL` = your backend address |

`vercel.json` rewrites every path to `index.html`, so reloading a page such as `/projects/123` works. After the first deploy, set `CLIENT_ORIGIN` on the backend to your Vercel address, otherwise the browser blocks the requests (CORS).
