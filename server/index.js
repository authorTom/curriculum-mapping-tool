const express = require('express');
const cookieSession = require('cookie-session');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const db = require('./db');
const routes = require('./routes');

const app = express();
const PORT = process.env.PORT || 3001;
const isProd = process.env.NODE_ENV === 'production';

// Behind Railway's (or any) HTTPS-terminating proxy, trust X-Forwarded-* so
// secure cookies and req.secure work correctly.
app.set('trust proxy', 1);

// Persist a session secret so logins survive server restarts. Lives in the
// data directory (mount a persistent volume there in production).
const dataDir = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const secretFile = path.join(dataDir, 'session-secret');
if (!fs.existsSync(secretFile)) fs.writeFileSync(secretFile, crypto.randomBytes(32).toString('hex'));
const sessionSecret = process.env.SESSION_SECRET || fs.readFileSync(secretFile, 'utf8');

app.use(express.json());
app.use(cookieSession({
  name: 'cmt_session',
  secret: sessionSecret,
  httpOnly: true,
  sameSite: 'lax',
  secure: isProd, // HTTPS-only cookie in production
  maxAge: 12 * 60 * 60 * 1000, // 12 hours
}));

app.use('/api', routes);

// Serve the built React app in production.
const clientDist = path.join(__dirname, '..', 'client', 'dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get(/^(?!\/api).*/, (req, res) => res.sendFile(path.join(clientDist, 'index.html')));
}

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`Curriculum Mapping Tool API running on http://localhost:${PORT}`);
});
