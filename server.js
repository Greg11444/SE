require('dotenv').config();
const express = require('express'), helmet = require('helmet'), cors = require('cors');
const path = require('path'), crypto = require('crypto');
const { Pool } = require('pg'), bcrypt = require('bcryptjs'), jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');

const { DATABASE_URL, ADMIN_PASSWORD, JWT_SECRET, FRONTEND_ORIGIN, PORT = 3000 } = process.env;
if (!DATABASE_URL || !ADMIN_PASSWORD || ADMIN_PASSWORD.length < 12 || !JWT_SECRET || JWT_SECRET.length < 32) {
  console.error('Missing settings: set DATABASE_URL, ADMIN_PASSWORD (12+ characters) and JWT_SECRET (32+ characters).');
  process.exit(1);
}
// The password only ever lives in an environment variable; only its hash is kept in memory.
const ADMIN_HASH = bcrypt.hashSync(ADMIN_PASSWORD, 12);
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: /localhost|127\.0\.0\.1/.test(DATABASE_URL) ? false : { rejectUnauthorized: false },
});

const STATUS_COUNT = 6; // Order received ... Delivered
const SERVICES = ['Express air', 'Ocean freight', 'Road and rail', 'Door-to-door'];
const clean = (v, n = 100) => String(v ?? '').trim().slice(0, n);
const limit = (max, mins) => rateLimit({
  windowMs: mins * 60000, max, standardHeaders: true, legacyHeaders: false,
  message: { error: 'Too many requests. Please try again later.' },
});
const wrap = f => (req, res, next) => f(req, res, next).catch(next);

const app = express();
app.set('trust proxy', 1);
app.use(helmet({
  contentSecurityPolicy: { directives: {
    defaultSrc: ["'self'"], scriptSrc: ["'self'"],
    styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
    fontSrc: ['https://fonts.gstatic.com'], imgSrc: ["'self'", 'data:'],
    connectSrc: ["'self'"], objectSrc: ["'none'"], frameAncestors: ["'none'"],
  } },
}));
app.use('/api', cors({ origin: FRONTEND_ORIGIN ? FRONTEND_ORIGIN.split(',').map(s => s.trim()) : false }));
app.use(express.json({ limit: '10kb' }));

// ---- Public: tracking and quote requests ----
app.get('/api/track/:id', limit(30, 1), wrap(async (req, res) => {
  const { rows } = await pool.query(
    'SELECT id, origin, destination, service, status, history FROM shipments WHERE id = $1',
    [clean(req.params.id, 20).toUpperCase()]);
  rows[0] ? res.json(rows[0]) : res.status(404).json({ error: 'No shipment found for that number.' });
}));

app.post('/api/quote', limit(5, 15), wrap(async (req, res) => {
  const b = req.body || {};
  const q = { name: clean(b.name), email: clean(b.email, 150), origin: clean(b.origin), destination: clean(b.destination), service: clean(b.service, 60), details: clean(b.details, 1000) };
  if (!q.name || !q.origin || !q.destination || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(q.email))
    return res.status(400).json({ error: 'Please fill in your name, a valid email, and both locations.' });
  await pool.query('INSERT INTO quotes(name,email,origin,destination,service,details) VALUES($1,$2,$3,$4,$5,$6)',
    [q.name, q.email, q.origin, q.destination, q.service, q.details]);
  res.status(201).json({ ok: true });
}));

// ---- Admin ----
app.post('/api/admin/login', limit(8, 15), (req, res) => {
  const pw = String(req.body?.password ?? '').slice(0, 200);
  if (!bcrypt.compareSync(pw, ADMIN_HASH)) return res.status(401).json({ error: 'Wrong password.' });
  res.json({ token: jwt.sign({ role: 'admin' }, JWT_SECRET, { expiresIn: '8h' }) });
});

const admin = express.Router();
admin.use(limit(150, 1), (req, res, next) => {
  try { jwt.verify((req.headers.authorization || '').replace(/^Bearer /, ''), JWT_SECRET); next(); }
  catch { res.status(401).json({ error: 'Session expired. Please sign in again.' }); }
});

admin.get('/shipments', wrap(async (req, res) => {
  const { rows } = await pool.query('SELECT id, sender, receiver, origin, destination, service, status, created_at FROM shipments ORDER BY created_at DESC LIMIT 500');
  res.json(rows);
}));

admin.post('/shipments', wrap(async (req, res) => {
  const b = req.body || {};
  const s = { sender: clean(b.sender), receiver: clean(b.receiver), origin: clean(b.origin), destination: clean(b.destination), service: clean(b.service, 40) };
  if (!s.sender || !s.receiver || !s.origin || !s.destination || !SERVICES.includes(s.service))
    return res.status(400).json({ error: 'Please complete every field.' });
  const history = JSON.stringify([{ s: 0, at: new Date().toISOString() }]);
  for (let i = 0; i < 5; i++) {
    const id = 'SFX' + crypto.randomInt(1000000, 10000000);
    const r = await pool.query(
      'INSERT INTO shipments(id,sender,receiver,origin,destination,service,history) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb) ON CONFLICT DO NOTHING RETURNING id, created_at',
      [id, s.sender, s.receiver, s.origin, s.destination, s.service, history]);
    if (r.rowCount) return res.status(201).json(r.rows[0]);
  }
  res.status(500).json({ error: 'Could not create a tracking number. Try again.' });
}));

admin.patch('/shipments/:id', wrap(async (req, res) => {
  const status = Number(req.body?.status);
  if (!Number.isInteger(status) || status < 0 || status >= STATUS_COUNT) return res.status(400).json({ error: 'Invalid status.' });
  const entry = JSON.stringify([{ s: status, at: new Date().toISOString() }]);
  const r = await pool.query('UPDATE shipments SET status=$1, history=history || $2::jsonb WHERE id=$3', [status, entry, clean(req.params.id, 20)]);
  r.rowCount ? res.json({ ok: true }) : res.status(404).json({ error: 'Shipment not found.' });
}));

admin.delete('/shipments/:id', wrap(async (req, res) => {
  await pool.query('DELETE FROM shipments WHERE id=$1', [clean(req.params.id, 20)]);
  res.json({ ok: true });
}));

admin.get('/quotes', wrap(async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM quotes ORDER BY created_at DESC LIMIT 200');
  res.json(rows);
}));
app.use('/api/admin', admin);

app.get('/health', (req, res) => res.send('ok'));
app.use(express.static(path.join(__dirname, 'public')));
app.use((err, req, res, next) => { console.error(err); res.status(500).json({ error: 'Server error. Please try again.' }); });

(async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS shipments(
      id TEXT PRIMARY KEY, sender TEXT NOT NULL, receiver TEXT NOT NULL, origin TEXT NOT NULL,
      destination TEXT NOT NULL, service TEXT NOT NULL, status INT NOT NULL DEFAULT 0,
      history JSONB NOT NULL DEFAULT '[]', created_at TIMESTAMPTZ NOT NULL DEFAULT now());
    CREATE TABLE IF NOT EXISTS quotes(
      id SERIAL PRIMARY KEY, name TEXT, email TEXT, origin TEXT, destination TEXT, service TEXT,
      details TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now());`);
  app.listen(PORT, () => console.log('Steadfast Express running on port ' + PORT));
})().catch(e => { console.error('Startup failed:', e.message); process.exit(1); });
