require('dotenv').config({ quiet: true });
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const pool = require('./db');
const { clientOrigins } = require('./config');
const authRoutes = require('./routes/auth.routes');
const teamRoutes = require('./routes/team.routes');
const invitationRoutes = require('./routes/invitation.routes');
const projectRoutes = require('./routes/project.routes');
const commentRoutes = require('./routes/comment.routes');
const notificationRoutes = require('./routes/notification.routes');
const aiRoutes = require('./routes/ai.routes');
const chatRoutes = require('./routes/chat.routes');
const summaryRoutes = require('./routes/summary.routes');
const sprintRoutes = require('./routes/sprint.routes');
const attachmentRoutes = require('./routes/attachment.routes');
const app = express();

app.use(helmet());
// In production only your frontend may call the API. Locally (no CLIENT_ORIGIN) anything goes.
app.use(cors({ origin: clientOrigins.length ? clientOrigins : true }));
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
app.use('/api', aiRoutes);
app.use('/api', chatRoutes);
app.use('/api', summaryRoutes);
app.use('/api', sprintRoutes);
app.use('/api', attachmentRoutes);
// Catches any error thrown inside a route
app.use((err, req, res, next) => {
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ message: 'The file is too large' });
  }
  // Requests the sender got wrong (for example broken JSON) are not server errors
  if (err.status && err.status >= 400 && err.status < 500) {
    return res.status(err.status).json({ message: 'The request could not be read' });
  }
  console.error(err);
  res.status(500).json({ message: 'Something went wrong' });
});

module.exports = app;