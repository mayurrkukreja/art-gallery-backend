const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const app = express();

// Simple logger utility
const log = {
  info: (...args) => console.log('[INFO]', ...args),
  warn: (...args) => console.warn('[WARN]', ...args),
  error: (...args) => console.error('[ERROR]', ...args),
};

// Helper to mask sensitive parts of Mongo URI when logging
const maskMongoUri = (uri) => {
  try {
    if (!uri) return 'undefined';
    return uri.replace(/(mongodb\+srv:\/\/[^:]+:)([^@]+)(@)/i, '$1******$3');
  } catch {
    return 'masked';
  }
};

// Wrap async route handlers to catch errors
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// ✅ Middleware
// app.use(cors({
//   origin: [
//     'http://localhost:3000',                           // Local dev
//     'https://art-gallery-frontend-a3rc.vercel.app/',    // ✅ YOUR Vercel URL
//     'https://art-gallery-frontend-*.vercel.app'        // Vercel previews
//   ],
//   credentials: true
// }));
// app.use(cors({ origin: process.env.STATIC_FRONTEND_URL || 'https://art-gallery-backend-fabx.onrender.com', credentials: true }));

// app.use((req, res, next) => {
//   // Set CORS headers for ALL requests
//   res.setHeader('Access-Control-Allow-Origin', 'https://art-gallery-frontend-a3rc.vercel.app');
//   res.setHeader('Access-Control-Allow-Credentials', 'true');
//   res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
//   res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  
//   // Handle preflight OPTIONS
//   if (req.method === 'OPTIONS') {
//     res.status(200).end();
//     return;
//   }
//   next();
// });

app.use(cors({
  origin: "https://art-gallery-frontend-a3rc.vercel.app",
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

// Preflight will be handled by the cors middleware above
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use('/images', express.static('uploads'));  // ✅ Serve uploaded images

// Basic request log (method, path)
app.use((req, _res, next) => {
  log.info(`${req.method} ${req.originalUrl}`);
  next();
});



// ✅ Create uploads folder
if (!fs.existsSync('uploads')) {
  fs.mkdirSync('uploads');
}

// ✅ SIMPLE Multer (Disk storage - NO GridFS crash)
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});
const upload = multer({ storage });

// ✅ Artwork Model
const ArtworkSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: String,
  filename: { type: String, required: true },
  mimetype: { type: String, required: true },
  isPublic: { type: Boolean, default: true },
  views: { type: Number, default: 0 }
}, { timestamps: true });

const Artwork = mongoose.models.Artwork || mongoose.model('Artwork', ArtworkSchema);

// ✅ JWT Auth
const adminAuth = (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'No token' });
    jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

// ✅ DB Connection
const connectDB = async () => {
  try {
    const uri = process.env.MONGODB_URI;
    log.info('Connecting to MongoDB:', maskMongoUri(uri));
    await mongoose.connect(uri);
    const dbName = mongoose.connection?.db?.databaseName || mongoose.connection?.name;
    log.info(`✅ MongoDB Connected. Database: ${dbName}`);
  } catch (error) {
    log.error('❌ MongoDB Error:', error.message);
    // Keep process alive to allow health checks, but log details
  }
};

// ===== ROUTES =====
app.get('/', (req, res) => res.send('Art Gallery API running'));
app.get('/api/health', asyncHandler(async (req, res) => {
  const state = mongoose.connection.readyState; // 0=disconnected,1=connected,2=connecting,3=disconnecting
  let ping = null;
  try {
    if (state === 1) {
      ping = await mongoose.connection.db.admin().ping();
    }
  } catch (e) {
    log.warn('Mongo ping failed:', e.message);
  }
  res.json({ status: 'OK', dbState: state, ping });
}));

app.post('/api/admin/login', (req, res) => {
  log.info('Admin login attempt from', req.ip);
  const { email, password } = req.body || {};
  const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
  const JWT_SECRET = process.env.JWT_SECRET;

  if (!ADMIN_EMAIL || !ADMIN_PASSWORD || !JWT_SECRET) {
    return res.status(500).json({ success: false, message: 'Admin auth not configured in .env' });
  }

  if (email === ADMIN_EMAIL && password === ADMIN_PASSWORD) {
    const token = jwt.sign({ role: 'admin', email: ADMIN_EMAIL }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ success: true, token });
  } else {
    log.warn('Invalid admin credentials for', email);
    res.status(401).json({ success: false, message: 'Invalid credentials' });
  }
});

// Public Gallery
app.get('/api/gallery', asyncHandler(async (req, res) => {
  const artworks = await Artwork.find({ isPublic: true }).sort({ createdAt: -1 }).limit(20);
  res.json({ artworks });
}));

// ✅ Admin Routes
app.get('/api/admin/artworks', adminAuth, asyncHandler(async (req, res) => {
  const artworks = await Artwork.find().sort({ createdAt: -1 });
  res.json({ artworks });
}));

// ✅ FIXED: Image Upload (Disk storage)
app.post('/api/admin/artworks', adminAuth, upload.single('image'), asyncHandler(async (req, res) => {
  console.log('📤 Upload received:');
  console.log('- Title:', req.body.title);
  console.log('- File:', req.file?.filename);
  if (!req.body.title) return res.status(400).json({ error: 'Title required' });
  if (!req.file) return res.status(400).json({ error: 'Image required' });

  const artwork = new Artwork({
    title: req.body.title,
    description: req.body.description || '',
    filename: req.file.filename,
    mimetype: req.file.mimetype
  });

  await artwork.save();
  log.info('Artwork saved', { id: artwork._id, title: artwork.title });
  res.status(201).json(artwork);
}));

// Update
app.put('/api/admin/artworks/:id', adminAuth, asyncHandler(async (req, res) => {
  const artwork = await Artwork.findByIdAndUpdate(req.params.id, req.body, { new: true });
  res.json(artwork);
}));

// Delete
app.delete('/api/admin/artworks/:id', adminAuth, asyncHandler(async (req, res) => {
  await Artwork.findByIdAndDelete(req.params.id);
  res.json({ message: 'Deleted' });
}));

// Global error handler
app.use((err, req, res, _next) => {
  log.error('Unhandled error:', err.message);
  log.error('Stack:', err.stack);
  res.status(500).json({ error: 'Internal Server Error' });
});

// Process-level diagnostics
process.on('unhandledRejection', (reason) => {
  log.error('Unhandled Rejection:', reason);
});
process.on('uncaughtException', (err) => {
  log.error('Uncaught Exception:', err);
});


// Start
connectDB().then(() => {
  app.listen(5000, () => {
    console.log('🚀 Backend: http://localhost:5000');
    console.log('✅ Images: http://localhost:5000/images/[filename]');
  });
});
