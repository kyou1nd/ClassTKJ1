import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import pg from 'pg';

const { Pool } = pg;
const app = express();
const PORT = Number(process.env.PORT || 3000);
const JWT_SECRET = process.env.JWT_SECRET || 'CHANGE_ME_IN_PRODUCTION';
const FRONTEND_ORIGINS = (process.env.FRONTEND_ORIGINS || '*').split(',').map(s => s.trim()).filter(Boolean);
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false }, connectionTimeoutMillis: 10000 });

app.use(cors({ origin: FRONTEND_ORIGINS.includes('*') ? true : FRONTEND_ORIGINS }));
app.use(express.json({ limit: '12mb' }));

const students = [
['ACH. YUDI CAHYONO','0091774774','Yudi','L'],['ALFI ROISATUL FALIA','0097925888','Alfi','P'],['Alvino Adityas Pratama Putra','0091525445','Alvino','L'],['ALYA NUR FADILAH','0095732347','Alya','P'],['ARINGGA RHEZA PRATAMA','0101780156','Aringga','L'],['AURELIA SIVA AYASHA','0093550534','Aurelia','P'],['AZKYA VIORENTINA FARADITA','0095686817','Azkya','P'],['Cika Ul Umaha','0095557364','Cika','P'],['DESVITA AYU SANIA','0094960010','Desvita','P'],['DINA OKTAVIANA','0094835451','Dina','P'],['ELIS NURDIYANA PUTRI','0106224279','Elis','P'],['ENISA VITA AGUSTIN','0105791283','Enisa','P'],['FERISKA AULIA MAYDA','0093826240','Feriska','P'],['FITA DWI ANGGRAINI','0161051203','Fita','P'],['INES AFINA RAHMA','0108976321','Ines','P'],['IRFAN WAHYU PRASETIO','0099472761','Irfan','L'],['KHARIZMA AIYA ANATASYA','0101262104','Kharizma','P'],['KIRANIA PUTRI SHAHANAZ','3106697354','Kirania','P'],['Lucky Akbar Al Fitroh','0091978972','Lucky','L'],['MARSYA AUFA NUR SALSABILA','0104760053','Marsya','P'],['MIFTAKHUL HUDA','0105926410','Miftakhul','L'],['MOH DZUL FIQRI ALBAQI BILLAH','0098892051','Dzul','L'],['MOHAMAD INDRA SUWARDANA PUTRA','0097925673','Mohamad','L'],['MUHAMAD FARHAN DAFFA','0102581747','Farhan','L'],['MUHAMMAD EZAR MAULANA MALIK','3097578041','Ezar','L'],['MUHAMMAD IMAM VAHRURROZI','3097880104','Imam','L'],['NAILLA NASWA DZAHABIYYAH','0098726453','Nailla','P'],['NENENG ANJARWATI','3099388755','Neneng','P'],['NOVAL DWI ALVINO','3094264029','Noval','L'],["NURISSA'DIYAH IKA FADLIANA",'0095716700','Nurissa','P'],['PUTRI RIDIA ARTIKA SARI','0104859909','Putri','P'],['REYHANA ZEMA ZAHIRA','0095175779','Reyhana','P'],['RISMA FITRI AMELIA','3092616273','Risma','P'],['SAVIRA AULIA DIAS AVRIA','3097497620','Savira','P'],['SHELA FEBRIYANTI','0085567595','Shela','P'],['VEGA AULIA RENATA','0097658461','Vega','P']
];

const publicKeys = new Set(['xi-site-config','xi-schedules','xi-piket','xi-pro-tasks','xi-local-materials','xi-files','xi-task-submissions','xi-tkj1-notes-v2','xi-tkj1-social-notes-v1','xi-tkj1-social-replies-v1']);
const adminKeys = new Set(['xi-site-config','xi-schedules','xi-piket','xi-pro-tasks','xi-local-materials','xi-files']);
const studentKeys = new Set(['xi-task-submissions','xi-tkj1-notes-v2','xi-tkj1-social-notes-v1','xi-tkj1-social-replies-v1']);

