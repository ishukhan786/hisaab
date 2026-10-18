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
const JWT_SECRET = process.env.JWT_SECRET || 'hisaab-secret-key-2026';

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Serve frontend static files
app.use(express.static(__dirname));

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
  return String(process.env.APP_PIN || process.env.ADMIN_PASSWORD || '1234').trim();
}

function generateToken(pin) {
  const payload = JSON.stringify({ pin, time: Date.now() });
  const signature = crypto.createHmac('sha256', JWT_SECRET).update(payload).digest('hex');
  return Buffer.from(payload).toString('base64') + '.' + signature;
}

function verifyToken(token, expectedPin) {
  if (!token || !token.includes('.')) return false;
  const [b64, signature] = token.split('.');
  try {
    const payload = Buffer.from(b64, 'base64').toString('utf8');
    const expectedSig = crypto.createHmac('sha256', JWT_SECRET).update(payload).digest('hex');
    if (signature !== expectedSig) return false;
    const data = JSON.parse(payload);
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

  if (!verifyToken(token, expectedPin)) {
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

// 2. Auth Login (Public)
app.post('/api/auth/login', async (req, res) => {
  try {
    const { password } = req.body;
    if (!password) {
      return res.status(400).json({ status: 'error', message: 'پن کوڈ درج کریں' });
    }
    const currentPin = await getStoredPin();
    if (String(password).trim() === currentPin) {
      const token = generateToken(currentPin);
      return res.json({ status: 'ok', token, isDefault: currentPin === '1234' });
    }
    return res.status(401).json({ status: 'error', message: 'غلط پن کوڈ! دوبارہ کوشش کریں۔' });
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
    const isAuthenticated = verifyToken(token, currentPin);

    res.json({
      status: 'ok',
      requiresAuth: true,
      isAuthenticated,
      isDefaultPin: currentPin === '1234'
    });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// 4. Change PIN (Protected)
app.post('/api/auth/change-pin', requireAuth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const currentPin = await getStoredPin();

    if (String(currentPassword).trim() !== currentPin) {
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

// 6. Save state (Protected)
app.post('/api/save', requireAuth, async (req, res) => {
  try {
    const { state, revision } = req.body;
    if (!state) {
      return res.status(400).json({ status: 'error', message: 'Missing state data' });
    }

    const doc = await HisaabState.findOne({ key: 'primary' });
    const currentRevision = doc ? (doc.revision || 0) : 0;
    const nextRevision = currentRevision + 1;

    const updated = await HisaabState.findOneAndUpdate(
      { key: 'primary' },
      {
        key: 'primary',
        revision: nextRevision,
        state,
        updatedAt: new Date()
      },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
    );

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

// Fallback to index.html for SPA routes
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// If running locally (not on Vercel), start HTTP server
if (!process.env.VERCEL) {
  console.log('Connecting to MongoDB Atlas...');
  connectDb()
    .then(() => {
      console.log('✓ Successfully connected to MongoDB Atlas!');
      app.listen(PORT, () => {
        console.log(`\n==================================================`);
        console.log(`🚀 Hisaab Web App is running at: http://localhost:${PORT}`);
        console.log(`📦 Database: MongoDB Atlas (Connected)`);
        console.log(`🔑 Login Security: Enabled (Default PIN: 1234)`);
        console.log(`==================================================\n`);
      });
    })
    .catch((err) => {
      console.error('✕ MongoDB Connection Error:', err.message);
    });
}

module.exports = app;
