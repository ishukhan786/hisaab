'use strict';
require('dotenv').config();

// DNS fix for Windows SRV queries
if (process.platform === 'win32') {
  try {
    const dns = require('node:dns');
    dns.setServers(['8.8.8.8', '1.1.1.1']);
  } catch (_) {}
}

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('node:path');
const crypto = require('node:crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI;
const isProduction = process.env.NODE_ENV === 'production' || !!process.env.VERCEL;

// Ephemeral fallback secret generated uniquely per process startup (never hardcoded in source)
const DEV_FALLBACK_SECRET = crypto.randomBytes(32).toString('hex');
let cachedJwtSecret = null;

async function getJwtSecret() {
  if (cachedJwtSecret && cachedJwtSecret.length >= 16) {
    return cachedJwtSecret;
  }

  const envSecret = process.env.JWT_SECRET ? String(process.env.JWT_SECRET).trim() : '';
  if (envSecret.length >= 16) {
    cachedJwtSecret = envSecret;
    return cachedJwtSecret;
  }

  // Look up or auto-generate persistent 256-bit random secret in MongoDB
  try {
    const doc = await AppSetting.findOne({ key: 'jwt_secret' });
    if (doc && doc.value && doc.value.length >= 16) {
      cachedJwtSecret = String(doc.value).trim();
      return cachedJwtSecret;
    }

    const generated = crypto.randomBytes(32).toString('hex');
    await AppSetting.findOneAndUpdate(
      { key: 'jwt_secret' },
      { key: 'jwt_secret', value: generated },
      { upsert: true, returnDocument: 'after' }
    );
    cachedJwtSecret = generated;
    return cachedJwtSecret;
  } catch (_) {
    if (!cachedJwtSecret) {
      cachedJwtSecret = DEV_FALLBACK_SECRET;
    }
    return cachedJwtSecret;
  }
}

function getJwtSecretSync() {
  if (cachedJwtSecret && cachedJwtSecret.length >= 16) {
    return cachedJwtSecret;
  }
  const envSecret = process.env.JWT_SECRET ? String(process.env.JWT_SECRET).trim() : '';
  if (envSecret.length >= 16) {
    cachedJwtSecret = envSecret;
    return cachedJwtSecret;
  }
  return DEV_FALLBACK_SECRET;
}

// In-memory rate limiting for login attempts (Brute-force protection)
const loginAttempts = new Map();
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes lockout

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded && typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim();
  }
  return req.socket?.remoteAddress || '127.0.0.1';
}

function checkRateLimit(ip) {
  const record = loginAttempts.get(ip);
  if (!record) return { locked: false, remainingAttempts: MAX_FAILED_ATTEMPTS };
  const now = Date.now();
  if (record.lockUntil && now < record.lockUntil) {
    const remainingSeconds = Math.ceil((record.lockUntil - now) / 1000);
    const remainingMinutes = Math.ceil(remainingSeconds / 60);
    return { locked: true, remainingSeconds, remainingMinutes };
  }
  if (record.lockUntil && now >= record.lockUntil) {
    loginAttempts.delete(ip);
    return { locked: false, remainingAttempts: MAX_FAILED_ATTEMPTS };
  }
  const remaining = Math.max(0, MAX_FAILED_ATTEMPTS - record.attempts);
  return { locked: false, remainingAttempts: remaining };
}

function recordFailedLogin(ip) {
  const now = Date.now();
  const record = loginAttempts.get(ip) || { attempts: 0, firstAttempt: now, lockUntil: 0 };
  record.attempts += 1;
  if (record.attempts >= MAX_FAILED_ATTEMPTS) {
    record.lockUntil = now + LOCKOUT_WINDOW_MS;
  }
  loginAttempts.set(ip, record);
  return record;
}

function clearRateLimit(ip) {
  loginAttempts.delete(ip);
}