function auth(req, res, next) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ error: 'Belum login.' });
  try { req.user = jwt.verify(token, JWT_SECRET); next(); }
  catch { return res.status(401).json({ error: 'Sesi tidak valid atau sudah berakhir.' }); }
}
function adminOnly(req, res, next) { if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Khusus admin.' }); next(); }
function tokenFor(user) { return jwt.sign({ id: user.id, role: user.role, nisn: user.nisn || null, username: user.username || null, name: user.name }, JWT_SECRET, { expiresIn: '7d' }); }
function publicUser(row) { return { id: row.id, role: row.role, nisn: row.nisn, username: row.username, name: row.name, first: row.first, gender: row.gender }; }

async function initDb() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL belum diatur.');
  await pool.query(`CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY, role TEXT NOT NULL CHECK (role IN ('student','admin')), nisn TEXT UNIQUE, username TEXT UNIQUE,
    name TEXT NOT NULL, first_name TEXT, gender TEXT, password_hash TEXT NOT NULL, profile JSONB NOT NULL DEFAULT '{}'::jsonb,
    photo_data TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE TABLE IF NOT EXISTS attendance_submissions (
    id BIGSERIAL PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    attendance_date DATE NOT NULL, submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    photo_data TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'H',
    UNIQUE(user_id, attendance_date)
  );
  CREATE INDEX IF NOT EXISTS attendance_date_idx ON attendance_submissions(attendance_date);
  CREATE TABLE IF NOT EXISTS app_data (
    key TEXT PRIMARY KEY, value JSONB NOT NULL, updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );`);
  const count = await pool.query(`SELECT COUNT(*)::int AS n FROM users WHERE role='student'`);
  if (count.rows[0].n === 0) {
    for (const [name, nisn, first, gender] of students) {
      const hash = await bcrypt.hash(first + '123', 12);
      await pool.query(`INSERT INTO users(role,nisn,username,name,first_name,gender,password_hash) VALUES('student',$1,$2,$3,$4,$5,$6) ON CONFLICT (nisn) DO NOTHING`, [nisn, first, name, first, gender, hash]);
    }
  }
  const adminUser = process.env.ADMIN_USERNAME || 'admin';
  const adminPass = process.env.ADMIN_PASSWORD || 'Admin2705';
  const adminHash = await bcrypt.hash(adminPass, 12);
  await pool.query(`INSERT INTO users(role,username,name,password_hash) VALUES('admin',$1,'Admin XI TKJ 1',$2) ON CONFLICT (username) DO UPDATE SET name=EXCLUDED.name, password_hash=EXCLUDED.password_hash, updated_at=NOW()`, [adminUser, adminHash]);
}

app.get('/api/health', async (_req,res) => {
  try { await pool.query('SELECT 1'); res.json({ ok:true, database:'connected', service:'WebClass API' }); }
  catch (e) { res.status(500).json({ ok:false, error:'database_unavailable' }); }
});

