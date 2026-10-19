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

function getJwtSecret() {
  const secret = process.env.JWT_SECRET ? String(process.env.JWT_SECRET).trim() : '';
  if (secret.length >= 16) {
    return secret;
  }
  if (isProduction) {
    throw new Error('SECURITY CONFIGURATION ERROR: JWT_SECRET environment variable is missing or insecure (< 16 characters) in production.');
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

// App Setting Schema (for PIN/Password)
const settingSchema = new mongoose.Schema(
  {
    key: { type: String, unique: true },
    value: String
  },
  { minimize: false }
);
const AppSetting = mongoose.models.AppSetting || mongoose.model('AppSetting', settingSchema);

async function getStoredPin() {
  const doc = await AppSetting.findOne({ key: 'auth_pin' });
  if (doc && doc.value) return String(doc.value).trim();

  const envPin = (process.env.APP_PIN || process.env.ADMIN_PASSWORD || '').trim();
  if (envPin) return envPin;

  if (isProduction) {
    // In production, never fall back to '1234'. Return null to force initial PIN setup.
    return null;
  }
  // In local development, fall back to '1234' for developer convenience
  return '1234';
}

function generateToken(pin) {
  const payload = JSON.stringify({
    pin,
    time: Date.now(),
    exp: Date.now() + (7 * 24 * 60 * 60 * 1000) // 7-day expiration
  });
  const b64 = Buffer.from(payload).toString('base64');
  const signature = crypto.createHmac('sha256', getJwtSecret()).update(b64).digest('hex');
  return `${b64}.${signature}`;
}

function verifyToken(token, expectedPin) {
  if (!token || typeof token !== 'string' || !token.includes('.') || !expectedPin) return false;
  const parts = token.split('.');
  if (parts.length !== 2) return false;
  const [b64, signature] = parts;
  try {
    const expectedSig = crypto.createHmac('sha256', getJwtSecret()).update(b64).digest('hex');
    
    // Timing-safe comparison to prevent timing attacks
    const sigBuf = Buffer.from(signature, 'hex');
    const expSigBuf = Buffer.from(expectedSig, 'hex');
    if (sigBuf.length !== expSigBuf.length || !crypto.timingSafeEqual(sigBuf, expSigBuf)) {
      return false;
    }

    const payload = Buffer.from(b64, 'base64').toString('utf8');
    const data = JSON.parse(payload);
    
    // Validate token expiry
    if (data.exp && typeof data.exp === 'number' && Date.now() > data.exp) {
      return false;
    }

    return String(data.pin).trim() === expectedPin;
  } catch (_) {
    return false;
  }
}

// Auth Protection Middleware for data routes
async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : req.headers['x-auth-token'];
  const expectedPin = await getStoredPin();

  if (!expectedPin || !verifyToken(token, expectedPin)) {
    return res.status(401).json({
      status: 'unauthorized',
      message: 'براہ کرم پہلے پن کوڈ / پاس ورڈ سے لاگ ان کریں۔'
    });
  }
  next();
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
    if (!password) {
      return res.status(400).json({ status: 'error', message: 'پن کوڈ درج کریں' });
    }

    const currentPin = await getStoredPin();
    if (currentPin === null) {
      return res.status(400).json({
        status: 'error',
        needsSetup: true,
        message: 'پہلی بار کے استعمال کے لیے نیا پن کوڈ سیٹ کریں۔'
      });
    }

    if (String(password).trim() === currentPin) {
      clearRateLimit(ip);
      const token = generateToken(currentPin);
      return res.json({ status: 'ok', token, isDefault: currentPin === '1234' });
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
    const isAuthenticated = !needsSetup && verifyToken(token, currentPin);

    res.json({
      status: 'ok',
      requiresAuth: true,
      isAuthenticated,
      needsSetup,
      isDefaultPin: currentPin === '1234'
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

    await AppSetting.findOneAndUpdate(
      { key: 'auth_pin' },
      { key: 'auth_pin', value: cleanNew },
      { upsert: true, returnDocument: 'after' }
    );

    const token = generateToken(cleanNew);
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
app.post('/api/auth/change-pin', async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const currentPin = await getStoredPin();

    if (!currentPin || String(currentPassword).trim() !== currentPin) {
      return res.status(400).json({ status: 'error', message: 'موجودہ پن کوڈ درست نہیں ہے۔' });
    }
    const cleanNew = String(newPassword || '').trim();
    if (!cleanNew || cleanNew.length < 4) {
      return res.status(400).json({ status: 'error', message: 'نیا پن کم از کم 4 ہندسوں یا حروف کا ہونا چاہیے۔' });
    }

    await AppSetting.findOneAndUpdate(
      { key: 'auth_pin' },
      { key: 'auth_pin', value: cleanNew },
      { upsert: true, returnDocument: 'after' }
    );

    const newToken = generateToken(cleanNew);
    res.json({ status: 'ok', message: 'پن کوڈ کامیابی سے تبدیل ہو گیا!', token: newToken });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// 5. Load state (Protected)
app.get('/api/state', requireAuth, async (req, res) => {
  try {
    const doc = await HisaabState.findOne({ key: 'primary' });
    if (!doc || !doc.state) {
      return res.json({ status: 'empty', message: 'No saved state found yet' });
    }
    res.json({
      status: 'ok',
      revision: doc.revision || 0,
      state: doc.state,
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
    const { state, revision, force } = req.body;
    if (!state) {
      return res.status(400).json({ status: 'error', message: 'Missing state data' });
    }

    const doc = await HisaabState.findOne({ key: 'primary' });

    // Explicit force overwrite if user confirmed override
    if (force === true) {
      const nextRevision = (doc ? (doc.revision || 0) : 0) + 1;
      const forced = await HisaabState.findOneAndUpdate(
        { key: 'primary' },
        {
          key: 'primary',
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
          key: 'primary',
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
    const currentDoc = doc || (await HisaabState.findOne({ key: 'primary' }));
    const currentRevision = currentDoc ? (currentDoc.revision || 0) : 0;
    const clientRevision = Number.isSafeInteger(revision) ? Number(revision) : (revision !== undefined && !isNaN(Number(revision)) ? Number(revision) : null);

    if (clientRevision === null || clientRevision !== currentRevision) {
      return res.status(409).json({
        status: 'conflict',
        message: 'STALE_STATE: سرور پر موجود ڈیٹا کسی اور سیشن میں تبدیل ہو چکا ہے۔',
        serverRevision: currentRevision,
        clientRevision,
        serverState: currentDoc ? currentDoc.state : null,
        updatedAt: currentDoc ? currentDoc.updatedAt : new Date()
      });
    }

    // Atomic Compare-And-Set: Only update if revision still matches clientRevision
    const updated = await HisaabState.findOneAndUpdate(
      { key: 'primary', revision: currentRevision },
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
      const latest = await HisaabState.findOne({ key: 'primary' });
      return res.status(409).json({
        status: 'conflict',
        message: 'STALE_STATE: سرور پر موجود ڈیٹا کسی اور سیشن میں تبدیل ہو چکا ہے۔',
        serverRevision: latest ? (latest.revision || 0) : 0,
        clientRevision,
        serverState: latest ? latest.state : null,
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
    const { state, tag } = req.body;
    if (!state) return res.status(400).json({ status: 'error', message: 'Missing state' });
    const backup = await HisaabBackup.create({ state, tag: tag || 'auto' });
    res.json({ status: 'ok', backupId: backup._id });
  } catch (error) {
    console.error('Failed to create backup:', error);
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// 8. List backups (Protected)
app.get('/api/backups', requireAuth, async (req, res) => {
  try {
    const backups = await HisaabBackup.find({}, 'tag createdAt _id')
      .sort({ createdAt: -1 })
      .limit(30);
    res.json({ status: 'ok', backups });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
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

// If running locally (not on Vercel), start HTTP server
if (!process.env.VERCEL) {
  console.log('Connecting to MongoDB Atlas...');
  connectDb()
    .then(async () => {
      console.log('✓ Successfully connected to MongoDB Atlas!');
      const currentPin = await getStoredPin();
      app.listen(PORT, () => {
        console.log(`\n==================================================`);
        console.log(`🚀 Hisaab Web App is running at: http://localhost:${PORT}`);
        console.log(`📦 Database: MongoDB Atlas (Connected)`);
        console.log(`🔑 Login Security: ${currentPin ? (currentPin === '1234' ? 'Dev Default PIN (1234)' : 'Custom PIN Active') : 'Setup Required (Production)'}`);
        console.log(`🛡️ JWT Protection: ${process.env.JWT_SECRET ? 'Production Secret' : 'Ephemeral Random Key'}`);
        console.log(`==================================================\n`);
      });
    })
    .catch((err) => {
      console.error('✕ MongoDB Connection Error:', err.message);
    });
}

module.exports = app;
