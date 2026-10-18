require('dotenv').config({ quiet: true });
const http = require('http');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const pool = require('./db');
const { initRealtime } = require('./realtime');
const authRoutes = require('./routes/auth.routes');
const teamRoutes = require('./routes/team.routes');
const invitationRoutes = require('./routes/invitation.routes');
const projectRoutes = require('./routes/project.routes');
const commentRoutes = require('./routes/comment.routes');
const notificationRoutes = require('./routes/notification.routes');

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());

app.get('/api/health', async (req, res) => {
  try {
    const result = await pool.query('SELECT now() AS time');
    res.json({ status: 'ok', dbTime: result.rows[0].time });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: 'error', message: 'Database connection failed' });
  }
});

app.use('/api/auth', authRoutes);
app.use('/api/teams', teamRoutes);
app.use('/api/invitations', invitationRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api', projectRoutes);
app.use('/api', commentRoutes);

// Catches any error thrown inside a route
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ message: 'Something went wrong' });
});

const server = http.createServer(app);
initRealtime(server);

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});