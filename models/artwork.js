const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const artworkSchema = new Schema({
  title: { type: String, required: true },
  description: String,
  filename: String,
  mimetype: String,
  owner: { type: Schema.Types.ObjectId, ref: 'User' },
  isPublic: { type: Boolean, default: true },
  views: { type: Number, default: 0 }
}, { timestamps: true });

module.exports = mongoose.model('Artwork', artworkSchema);