// Periodic cleanup of stale rate-limit records
setInterval(() => {
  const now = Date.now();
  for (const [ip, record] of loginAttempts.entries()) {
    if ((record.lockUntil && now > record.lockUntil) || (!record.lockUntil && now - record.firstAttempt > LOCKOUT_WINDOW_MS)) {
      loginAttempts.delete(ip);
    }
  }
}, 10 * 60 * 1000).unref?.();

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Block direct access to sensitive files, hidden dotfiles, and backend source files
app.use((req, res, next) => {
  try {
    const rawNormalized = path.normalize(decodeURIComponent(req.path)).replace(/^(\.\.[\/\\])+/, '');
    const safePath = rawNormalized.replace(/\\/g, '/');
    const lower = safePath.toLowerCase();

    if (
      lower.startsWith('/.') ||
      lower.includes('/.') ||
      /\.(env|json|cjs|sqlite|md|cmd|lock|yml|yaml|log)$/i.test(lower) ||
      /^\/(server|main|database|preload)\.js$/i.test(lower) ||
      /^\/(scratch|tests|scripts|node_modules|dist|\.git)(\/|$)/i.test(lower)
    ) {
      return res.status(404).send('Not Found');
    }
  } catch (_) {
    return res.status(400).send('Bad Request');
  }
  next();
});

// Serve static assets from assets/ directory only
app.use('/assets', express.static(path.join(__dirname, 'assets'), {
  dotfiles: 'deny',
  index: false,
  maxAge: '1d'
}));

// Whitelist of allowed root frontend static files
const ALLOWED_ROOT_FILES = new Set([
  'index.html',
  'guide.html',
  'receipt-image.html',
  'style.css',
  'ui.css',
  'journal.css',
  'receipt-export.css',
  'app.js',
  'ui.js',
  'journal.js',
  'excel-export.js',
  'receipt-png.js',
  'external-backup-ui.js'
]);

// Serve allowed frontend files
app.get('/:filename', (req, res, next) => {
  const filename = req.params.filename;
  if (ALLOWED_ROOT_FILES.has(filename)) {
    return res.sendFile(path.join(__dirname, filename));
  }
  next();
});

// Serve index.html on root
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// App Setting Schema (for persistent settings like PIN, JWT secret)
const settingSchema = new mongoose.Schema(
  {
    key: { type: String, unique: true },
    value: String
  },
  { minimize: false }
);
const AppSetting = mongoose.models.AppSetting || mongoose.model('AppSetting', settingSchema);

// MongoDB connection caching for Serverless (Vercel) & local dev
let cachedDb = null;
async function connectDb() {
  if (cachedDb && mongoose.connection.readyState === 1) {
    return cachedDb;
  }
  const uri = process.env.MONGODB_URI || MONGODB_URI;
  if (!uri) {
    throw new Error('MONGODB_URI environment variable is missing.');
  }
  cachedDb = await mongoose.connect(uri, {
    bufferCommands: false,
    serverSelectionTimeoutMS: 8000
  });

  // Ensure persistent JWT secret is loaded from MongoDB Atlas if not in env
  if (!cachedJwtSecret || cachedJwtSecret.length < 16) {
    await getJwtSecret().catch(() => {});
  }

  return cachedDb;
}

// Database auto-connection middleware for all /api calls
app.use(async (req, res, next) => {
  if (req.path.startsWith('/api')) {
    try {
      await connectDb();
      next();
    } catch (err) {
      console.error('MongoDB connection error:', err);
      return res.status(500).json({
        status: 'error',
        message: 'MongoDB connection failed: ' + err.message
      });
    }
  } else {
    next();
  }
});

async function getStoredPin() {
  const doc = await AppSetting.findOne({ key: 'auth_pin' });
  if (doc && doc.value) return String(doc.value).trim();

  const envPin = (process.env.APP_PIN || process.env.ADMIN_PASSWORD || '').trim();
  if (envPin) return envPin;

  // Fallback PIN (1234) for initial setup/login so existing deployments are never locked out
  return '1234';
}

// Salted password hashing using Node.js scrypt (KDF)
function hashPin(pin) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(pin).trim(), salt, 64).toString('hex');
  return `scrypt:${salt}:${hash}`;
}