app.post('/api/auth/student', async (req,res) => {
  const { nisn, password } = req.body || {};
  if (!nisn || !password) return res.status(400).json({ error:'NISN dan password wajib diisi.' });
  const q = await pool.query(`SELECT * FROM users WHERE role='student' AND nisn=$1`, [String(nisn).trim()]);
  const user = q.rows[0];
  if (!user || !(await bcrypt.compare(password, user.password_hash))) return res.status(401).json({ error:'NISN atau password salah.' });
  res.json({ token: tokenFor(user), user: publicUser(user) });
});
app.post('/api/auth/admin', async (req,res) => {
  const { username, password } = req.body || {};
  const q = await pool.query(`SELECT * FROM users WHERE role='admin' AND username=$1`, [String(username || '').trim()]);
  const user = q.rows[0];
  if (!user || !(await bcrypt.compare(password || '', user.password_hash))) return res.status(401).json({ error:'Username atau password admin salah.' });
  res.json({ token: tokenFor(user), user: publicUser(user) });
});
app.get('/api/me', auth, async (req,res) => {
  const q = await pool.query(`SELECT id,role,nisn,username,name,first_name AS first,gender,profile,photo_data FROM users WHERE id=$1`, [req.user.id]);
  if (!q.rows[0]) return res.status(404).json({error:'Akun tidak ditemukan.'});
  res.json({ user:q.rows[0] });
});
app.get('/api/students', auth, async (_req,res) => {
  const q = await pool.query(`SELECT id,nisn,username,name,first_name AS first,gender,profile,photo_data FROM users WHERE role='student' ORDER BY id`);
  const profiles={}, photos={};
  for (const u of q.rows) { profiles[u.nisn] = u.profile || {}; if (u.photo_data) photos[u.nisn]=u.photo_data; }
  res.json({ students:q.rows.map(publicUser), profiles, photos });
});
app.put('/api/profile', auth, async (req,res) => {
  if (req.user.role !== 'student') return res.status(403).json({error:'Khusus siswa.'});
  const data = req.body?.profile || {};
  const allowed = ['displayName','username','bio','interests','skills','achievement','goal','favoriteSubject','motto','status'];
  const profile = Object.fromEntries(allowed.map(k => [k, String(data[k] ?? '')]));
  const displayName = profile.displayName || req.user.name;
  const username = profile.username || req.user.username;
  const q = await pool.query(`UPDATE users SET name=$1, username=$2, profile=$3::jsonb, updated_at=NOW() WHERE id=$4 RETURNING id,role,nisn,username,name,first_name AS first,gender,profile,photo_data`, [displayName, username, JSON.stringify(profile), req.user.id]);
  res.json({ user:q.rows[0], token:tokenFor(q.rows[0]) });
});
app.put('/api/profile/photo', auth, async (req,res) => {
  if (req.user.role !== 'student') return res.status(403).json({error:'Khusus siswa.'});
  const photo = String(req.body?.photo || '');
  if (photo.length > 8_000_000) return res.status(413).json({error:'Foto terlalu besar.'});
  const q = await pool.query(`UPDATE users SET photo_data=$1,updated_at=NOW() WHERE id=$2 RETURNING nisn`, [photo || null, req.user.id]);
  res.json({ ok:true, nisn:q.rows[0].nisn, photo:photo || null });
});
app.delete('/api/profile/photo', auth, async (req,res) => {
  if (req.user.role !== 'student') return res.status(403).json({error:'Khusus siswa.'});
  await pool.query(`UPDATE users SET photo_data=NULL,updated_at=NOW() WHERE id=$1`, [req.user.id]); res.json({ok:true});
});
app.put('/api/admin/students/:nisn', auth, adminOnly, async (req,res) => {
  const nisn = req.params.nisn; const { displayName, username, password, profile, photo } = req.body || {};
  const current = await pool.query(`SELECT * FROM users WHERE role='student' AND nisn=$1`, [nisn]);
  if (!current.rows[0]) return res.status(404).json({error:'Siswa tidak ditemukan.'});
  const u=current.rows[0]; const nextProfile={...(u.profile||{}), ...(profile||{})};
  let hash=u.password_hash; if(password) hash=await bcrypt.hash(String(password),12);
  const q=await pool.query(`UPDATE users SET name=$1,username=$2,password_hash=$3,profile=$4::jsonb,photo_data=COALESCE($5,photo_data),updated_at=NOW() WHERE nisn=$6 RETURNING id,role,nisn,username,name,first_name AS first,gender,profile,photo_data`, [displayName||u.name,username||u.username,hash,JSON.stringify(nextProfile),photo===undefined?null:photo,nisn]);
  res.json({user:q.rows[0]});
});

function jakartaDateKey() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year:'numeric', month:'2-digit', day:'2-digit' }).format(new Date());
}
function isWeekday(dateKey) {
  const d = new Date(dateKey + 'T12:00:00+07:00');
  const day = d.getDay();
  return day >= 1 && day <= 5;
}

