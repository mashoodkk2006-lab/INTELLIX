const express = require('express');
const session = require('express-session');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const { initDb } = require('./src/config/db');
const { seedInitialData } = require('./src/database/init');
const apiRoutes = require('./src/routes/api');

const app = express();
const PORT = process.env.PORT || 3000;

// Ensure upload folders exist
const uploadDirs = ['posters', 'achievements', 'gallery', 'members', 'certificates', 'general'];
uploadDirs.forEach(dir => {
  const p = path.join(__dirname, 'uploads', dir);
  if (!fs.existsSync(p)) {
    fs.mkdirSync(p, { recursive: true });
  }
});

// Middlewares
app.use(cors({
  origin: true,
  credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session Configuration
app.use(session({
  name: 'intellix_assoc_sid',
  secret: process.env.SESSION_SECRET || 'assoc_super_secure_session_key_2026',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production' && process.env.FORCE_HTTPS === 'true',
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    sameSite: 'lax'
  }
}));

// Static files
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Clean URL routing helpers
app.get('/events/:slug', (req, res, next) => {
  if (req.params.slug.includes('.')) return next();
  res.sendFile(path.join(__dirname, 'public/event.html'));
});

app.get('/verify', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/verify.html'));
});

// API Routes
app.use('/api', apiRoutes);

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('[Unhandled Server Error]', err);
  if (res.headersSent) return next(err);
  return res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal Server Error'
  });
});

// Start Server & Initialize Database
async function startServer() {
  try {
    await initDb();
    await seedInitialData();

    app.listen(PORT, () => {
      console.log('====================================================');
      console.log(`🚀 Association Portal is running live!`);
      console.log(`🌐 Local URL: http://localhost:${PORT}`);
      console.log(`🛡️  Admin Portal: http://localhost:${PORT}/login.html`);
      console.log(`🔑 Default Coordinator: "coordinator" / "admin123"`);
      console.log('====================================================');
    });
  } catch (err) {
    console.error('Failed to bootstrap application:', err);
    process.exit(1);
  }
}

startServer();
