const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const app = express();

// ✅ Middleware
app.use(cors({ origin: process.env.STATIC_FRONTEND_URL || 'https://art-gallery-backend-fabx.onrender.com', credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use('/images', express.static('uploads'));  // ✅ Serve uploaded images
app.use(cors({
  origin: true,  // ✅ Allows ALL origins (including Vercel)
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
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
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/artgallery');
    console.log('✅ MongoDB Connected!');
  } catch (error) {
    console.error('❌ MongoDB Error:', error.message);
    process.exit(1);
  }
};

// ===== ROUTES =====
app.get('/api/health', (req, res) => res.json({ status: 'OK' }));

app.post('/api/admin/login', (req, res) => {
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
    res.status(401).json({ success: false, message: 'Invalid credentials' });
  }
});

// Public Gallery
app.get('/api/gallery', async (req, res) => {
  try {
    const artworks = await Artwork.find({ isPublic: true }).sort({ createdAt: -1 }).limit(20);
    res.json({ artworks });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ✅ Admin Routes
app.get('/api/admin/artworks', adminAuth, async (req, res) => {
  try {
    const artworks = await Artwork.find().sort({ createdAt: -1 });
    res.json({ artworks });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ✅ FIXED: Image Upload (Disk storage)
app.post('/api/admin/artworks', adminAuth, upload.single('image'), async (req, res) => {
  console.log('📤 Upload received:');
  console.log('- Title:', req.body.title);
  console.log('- File:', req.file?.filename);
  
  try {
    if (!req.body.title) return res.status(400).json({ error: 'Title required' });
    if (!req.file) return res.status(400).json({ error: 'Image required' });

    const artwork = new Artwork({
      title: req.body.title,
      description: req.body.description || '',
      filename: req.file.filename,
      mimetype: req.file.mimetype
    });
    
    await artwork.save();
    console.log('✅ SAVED:', artwork._id);
    res.status(201).json(artwork);
  } catch (error) {
    console.error('❌ ERROR:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update
app.put('/api/admin/artworks/:id', adminAuth, async (req, res) => {
  try {
    const artwork = await Artwork.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json(artwork);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete
app.delete('/api/admin/artworks/:id', adminAuth, async (req, res) => {
  try {
    await Artwork.findByIdAndDelete(req.params.id);
    res.json({ message: 'Deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


// Start
connectDB().then(() => {
  app.listen(5000, () => {
    console.log('🚀 Backend: http://localhost:5000');
    console.log('✅ Images: http://localhost:5000/images/[filename]');
  });
});
