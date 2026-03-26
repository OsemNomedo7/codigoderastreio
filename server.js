require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');

const app = express();
const PORT = process.env.PORT || 3001;
const MONGO_URI = process.env.MONGO_URI;

if (!MONGO_URI) {
  console.error('❌  MONGO_URI não definida. Configure a variável de ambiente.');
  process.exit(1);
}

app.use(cors({
  origin: true,
  credentials: true,
}));
app.use(express.json());

// Rotas
app.use('/api/track', require('./routes/track'));
app.use('/api/admin', require('./routes/admin'));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'VeloLog API', timestamp: new Date().toISOString() });
});

mongoose.connect(MONGO_URI)
  .then(() => {
    console.log('✅  MongoDB conectado');
    app.listen(PORT, () => {
      console.log(`\n🚚 VeloLog API rodando em http://localhost:${PORT}`);
      console.log(`   GET    /api/track/:code`);
      console.log(`   POST   /api/admin/login`);
      console.log(`   GET    /api/admin/shipments`);
      console.log(`   POST   /api/admin/create`);
      console.log(`   PUT    /api/admin/update/:code`);
      console.log(`   DELETE /api/admin/delete/:code`);
      console.log(`   GET    /api/admin/users          (master only)`);
      console.log(`   POST   /api/admin/users/create   (master only)`);
      console.log(`   PUT    /api/admin/users/:username (master only)`);
      console.log(`   DELETE /api/admin/users/:username (master only)\n`);
    });
  })
  .catch(err => {
    console.error('❌  Falha ao conectar MongoDB:', err.message);
    process.exit(1);
  });
