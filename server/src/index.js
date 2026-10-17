require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const pool = require('./db');

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());

// Health check: confirms the server and the database both work
app.get('/api/health', async (req, res) => {
  try {
    const result = await pool.query('SELECT now() AS time');
    res.json({ status: 'ok', dbTime: result.rows[0].time });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: 'error', message: 'Database connection failed' });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});