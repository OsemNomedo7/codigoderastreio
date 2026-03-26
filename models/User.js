const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  username:     { type: String, required: true, unique: true },
  passwordHash: { type: String, required: true },
  role:         { type: String, enum: ['master', 'admin'], default: 'admin' },
  name:         { type: String, default: '' },
  email:        { type: String, default: '' },
  created_at:   String,
  blocked:      { type: Boolean, default: false },
  last_login:   { type: String, default: null },
}, { versionKey: false });

module.exports = mongoose.model('User', userSchema);