function verifyPin(candidatePin, storedValue) {
  if (!candidatePin || !storedValue) return false;
  const cleanCandidate = String(candidatePin).trim();
  const cleanStored = String(storedValue).trim();

  // Modern salted hash check
  if (cleanStored.startsWith('scrypt:')) {
    const parts = cleanStored.split(':');
    if (parts.length !== 3) return false;
    const [, salt, expectedHashHex] = parts;
    const candidateHash = crypto.scryptSync(cleanCandidate, salt, 64);
    const expectedHash = Buffer.from(expectedHashHex, 'hex');
    if (candidateHash.length !== expectedHash.length) return false;
    return crypto.timingSafeEqual(candidateHash, expectedHash);
  }

  // Backward compatibility with timing-safe comparison for legacy plain-text entries
  const candidateBuf = Buffer.from(cleanCandidate);
  const storedBuf = Buffer.from(cleanStored);
  if (candidateBuf.length !== storedBuf.length) return false;
  return crypto.timingSafeEqual(candidateBuf, storedBuf);
}

// Session fingerprint derived from current stored PIN (invalidates old tokens when PIN changes)
function getPinFingerprint(storedValue) {
  if (!storedValue) return '';
  return crypto.createHmac('sha256', getJwtSecretSync()).update(String(storedValue).trim()).digest('hex').slice(0, 16);
}

function generateToken(storedValue, account = 'owner') {
  const payload = JSON.stringify({
    sub: account,
    fp: getPinFingerprint(storedValue),
    iat: Date.now(),
    exp: Date.now() + (7 * 24 * 60 * 60 * 1000) // 7-day expiration
  });
  const b64 = Buffer.from(payload).toString('base64');
  const signature = crypto.createHmac('sha256', getJwtSecretSync()).update(b64).digest('hex');
  return `${b64}.${signature}`;
}

function verifyToken(token, storedValue) {
  if (!token || typeof token !== 'string' || !token.includes('.') || !storedValue) return false;
  const parts = token.split('.');
  if (parts.length !== 2) return false;
  const [b64, signature] = parts;
  try {
    const expectedSig = crypto.createHmac('sha256', getJwtSecretSync()).update(b64).digest('hex');
    
    // Timing-safe comparison to prevent timing attacks
    const sigBuf = Buffer.from(signature, 'hex');
    const expSigBuf = Buffer.from(expectedSig, 'hex');
    if (sigBuf.length !== expSigBuf.length || !crypto.timingSafeEqual(sigBuf, expSigBuf)) {
      return false;
    }

    const payload = Buffer.from(b64, 'base64').toString('utf8');
    const data = JSON.parse(payload);
    
    // Validate token expiry (7 days)
    if (!data.exp || typeof data.exp !== 'number' || Date.now() > data.exp) {
      return false;
    }

    // Verify session fingerprint matches current stored PIN
    if (data.fp) {
      return data.fp === getPinFingerprint(storedValue);
    }

    // Backward compatibility for tokens issued with legacy 'pin' field
    if (data.pin) {
      return verifyPin(data.pin, storedValue);
    }

    return false;
  } catch (_) {
    return false;
  }
}

const publicState = state => state ? {...state,pinCode:''} : state;
const OFFICES = { mussafah: 'Mussafah Branch', satwa: 'Satwa Branch', city: 'City Branch' };
function tokenAccount(token) {
  try { const sub = JSON.parse(Buffer.from(token.split('.')[0], 'base64').toString()).sub; return sub === 'admin' ? 'owner' : sub; } catch { return null; }
}
async function accountPin(account) {
  if (account === 'owner') return getStoredPin();
  if (!Object.hasOwn(OFFICES, account)) return null;
  const doc = await AppSetting.findOne({ key: 'staff_pin_' + account });
  return doc?.value || null;
}
async function sessionFor(req) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : req.headers['x-auth-token'];
  const account = tokenAccount(token || '');
  const pin = await accountPin(account);
  return pin && verifyToken(token, pin) ? { account, role: account === 'owner' ? 'owner' : 'staff', branch: account === 'owner' ? null : account } : null;
}
async function requireAuth(req, res, next) {
  try {
    req.session = await sessionFor(req);
    if (!req.session) return res.status(401).json({ status: 'unauthorized', message: 'Please log in again.' });
    const office = req.headers['x-hisaab-branch'] || req.session.branch || 'mussafah';
    if (!Object.hasOwn(OFFICES, office) || (req.session.role === 'staff' && office !== req.session.branch)) return res.status(403).json({ status: 'error', message: 'Branch access denied' });
    req.office = office;
    // Retain the existing document for Mussafah; no copy or destructive migration.
    req.stateKey = office === 'mussafah' ? 'primary' : 'branch:' + office;
    next();
  } catch (err) { res.status(500).json({ status:'error', message:'Authentication unavailable' }); }
}

