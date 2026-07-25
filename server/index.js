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
// data directory (mount a persistent volume there in production), owner-only
// since anyone holding it can forge a session cookie. When SESSION_SECRET is
// supplied there is nothing to persist, so no file is written at all.
const dataDir = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const secretFile = path.join(dataDir, 'session-secret');
function readOrCreateSecret() {
  if (!fs.existsSync(secretFile)) {
    fs.writeFileSync(secretFile, crypto.randomBytes(32).toString('hex'), { mode: 0o600 });
  } else {
    fs.chmodSync(secretFile, 0o600); // tighten secrets written by earlier versions
  }
  return fs.readFileSync(secretFile, 'utf8');
}
const sessionSecret = process.env.SESSION_SECRET || readOrCreateSecret();

// Bulk CSV imports are posted as a JSON string, and a full college curriculum
// runs to hundreds of kilobytes - well past body-parser's 100kb default.
app.use(express.json({ limit: '10mb' }));

app.use(cookieSession({
  name: 'cmt_session',
  secret: sessionSecret,
  httpOnly: true,
  sameSite: 'lax',
  secure: isProd, // HTTPS-only cookie in production
  maxAge: 12 * 60 * 60 * 1000, // 12 hours
}));

app.use('/api', routes);

// Unknown API paths must answer with JSON - the client parses every /api
// response as JSON, and Express's default HTML 404 surfaces as a confusing
// "Request failed (404)".
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

// Serve the built React app in production.
const clientDist = path.join(__dirname, '..', 'client', 'dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get(/^(?!\/api).*/, (req, res) => res.sendFile(path.join(clientDist, 'index.html')));
}

app.use((err, req, res, next) => {
  // Malformed or oversized request bodies are the caller's problem, not a
  // server fault: report them as such instead of an opaque 500.
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'That file is too large to upload (limit 10MB). Split it into smaller batches.' });
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Could not read the request body' });
  }
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`Curriculum Mapping Tool API running on http://localhost:${PORT}`);
});
