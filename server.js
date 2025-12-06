const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { Readable } = require('stream');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const app = express();

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
app.use('/images', express.static('uploads'));  // Local dev static images (Cloudinary serves via URLs)



// ✅ Create uploads folder
if (!fs.existsSync('uploads')) {
  fs.mkdirSync('uploads');
}

// ✅ Multer memory storage for Cloudinary
const upload = multer({ storage: multer.memoryStorage() });

// ✅ Cloudinary config (CLOUDINARY_URL or individual vars)
if (process.env.CLOUDINARY_URL) {
  cloudinary.config({ secure: true });
} else if (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true,
  });
}

const bufferToStream = (buffer) => {
  const readable = new Readable();
  readable.push(buffer);
  readable.push(null);
  return readable;
};

// ✅ Artwork Model
const ArtworkSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: String,
  imageUrl: { type: String, required: true }, // ✅ Cloudinary URL stored
  cloudinaryPublicId: { type: String },
  isPublic: { type: Boolean, default: true },
  views: { type: Number, default: 0 },
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
app.get('/', (req, res) => res.send('Art Gallery API running'));
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
  console.log('- File received:', Boolean(req.file));
  
  try {
    if (!req.body.title) return res.status(400).json({ error: 'Title required' });
    if (!req.file) return res.status(400).json({ error: 'Image required' });

    // Upload to Cloudinary
    const uploadResult = await new Promise((resolve, reject) => {
      const folder = process.env.CLOUDINARY_FOLDER || 'artworks';
      const stream = cloudinary.uploader.upload_stream(
        { folder, resource_type: 'image' },
        (error, result) => (error ? reject(error) : resolve(result))
      );
      bufferToStream(req.file.buffer).pipe(stream);
    });

    const artwork = new Artwork({
      title: req.body.title,
      description: req.body.description || '',
      imageUrl: uploadResult.secure_url,
      cloudinaryPublicId: uploadResult.public_id,
    });

    await artwork.save();
    console.log('✅ SAVED:', artwork._id, '->', uploadResult.secure_url);
    res.status(201).json({ ...artwork.toObject(), imageUrl: uploadResult.secure_url });
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