// MongoDB Schema for Hisaab state
const hisaabSchema = new mongoose.Schema(
  {
    key: { type: String, default: 'primary', unique: true },
    revision: { type: Number, default: 0 },
    state: { type: mongoose.Schema.Types.Mixed, required: true },
    updatedAt: { type: Date, default: Date.now }
  },
  { minimize: false }
);

const HisaabState = mongoose.models.HisaabState || mongoose.model('HisaabState', hisaabSchema);

// Backup Schema
const backupSchema = new mongoose.Schema(
  {
    branch: { type: String, default: 'mussafah' },
    tag: { type: String, default: 'manual' },
    state: { type: mongoose.Schema.Types.Mixed, required: true },
    createdAt: { type: Date, default: Date.now }
  },
  { minimize: false }
);

const HisaabBackup = mongoose.models.HisaabBackup || mongoose.model('HisaabBackup', backupSchema);

// ======================== API Endpoints ========================

// 1. Health check (Public)
app.get('/api/health', (req, res) => {
  const isConnected = mongoose.connection.readyState === 1;
  res.json({
    status: 'ok',
    mongodb: isConnected ? 'connected' : 'disconnected',
    platform: process.env.VERCEL ? 'vercel' : 'local',
    timestamp: new Date().toISOString()
  });
});