app.post('/api/attendance/photo', auth, async (req,res) => {
  if (req.user.role !== 'student') return res.status(403).json({error:'Khusus siswa.'});
  const dateKey = jakartaDateKey();
  if (!isWeekday(dateKey)) return res.status(400).json({error:'Absensi hanya dibuka Senin sampai Jumat.'});
  const photo = String(req.body?.photo || '');
  if (!/^data:image\/(jpeg|jpg|png|webp);base64,/i.test(photo)) return res.status(400).json({error:'Foto tidak valid.'});
  if (photo.length > 2_500_000) return res.status(413).json({error:'Foto terlalu besar. Maksimal sekitar 2 MB.'});
  const exists = await pool.query('SELECT id, submitted_at FROM attendance_submissions WHERE user_id=$1 AND attendance_date=$2', [req.user.id, dateKey]);
  if (exists.rows[0]) return res.status(409).json({error:'Kamu sudah melakukan absensi hari ini.', submittedAt:exists.rows[0].submitted_at});
  const q = await pool.query(`INSERT INTO attendance_submissions(user_id,attendance_date,photo_data,status) VALUES($1,$2,$3,'H') RETURNING id,attendance_date,submitted_at,status`, [req.user.id,dateKey,photo]);
  res.status(201).json({ok:true, attendance:q.rows[0]});
});

app.get('/api/attendance/today', auth, async (req,res) => {
  const dateKey = String(req.query.date || jakartaDateKey());
  if (req.user.role === 'student') {
    const q=await pool.query(`SELECT id,attendance_date,submitted_at,status FROM attendance_submissions WHERE user_id=$1 AND attendance_date=$2`,[req.user.id,dateKey]);
    return res.json({date:dateKey, submitted:!!q.rows[0], attendance:q.rows[0]||null});
  }
  const q=await pool.query(`SELECT a.id,a.attendance_date,a.submitted_at,a.status,a.photo_data,u.name,u.nisn,u.username FROM attendance_submissions a JOIN users u ON u.id=a.user_id WHERE a.attendance_date=$1 ORDER BY a.submitted_at`,[dateKey]);
  res.json({date:dateKey, submissions:q.rows});
});

app.delete('/api/attendance/:id', auth, adminOnly, async (req,res) => {
  await pool.query('DELETE FROM attendance_submissions WHERE id=$1',[req.params.id]);
  res.json({ok:true});
});

app.get('/api/data', auth, async (_req,res) => {
  const q = await pool.query(`SELECT key,value FROM app_data WHERE key = ANY($1::text[])`, [Array.from(publicKeys)]);
  const data=Object.fromEntries(q.rows.map(r=>[r.key,r.value]));
  res.json({data});
});
app.put('/api/data/:key', auth, async (req,res) => {
  const key=req.params.key;
  if(!publicKeys.has(key)) return res.status(404).json({error:'Data key tidak dikenal.'});
  if(adminKeys.has(key) && req.user.role!=='admin') return res.status(403).json({error:'Data ini hanya bisa diubah admin.'});
  if(!adminKeys.has(key) && !studentKeys.has(key) && req.user.role!=='admin') return res.status(403).json({error:'Tidak diizinkan.'});
  await pool.query(`INSERT INTO app_data(key,value,updated_by,updated_at) VALUES($1,$2::jsonb,$3,NOW()) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_by=EXCLUDED.updated_by,updated_at=NOW()`, [key,JSON.stringify(req.body?.value),req.user.id]);
  res.json({ok:true});
});
app.delete('/api/data/:key', auth, async (req,res) => {
  const key=req.params.key; if(!publicKeys.has(key)) return res.status(404).json({error:'Data key tidak dikenal.'});
  if(req.user.role!=='admin' && !studentKeys.has(key)) return res.status(403).json({error:'Tidak diizinkan.'});
  await pool.query(`DELETE FROM app_data WHERE key=$1`,[key]); res.json({ok:true});
});

app.use(express.static(new URL('../', import.meta.url).pathname));

async function start() {
  // Open the HTTP port first so Abasthan can detect the service even when
  // PostgreSQL is unavailable. The website itself uses local login by default.
  app.listen(PORT, '0.0.0.0', () => console.log(`WebClass API running on :${PORT}`));

  try {
    await initDb();
    console.log('Database initialized successfully.');
  } catch (err) {
    // Do not kill the web service when the optional database is unavailable.
    console.error('Database initialization failed; continuing web service:', err);
  }
}
start();
