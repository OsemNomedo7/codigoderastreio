const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3001;

const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:3000').split(',').map(s => s.trim());
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.some(o => origin.startsWith(o))) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
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
