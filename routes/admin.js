const express = require('express');
const Artwork = require('../models/artwork');
const mongoose = require('mongoose');
const router = express.Router();

// GET /api/admin/artworks - List all (admin only)
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const artworks = await Artwork.find()
      .populate('owner', 'username')
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .sort({ createdAt: -1 });
    
    const total = await Artwork.countDocuments();
    res.json({ artworks, total, pages: Math.ceil(total / limit) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/admin/artworks - Create (mock for now)
router.post('/', async (req, res) => {
  try {
    const artwork = new Artwork({
      title: req.body.title,
      description: req.body.description,
      filename: req.body.filename || 'placeholder.jpg',
      mimetype: 'image/jpeg',
      owner: new mongoose.Types.ObjectId(), // Mock admin
      isPublic: true
    });
    await artwork.save();
    res.status(201).json(artwork);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/admin/artworks/:id - Update
router.put('/:id', async (req, res) => {
  try {
    const artwork = await Artwork.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    ).populate('owner', 'username');
    if (!artwork) return res.status(404).json({ error: 'Not found' });
    res.json(artwork);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', 'https://art-gallery-frontend-a3rc.vercel.app');
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

// DELETE /api/admin/artworks/:id
router.delete('/:id', async (req, res) => {
  try {
    const artwork = await Artwork.findByIdAndDelete(req.params.id);
    if (!artwork) return res.status(404).json({ error: 'Not found' });
    res.json({ message: 'Deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
