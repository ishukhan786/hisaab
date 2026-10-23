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

const app = express();
const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI;

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
  'khata.css',
  'receipt-export.css',
  'app.js',
  'ui.js',
  'journal.js',
  'khata.js',
  'theme-init.js',
  'pin-init.js',
  'dialog-fallback.js',
  'excel-export.js',
  'receipt-png.js',
  'external-backup-ui.js'
]);

function sendIndex(res) {
  return res.sendFile(path.join(__dirname, 'index.html'));
}

app.get('/:filename', (req, res, next) => {
  const filename = req.params.filename;
  if (filename === 'index.html') return sendIndex(res);
  if (ALLOWED_ROOT_FILES.has(filename)) {
    return res.sendFile(path.join(__dirname, filename));
  }
  next();
});

// Serve index.html on root
app.get('/', (req, res) => {
  sendIndex(res);
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

// 1. Health check (Public - responds immediately without requiring DB connection)
app.get('/api/health', (req, res) => {
  const isConnected = mongoose.connection.readyState === 1;
  res.json({
    status: 'ok',
    mongodb: isConnected ? 'connected' : 'disconnected',
    platform: process.env.VERCEL ? 'vercel' : 'local',
    timestamp: new Date().toISOString()
  });
});

// Database auto-connection middleware for state and backup endpoints only
const DB_REQUIRED_ROUTES = new Set(['/api/state', '/api/save', '/api/backup', '/api/backups']);
app.use(async (req, res, next) => {
  const needsDb = DB_REQUIRED_ROUTES.has(req.path) || req.path.startsWith('/api/backup/');
  if (needsDb) {
    // Validate request payloads BEFORE attempting database connection
    if (req.method === 'POST') {
      if (req.path === '/api/backup') {
        let state;
        try {
          state = require('./database').validateState(req.body ? req.body.state : null);
        } catch {
          return res.status(400).json({ status: 'error', message: 'Invalid backup' });
        }
        if (!state) return res.status(400).json({ status: 'error', message: 'Missing state' });
      } else if (req.path === '/api/save') {
        let state;
        try {
          state = require('./database').validateState(req.body ? req.body.state : null);
        } catch {
          return res.status(400).json({ status: 'error', message: 'Invalid state' });
        }
        if (!state) return res.status(400).json({ status: 'error', message: 'Missing state data' });
      }
    }

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
    branch: { type: String, default: 'primary' },
    tag: { type: String, default: 'manual' },
    state: { type: mongoose.Schema.Types.Mixed, required: true },
    createdAt: { type: Date, default: Date.now }
  },
  { minimize: false }
);

const HisaabBackup = mongoose.models.HisaabBackup || mongoose.model('HisaabBackup', backupSchema);

// ======================== API Endpoints ========================

// 2. Load state (Unified register)
app.get('/api/state', async (req, res) => {
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

// 3. Save state (Unified register with Compare-And-Set / OCC)
app.post('/api/save', async (req, res) => {
  try {
    const { revision, force } = req.body;
    let state;
    try {
      state = require('./database').validateState(req.body.state);
    } catch {
      return res.status(400).json({ status: 'error', message: 'Invalid state' });
    }
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

// 4. Create backup in MongoDB
app.post('/api/backup', async (req, res) => {
  try {
    const { tag } = req.body;
    let state;
    try {
      state = require('./database').validateState(req.body.state);
    } catch {
      return res.status(400).json({ status: 'error', message: 'Invalid backup' });
    }
    if (!state) return res.status(400).json({ status: 'error', message: 'Missing state' });
    const backup = await HisaabBackup.create({ branch: 'primary', state, tag: tag || 'auto' });
    const keep = await HisaabBackup.find({}, '_id').sort({ _id: -1 }).limit(30);
    if (keep.length === 30) await HisaabBackup.deleteMany({ _id: { $lt: keep.at(-1)._id } });
    res.json({ status: 'ok', backupId: backup._id });
  } catch (error) {
    console.error('Failed to create backup:', error);
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// 5. List backups
app.get('/api/backups', async (req, res) => {
  try {
    const backups = await HisaabBackup.find({}, 'tag createdAt _id')
      .sort({ createdAt: -1 })
      .limit(30);
    res.json({ status: 'ok', backups });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// 6. Get backup by id
app.get('/api/backup/:id', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ status: 'error', message: 'Invalid backup' });
  try {
    const backup = await HisaabBackup.findById(req.params.id);
    if (!backup) return res.status(404).json({ status: 'error', message: 'Backup not found' });
    res.json({ status: 'ok', state: backup.state });
  } catch {
    res.status(500).json({ status: 'error', message: 'Could not read backup' });
  }
});

// Fallback to index.html for SPA routes (only for HTML GET requests without file extensions)
app.use((req, res) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ status: 'error', message: 'API endpoint not found' });
  }
  if (req.method === 'GET' && !path.extname(req.path) && (req.accepts('html') || req.path === '/')) {
    return sendIndex(res);
  }
  res.status(404).send('Not Found');
});

// If running locally (not on Vercel and run directly), start HTTP server
if (!process.env.VERCEL && require.main === module) {
  console.log('Connecting to MongoDB Atlas...');
  connectDb()
    .then(async () => {
      console.log('✓ Successfully connected to MongoDB Atlas!');
      app.listen(PORT, () => {
        console.log(`\n==================================================`);
        console.log(`🚀 Hisaab Web App is running at: http://localhost:${PORT}`);
        console.log(`📦 Database: MongoDB Atlas (Connected)`);
        console.log(`==================================================\n`);
      });
    })
    .catch((err) => {
      console.error('✕ MongoDB Connection Error:', err.message);
    });
}

module.exports = app;
