const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

const DATA_PATH = path.join(__dirname, '../data/shipments.json');

function readShipments() {
  const raw = fs.readFileSync(DATA_PATH, 'utf8');
  return JSON.parse(raw);
}

// GET /api/track/:code
router.get('/:code', (req, res) => {
  const code = req.params.code.toUpperCase().trim();

  try {
    const shipments = readShipments();
    const shipment = shipments[code];

    if (!shipment) {
      return res.status(404).json({
        error: 'Código de rastreio não encontrado',
        code,
      });
    }

    res.json(shipment);
  } catch (err) {
    console.error('Erro ao ler shipments:', err);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

module.exports = router;
