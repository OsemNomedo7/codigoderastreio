const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { authMiddleware, JWT_SECRET } = require('../middleware/auth');

const DATA_PATH  = path.join(__dirname, '../data/shipments.json');
const USERS_PATH = path.join(__dirname, '../data/users.json');

// ── Inicializa users.json na primeira execução ──────────────────────────────
if (!fs.existsSync(USERS_PATH)) {
  const masterHash = bcrypt.hashSync('master123', 10);
  const seed = {
    master: {
      username: 'master',
      passwordHash: masterHash,
      role: 'master',
      name: 'Master Admin',
      email: '',
      created_at: new Date().toISOString(),
      blocked: false,
      last_login: null,
    },
  };
  fs.writeFileSync(USERS_PATH, JSON.stringify(seed, null, 2), 'utf8');
  console.log('✅  users.json criado — usuário master / senha: master123');
}

// ── Helpers ─────────────────────────────────────────────────────────────────
function readShipments() {
  return JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
}
function writeShipments(data) {
  fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2), 'utf8');
}
function readUsers() {
  return JSON.parse(fs.readFileSync(USERS_PATH, 'utf8'));
}
function writeUsers(data) {
  fs.writeFileSync(USERS_PATH, JSON.stringify(data, null, 2), 'utf8');
}

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

  const users = readUsers();
  const user = users[username.toLowerCase()];

  if (!user) return res.status(401).json({ error: 'Credenciais inválidas' });
  if (user.blocked) return res.status(403).json({ error: 'Acesso bloqueado. Entre em contato com o master.' });

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) return res.status(401).json({ error: 'Credenciais inválidas' });

  // Atualiza last_login
  users[username.toLowerCase()].last_login = new Date().toISOString();
  writeUsers(users);

  const token = jwt.sign({ username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '8h' });
  res.json({ token, username: user.username, role: user.role, name: user.name });
});

// ── GET /api/admin/shipments ─────────────────────────────────────────────────
router.get('/shipments', authMiddleware, (req, res) => {
  const shipments = readShipments();
  const list = Object.values(shipments).sort(
    (a, b) => new Date(b.last_update) - new Date(a.last_update)
  );
  res.json(list);
});

// ── GET /api/admin/stats ─────────────────────────────────────────────────────
router.get('/stats', authMiddleware, (req, res) => {
  const shipments = readShipments();
  const list = Object.values(shipments);
  res.json({
    total:            list.length,
    delivered:        list.filter(s => s.status_code === 'delivered').length,
    in_transit:       list.filter(s => ['in_transit', 'transfer', 'sorting', 'received'].includes(s.status_code)).length,
    out_for_delivery: list.filter(s => s.status_code === 'out_for_delivery').length,
    failed:           list.filter(s => ['failed_delivery', 'waiting_pickup'].includes(s.status_code)).length,
  });
});

// ── POST /api/admin/create ───────────────────────────────────────────────────
router.post('/create', authMiddleware, (req, res) => {
  const {
    code: customCode, recipient, sender, origin, destination,
    status, status_code, location, estimated_delivery,
    weight, dimensions, service_type,
  } = req.body;

  if (!recipient || !origin || !destination) {
    return res.status(400).json({ error: 'Destinatário, origem e destino são obrigatórios' });
  }

  const shipments = readShipments();
  let code = customCode
    ? customCode.toUpperCase().trim()
    : `VL${Math.floor(Math.random() * 900000000 + 100000000)}BR`;

  if (shipments[code]) return res.status(409).json({ error: 'Código já existe' });

  const now = new Date().toISOString();
  const newShipment = {
    code,
    recipient: recipient || 'Não informado',
    sender: sender || 'Não informado',
    origin, destination,
    status: status || 'Objeto recebido',
    status_code: status_code || 'received',
    location: location || origin,
    estimated_delivery: estimated_delivery || '',
    last_update: now,
    weight: weight || '',
    dimensions: dimensions || '',
    service_type: service_type || 'Padrão',
    history: [{
      id: uuidv4(), date: now, location: origin,
      description: 'Objeto recebido na unidade de tratamento',
      status_code: 'received',
    }],
  };

  shipments[code] = newShipment;
  writeShipments(shipments);
  res.status(201).json(newShipment);
});

