const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const Shipment = require('../models/Shipment');
const User = require('../models/User');
const { authMiddleware, JWT_SECRET } = require('../middleware/auth');

// ── Seed master user na primeira execução ────────────────────────────────────
async function seedMaster() {
  const exists = await User.findOne({ username: 'master' });
  if (!exists) {
    const passwordHash = await bcrypt.hash('master123', 10);
    await User.create({
      username:     'master',
      passwordHash,
      role:         'master',
      name:         'Master Admin',
      email:        '',
      created_at:   new Date().toISOString(),
      blocked:      false,
      last_login:   null,
    });
    console.log('✅  Usuário master criado — senha: master123');
  }
}
seedMaster().catch(console.error);

// ── Middleware master-only ───────────────────────────────────────────────────
function masterOnly(req, res, next) {
  if (req.user.role !== 'master') {
    return res.status(403).json({ error: 'Acesso restrito ao master' });
  }
  next();
}

// ── POST /api/admin/login ────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Usuário e senha são obrigatórios' });
  }

  try {
    const user = await User.findOne({ username: username.toLowerCase() });
    if (!user) return res.status(401).json({ error: 'Credenciais inválidas' });
    if (user.blocked) return res.status(403).json({ error: 'Acesso bloqueado. Entre em contato com o master.' });

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) return res.status(401).json({ error: 'Credenciais inválidas' });

    await User.updateOne({ username: user.username }, { last_login: new Date().toISOString() });

    const token = jwt.sign({ username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '8h' });
    res.json({ token, username: user.username, role: user.role, name: user.name });
  } catch (err) {
    console.error('Erro no login:', err);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// ── GET /api/admin/shipments ─────────────────────────────────────────────────
router.get('/shipments', authMiddleware, async (req, res) => {
  try {
    const list = await Shipment.find().sort({ last_update: -1 }).lean();
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// ── GET /api/admin/stats ─────────────────────────────────────────────────────
router.get('/stats', authMiddleware, async (req, res) => {
  try {
    const list = await Shipment.find().lean();
    res.json({
      total:            list.length,
      delivered:        list.filter(s => s.status_code === 'delivered').length,
      in_transit:       list.filter(s => ['in_transit', 'transfer', 'sorting', 'received'].includes(s.status_code)).length,
      out_for_delivery: list.filter(s => s.status_code === 'out_for_delivery').length,
      failed:           list.filter(s => ['failed_delivery', 'waiting_pickup'].includes(s.status_code)).length,
    });
  } catch (err) {
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// ── POST /api/admin/create ───────────────────────────────────────────────────
router.post('/create', authMiddleware, async (req, res) => {
  const {
    code: customCode, recipient, sender, origin, destination,
    status, status_code, location, estimated_delivery,
    weight, dimensions, service_type,
  } = req.body;

  if (!recipient || !origin || !destination) {
    return res.status(400).json({ error: 'Destinatário, origem e destino são obrigatórios' });
  }

  const code = customCode
    ? customCode.toUpperCase().trim()
    : `VL${Math.floor(Math.random() * 900000000 + 100000000)}BR`;

  try {
    const exists = await Shipment.findOne({ code });
    if (exists) return res.status(409).json({ error: 'Código já existe' });

    const now = new Date().toISOString();
    const newShipment = await Shipment.create({
      code,
      recipient:          recipient || 'Não informado',
      sender:             sender || 'Não informado',
      origin, destination,
      status:             status || 'Objeto recebido',
      status_code:        status_code || 'received',
      location:           location || origin,
      estimated_delivery: estimated_delivery || '',
      last_update:        now,
      weight:             weight || '',
      dimensions:         dimensions || '',
      service_type:       service_type || 'Padrão',
      history: [{
        id: uuidv4(), date: now, location: origin,
        description: 'Objeto recebido na unidade de tratamento',
        status_code: 'received',
      }],
    });

    res.status(201).json(newShipment.toObject());
  } catch (err) {
    console.error('Erro ao criar rastreio:', err);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// ── PUT /api/admin/update/:code ──────────────────────────────────────────────
router.put('/update/:code', authMiddleware, async (req, res) => {
  const code = req.params.code.toUpperCase().trim();
  const { status, status_code, location, estimated_delivery, event_description, event_location } = req.body;

  try {
    const shipment = await Shipment.findOne({ code });
    if (!shipment) return res.status(404).json({ error: 'Rastreio não encontrado' });

    const now = new Date().toISOString();
    if (status)             shipment.status             = status;
    if (status_code)        shipment.status_code        = status_code;
    if (location)           shipment.location           = location;
    if (estimated_delivery) shipment.estimated_delivery = estimated_delivery;
    shipment.last_update = now;

    if (event_description) {
      shipment.history.push({
        id:          uuidv4(),
        date:        now,
        location:    event_location || location || shipment.location,
        description: event_description,
        status_code: status_code || shipment.status_code,
      });
    }

    await shipment.save();
    res.json(shipment.toObject());
  } catch (err) {
    console.error('Erro ao atualizar rastreio:', err);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// ── DELETE /api/admin/delete/:code ───────────────────────────────────────────
router.delete('/delete/:code', authMiddleware, async (req, res) => {
  const code = req.params.code.toUpperCase().trim();
  try {
    const result = await Shipment.deleteOne({ code });
    if (result.deletedCount === 0) return res.status(404).json({ error: 'Rastreio não encontrado' });
    res.json({ message: 'Rastreio removido com sucesso' });
  } catch (err) {
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// ════════════════════════════════════════════════════════════════════════════
//  GESTÃO DE USUÁRIOS (somente master)
// ════════════════════════════════════════════════════════════════════════════

// ── GET /api/admin/users ─────────────────────────────────────────────────────
router.get('/users', authMiddleware, masterOnly, async (req, res) => {
  try {
    const users = await User.find().lean();
    const list = users.map(u => ({
      username:   u.username,
      name:       u.name,
      email:      u.email,
      role:       u.role,
      blocked:    u.blocked,
      created_at: u.created_at,
      last_login: u.last_login,
    }));
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// ── POST /api/admin/users/create ─────────────────────────────────────────────
router.post('/users/create', authMiddleware, masterOnly, async (req, res) => {
  const { username, password, name, email } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Usuário e senha são obrigatórios' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Senha deve ter pelo menos 6 caracteres' });
  }

  const key = username.toLowerCase().trim();
  try {
    const exists = await User.findOne({ username: key });
    if (exists) return res.status(409).json({ error: 'Usuário já existe' });

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({
      username:   key,
      passwordHash,
      role:       'admin',
      name:       name || key,
      email:      email || '',
      created_at: new Date().toISOString(),
      blocked:    false,
      last_login: null,
    });

    res.status(201).json({
      username:   user.username,
      name:       user.name,
      email:      user.email,
      role:       user.role,
      blocked:    user.blocked,
      created_at: user.created_at,
      last_login: user.last_login,
    });
  } catch (err) {
    console.error('Erro ao criar usuário:', err);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// ── PUT /api/admin/users/:username ────────────────────────────────────────────
router.put('/users/:username', authMiddleware, masterOnly, async (req, res) => {
  const key = req.params.username.toLowerCase().trim();
  const { name, email, password, blocked } = req.body;

  try {
    const user = await User.findOne({ username: key });
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });
    if (user.role === 'master' && blocked === true) {
      return res.status(400).json({ error: 'Não é possível bloquear o master' });
    }

    if (name    !== undefined) user.name    = name;
    if (email   !== undefined) user.email   = email;
    if (blocked !== undefined) user.blocked = blocked;

    if (password) {
      if (password.length < 6) return res.status(400).json({ error: 'Senha deve ter pelo menos 6 caracteres' });
      user.passwordHash = await bcrypt.hash(password, 10);
    }

    await user.save();
    res.json({
      username:   user.username,
      name:       user.name,
      email:      user.email,
      role:       user.role,
      blocked:    user.blocked,
      created_at: user.created_at,
      last_login: user.last_login,
    });
  } catch (err) {
    console.error('Erro ao atualizar usuário:', err);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// ── DELETE /api/admin/users/:username ─────────────────────────────────────────
router.delete('/users/:username', authMiddleware, masterOnly, async (req, res) => {
  const key = req.params.username.toLowerCase().trim();
  try {
    const user = await User.findOne({ username: key });
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });
    if (user.role === 'master') return res.status(400).json({ error: 'Não é possível excluir o master' });

    await User.deleteOne({ username: key });
    res.json({ message: 'Usuário removido com sucesso' });
  } catch (err) {
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

module.exports = router;