// 2. Auth Login (Public with rate-limiting & brute-force protection)
app.post('/api/auth/login', async (req, res) => {
  try {
    const ip = getClientIp(req);
    const rateCheck = checkRateLimit(ip);
    if (rateCheck.locked) {
      return res.status(429).json({
        status: 'error',
        message: `بہت زیادہ غلط کوششیں! اکاؤنٹ عارضی طور پر لاک ہے۔ براہ کرم ${rateCheck.remainingMinutes} منٹ بعد دوبارہ کوشش کریں۔`,
        retryAfterSeconds: rateCheck.remainingSeconds
      });
    }

    const { password } = req.body;
    const account = req.body.account || 'owner';
    if (typeof password !== 'string' || !password.trim() || password.length>128) {
      return res.status(400).json({ status: 'error', message: 'پن کوڈ درج کریں' });
    }

    const currentPin = await accountPin(account);
    if (!currentPin) {
      return res.status(400).json({
        status: 'error',
        needsSetup: false,
        message: 'اس برانچ کا اسٹاف لاگ ان فعال نہیں ہے۔ مالک سے پاس ورڈ مقرر کروائیں۔'
      });
    }

    if (verifyPin(password, currentPin)) {
      clearRateLimit(ip);

      // Transparent upgrade to hashed PIN in DB if currently plain text
      if (!currentPin.startsWith('scrypt:')) {
        const hashed = hashPin(password);
        await AppSetting.findOneAndUpdate(
          { key: account === 'owner' ? 'auth_pin' : 'staff_pin_' + account },
          { key: account === 'owner' ? 'auth_pin' : 'staff_pin_' + account, value: hashed },
          { upsert: true }
        ).catch(() => {});
      }

      const updatedPin = await accountPin(account);
      const token = generateToken(updatedPin, account);
      return res.json({
        status: 'ok',
        token,
        role: account === 'owner' ? 'owner' : 'staff',
        branch: account === 'owner' ? null : account,
        isDefault: verifyPin('1234', currentPin)
      });
    }

    const failed = recordFailedLogin(ip);
    if (failed.lockUntil) {
      return res.status(429).json({
        status: 'error',
        message: 'بہت زیادہ غلط کوششیں! اکاؤنٹ 15 منٹ کے لیے عارضی لاک کر دیا گیا ہے۔',
        retryAfterSeconds: Math.ceil(LOCKOUT_WINDOW_MS / 1000)
      });
    }

    const remaining = Math.max(0, MAX_FAILED_ATTEMPTS - failed.attempts);
    return res.status(401).json({
      status: 'error',
      message: `غلط پن کوڈ! دوبارہ کوشش کریں۔ (باقی کوششیں: ${remaining})`
    });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// 3. Auth Check / Status (Public)
app.get('/api/auth/status', async (req, res) => {
  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : req.headers['x-auth-token'];
    const currentPin = await getStoredPin();
    const needsSetup = currentPin === null;
    const session = await sessionFor(req);
    const isAuthenticated = !!session;

    res.json({
      status: 'ok',
      requiresAuth: true,
      role: session?.role || null,
      branch: session?.branch || null,
      isAuthenticated,
      needsSetup,
      isDefaultPin: !needsSetup && verifyPin('1234', currentPin)
    });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// 4. Initial Setup (Only accessible when no PIN is configured)
app.post('/api/auth/setup', async (req, res) => {
  try {
    const currentPin = await getStoredPin();
    if (currentPin !== null) {
      return res.status(400).json({
        status: 'error',
        message: 'پن پہلے سے موجود ہے۔ لاگ ان کر کے سیٹنگز سے تبدیل کریں۔'
      });
    }

    const { newPassword } = req.body;
    const cleanNew = String(newPassword || '').trim();
    if (!cleanNew || cleanNew.length < 4) {
      return res.status(400).json({
        status: 'error',
        message: 'نیا پن کم از کم 4 ہندسوں یا حروف کا ہونا چاہیے۔'
      });
    }

    const hashed = hashPin(cleanNew);
    await AppSetting.findOneAndUpdate(
      { key: 'auth_pin' },
      { key: 'auth_pin', value: hashed },
      { upsert: true, returnDocument: 'after' }
    );

    const token = generateToken(hashed);
    res.json({
      status: 'ok',
      message: 'پن کوڈ کامیابی سے سیٹ ہو گیا!',
      token
    });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// 5. Change PIN (Verified with currentPassword)
app.post('/api/auth/change-pin', requireAuth, async (req, res) => {
  try {
    if (req.session.role !== 'owner') return res.status(403).json({status:'error',message:'Owner access required'});
    const { currentPassword, newPassword } = req.body;
    const currentPin = await getStoredPin();

    if (!currentPin || !verifyPin(currentPassword, currentPin)) {
      return res.status(400).json({ status: 'error', message: 'موجودہ پن کوڈ درست نہیں ہے۔' });
    }
    const cleanNew = String(newPassword || '').trim();
    if (!cleanNew || cleanNew.length < 4) {
      return res.status(400).json({ status: 'error', message: 'نیا پن کم از کم 4 ہندسوں یا حروف کا ہونا چاہیے۔' });
    }

    const hashed = hashPin(cleanNew);
    await AppSetting.findOneAndUpdate(
      { key: 'auth_pin' },
      { key: 'auth_pin', value: hashed },
      { upsert: true, returnDocument: 'after' }
    );

    const newToken = generateToken(hashed);
    res.json({ status: 'ok', message: 'پن کوڈ کامیابی سے تبدیل ہو گیا!', token: newToken });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

app.get('/api/branches', requireAuth, async (req, res) => {
  try {
    const branches = [];
    for (const [id,name] of Object.entries(OFFICES)) {
      if(req.session.role === 'staff' && id !== req.session.branch) continue;
      branches.push({id,name,staffEnabled: !!(await AppSetting.findOne({key:'staff_pin_'+id}))?.value});
    }
    res.json({status:'ok',role:req.session.role,branches});
  } catch { res.status(500).json({status:'error',message:'Could not load branches'}); }
});
app.post('/api/branches/staff', requireAuth, async (req,res) => {
  if(req.session.role !== 'owner') return res.status(403).json({status:'error',message:'Owner access required'});
  const {branch,password,disable} = req.body;
  if(!Object.hasOwn(OFFICES,branch) || (disable !== true && (typeof password !== 'string' || password.trim().length < 6 || password.length > 128))) return res.status(400).json({status:'error',message:'Select a branch and use a password of 6 to 128 characters.'});
  try {
    await AppSetting.findOneAndUpdate({key:'staff_pin_'+branch},{key:'staff_pin_'+branch,value:disable === true ? '' : hashPin(password)},{upsert:true});
    res.json({status:'ok'});
  } catch { res.status(500).json({status:'error',message:'Could not update staff login'}); }
});

// 5. Load state (Protected)
app.get('/api/state', requireAuth, async (req, res) => {
  try {
    const doc = await HisaabState.findOne({ key: req.stateKey });
    if (!doc || !doc.state) {
      return res.json({ status: 'empty', message: 'No saved state found yet' });
    }
    res.json({
      status: 'ok',
      revision: doc.revision || 0,
      state: publicState(doc.state),
      updatedAt: doc.updatedAt
    });
  } catch (error) {
    console.error('Failed to load state from MongoDB:', error);
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// 6. Save state (Protected with Compare-And-Set / OCC)
app.post('/api/save', requireAuth, async (req, res) => {
  try {
    const { revision, force } = req.body;
    let state;
    try { state=require('./database').validateState(req.body.state); } catch { return res.status(400).json({status:'error',message:'Invalid state'}); }
    if(state.officeId && state.officeId !== req.office) return res.status(400).json({status:'error',message:'Backup belongs to another branch'});
    if(force === true && req.session.role !== 'owner') return res.status(403).json({status:'error',message:'Owner access required'});
    state.officeId = req.office;
    state.pinCode='';
    if (!state) {
      return res.status(400).json({ status: 'error', message: 'Missing state data' });
    }

    const doc = await HisaabState.findOne({ key: req.stateKey });

    // Explicit force overwrite if user confirmed override
    if (force === true) {
      const nextRevision = (doc ? (doc.revision || 0) : 0) + 1;
      const forced = await HisaabState.findOneAndUpdate(
        { key: req.stateKey },
        {
          key: req.stateKey,
          revision: nextRevision,
          state,
          updatedAt: new Date()
        },
        { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
      );
      return res.json({
        status: 'saved',
        revision: forced.revision,
        updatedAt: forced.updatedAt
      });
    }

    // Case 1: First-time state creation (no record exists yet)
    if (!doc) {
      try {
        const created = await HisaabState.create({
          key: req.stateKey,
          revision: 1,
          state,
          updatedAt: new Date()
        });
        return res.json({
          status: 'saved',
          revision: created.revision,
          updatedAt: created.updatedAt
        });
      } catch (err) {
        if (err.code !== 11000) throw err;
        // Concurrent insert occurred, re-fetch doc and evaluate conflict
      }
    }

    // Case 2: Document exists. Enforce compare-and-set revision semantics.
    const currentDoc = doc || (await HisaabState.findOne({ key: req.stateKey }));
    const currentRevision = currentDoc ? (currentDoc.revision || 0) : 0;
    const clientRevision = Number.isSafeInteger(revision) ? Number(revision) : (revision !== undefined && !isNaN(Number(revision)) ? Number(revision) : null);

    if (clientRevision === null || clientRevision !== currentRevision) {
      return res.status(409).json({
        status: 'conflict',
        message: 'STALE_STATE: سرور پر موجود ڈیٹا کسی اور سیشن میں تبدیل ہو چکا ہے۔',
        serverRevision: currentRevision,
        clientRevision,
        serverState: currentDoc ? publicState(currentDoc.state) : null,
        updatedAt: currentDoc ? currentDoc.updatedAt : new Date()
      });
    }

    // Atomic Compare-And-Set: Only update if revision still matches clientRevision
    const updated = await HisaabState.findOneAndUpdate(
      { key: req.stateKey, revision: currentRevision },
      {
        $set: {
          state,
          updatedAt: new Date()
        },
        $inc: { revision: 1 }
      },
      { returnDocument: 'after' }
    );

    if (!updated) {
      // Race condition detected: Another write succeeded between findOne and findOneAndUpdate
      const latest = await HisaabState.findOne({ key: req.stateKey });
      return res.status(409).json({
        status: 'conflict',
        message: 'STALE_STATE: سرور پر موجود ڈیٹا کسی اور سیشن میں تبدیل ہو چکا ہے۔',
        serverRevision: latest ? (latest.revision || 0) : 0,
        clientRevision,
        serverState: latest ? publicState(latest.state) : null,
        updatedAt: latest ? latest.updatedAt : new Date()
      });
    }

    res.json({
      status: 'saved',
      revision: updated.revision,
      updatedAt: updated.updatedAt
    });
  } catch (error) {
    console.error('Failed to save state to MongoDB:', error);
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// 7. Create backup in MongoDB (Protected)
app.post('/api/backup', requireAuth, async (req, res) => {
  try {
    const { tag } = req.body;
    let state;try{state=require('./database').validateState(req.body.state);}catch{return res.status(400).json({status:'error',message:'Invalid backup'});}
    if(state.officeId&&state.officeId!==req.office)return res.status(400).json({status:'error',message:'Backup belongs to another branch'});
    state.officeId=req.office;state.pinCode='';
    if (!state) return res.status(400).json({ status: 'error', message: 'Missing state' });
    const backup = await HisaabBackup.create({ branch: req.office, state, tag: tag || 'auto' });
    const keep = await HisaabBackup.find({branch:req.office}, '_id').sort({_id:-1}).limit(30);
    if(keep.length===30)await HisaabBackup.deleteMany({branch:req.office,_id:{$lt:keep.at(-1)._id}});
    res.json({ status: 'ok', backupId: backup._id });
  } catch (error) {
    console.error('Failed to create backup:', error);
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// 8. List backups (Protected)
app.get('/api/backups', requireAuth, async (req, res) => {
  try {
    const backups = await HisaabBackup.find(req.office === 'mussafah' ? { $or: [{ branch:'mussafah' }, { branch: { $exists:false } }] } : { branch:req.office }, 'tag createdAt _id')
      .sort({ createdAt: -1 })
      .limit(30);
    res.json({ status: 'ok', backups });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

app.get('/api/backup/:id', requireAuth, async(req,res)=>{
  if(!mongoose.isValidObjectId(req.params.id))return res.status(400).json({status:'error',message:'Invalid backup'});
  try{
    const branchFilter=req.office==='mussafah'?{$or:[{branch:'mussafah'},{branch:{$exists:false}}]}:{branch:req.office};
    const backup=await HisaabBackup.findOne({_id:req.params.id,...branchFilter});
    if(!backup)return res.status(404).json({status:'error',message:'Backup not found'});
    res.json({status:'ok',state:publicState(backup.state)});
  }catch{res.status(500).json({status:'error',message:'Could not read backup'});}
});

// Fallback to index.html for SPA routes (only for HTML GET requests without file extensions)
app.use((req, res) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ status: 'error', message: 'API endpoint not found' });
  }
  if (req.method === 'GET' && !path.extname(req.path) && (req.accepts('html') || req.path === '/')) {
    return res.sendFile(path.join(__dirname, 'index.html'));
  }
  res.status(404).send('Not Found');
});

// If running locally (not on Vercel and run directly), start HTTP server
if (!process.env.VERCEL && require.main === module) {
  console.log('Connecting to MongoDB Atlas...');
  connectDb()
    .then(async () => {
      console.log('✓ Successfully connected to MongoDB Atlas!');
      const currentPin = await getStoredPin();
      app.listen(PORT, () => {
        console.log(`\n==================================================`);
        console.log(`🚀 Hisaab Web App is running at: http://localhost:${PORT}`);
        console.log(`📦 Database: MongoDB Atlas (Connected)`);
        console.log(`🔑 Login Security: ${currentPin ? (verifyPin('1234', currentPin) ? 'Dev Default PIN (1234)' : 'Custom Salted Hash Active') : 'Setup Required (Production)'}`);
        console.log(`🛡️ JWT Protection: ${process.env.JWT_SECRET ? 'Production Secret' : 'Ephemeral Random Key'}`);
        console.log(`==================================================\n`);
      });
    })
    .catch((err) => {
      console.error('✕ MongoDB Connection Error:', err.message);
    });
}

module.exports = app;