// ── PUT /api/admin/update/:code ──────────────────────────────────────────────
router.put('/update/:code', authMiddleware, (req, res) => {
  const code = req.params.code.toUpperCase().trim();
  const { status, status_code, location, estimated_delivery, event_description, event_location } = req.body;

  const shipments = readShipments();
  if (!shipments[code]) return res.status(404).json({ error: 'Rastreio não encontrado' });

  const now = new Date().toISOString();
  if (status)             shipments[code].status             = status;
  if (status_code)        shipments[code].status_code        = status_code;
  if (location)           shipments[code].location           = location;
  if (estimated_delivery) shipments[code].estimated_delivery = estimated_delivery;
  shipments[code].last_update = now;

  if (event_description) {
    shipments[code].history.push({
      id: uuidv4(), date: now,
      location: event_location || location || shipments[code].location,
      description: event_description,
      status_code: status_code || shipments[code].status_code,
    });
  }

  writeShipments(shipments);
  res.json(shipments[code]);
});

// ── DELETE /api/admin/delete/:code ───────────────────────────────────────────
router.delete('/delete/:code', authMiddleware, (req, res) => {
  const code = req.params.code.toUpperCase().trim();
  const shipments = readShipments();
  if (!shipments[code]) return res.status(404).json({ error: 'Rastreio não encontrado' });
  delete shipments[code];
  writeShipments(shipments);
  res.json({ message: 'Rastreio removido com sucesso' });
});

// ════════════════════════════════════════════════════════════════════════════
//  GESTÃO DE USUÁRIOS (somente master)
// ════════════════════════════════════════════════════════════════════════════

// ── GET /api/admin/users ─────────────────────────────────────────────────────
router.get('/users', authMiddleware, masterOnly, (req, res) => {
  const users = readUsers();
  const list = Object.values(users).map(u => ({
    username:   u.username,
    name:       u.name,
    email:      u.email,
    role:       u.role,
    blocked:    u.blocked,
    created_at: u.created_at,
    last_login: u.last_login,
  }));
  res.json(list);
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

  const users = readUsers();
  const key = username.toLowerCase().trim();

  if (users[key]) return res.status(409).json({ error: 'Usuário já existe' });

  const passwordHash = await bcrypt.hash(password, 10);
  users[key] = {
    username: key,
    passwordHash,
    role: 'admin',
    name: name || key,
    email: email || '',
    created_at: new Date().toISOString(),
    blocked: false,
    last_login: null,
  };

  writeUsers(users);
  res.status(201).json({
    username: users[key].username,
    name: users[key].name,
    email: users[key].email,
    role: users[key].role,
    blocked: users[key].blocked,
    created_at: users[key].created_at,
    last_login: users[key].last_login,
  });
});

// ── PUT /api/admin/users/:username ────────────────────────────────────────────
router.put('/users/:username', authMiddleware, masterOnly, async (req, res) => {
  const key = req.params.username.toLowerCase().trim();
  const { name, email, password, blocked } = req.body;

  const users = readUsers();
  if (!users[key]) return res.status(404).json({ error: 'Usuário não encontrado' });
  if (users[key].role === 'master' && blocked === true) {
    return res.status(400).json({ error: 'Não é possível bloquear o master' });
  }

  if (name     !== undefined) users[key].name    = name;
  if (email    !== undefined) users[key].email   = email;
  if (blocked  !== undefined) users[key].blocked = blocked;

  if (password) {
    if (password.length < 6) return res.status(400).json({ error: 'Senha deve ter pelo menos 6 caracteres' });
    users[key].passwordHash = await bcrypt.hash(password, 10);
  }

  writeUsers(users);
  res.json({
    username:   users[key].username,
    name:       users[key].name,
    email:      users[key].email,
    role:       users[key].role,
    blocked:    users[key].blocked,
    created_at: users[key].created_at,
    last_login: users[key].last_login,
  });
});

// ── DELETE /api/admin/users/:username ─────────────────────────────────────────
router.delete('/users/:username', authMiddleware, masterOnly, (req, res) => {
  const key = req.params.username.toLowerCase().trim();
  const users = readUsers();

  if (!users[key]) return res.status(404).json({ error: 'Usuário não encontrado' });
  if (users[key].role === 'master') return res.status(400).json({ error: 'Não é possível excluir o master' });

  delete users[key];
  writeUsers(users);
  res.json({ message: 'Usuário removido com sucesso' });
});

module.exports = router;
