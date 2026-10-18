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

// API Endpoints

// 1. Health check
app.get('/api/health', (req, res) => {
  const isConnected = mongoose.connection.readyState === 1;
  res.json({
    status: 'ok',
    mongodb: isConnected ? 'connected' : 'disconnected',
    platform: process.env.VERCEL ? 'vercel' : 'local',
    timestamp: new Date().toISOString()
  });
});

// 2. Load state
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

// 3. Save state
app.post('/api/save', async (req, res) => {
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

// 4. Create backup in MongoDB
app.post('/api/backup', async (req, res) => {
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
        console.log(`==================================================\n`);
      });
    })
    .catch((err) => {
      console.error('✕ MongoDB Connection Error:', err.message);
    });
}

module.exports = app;
