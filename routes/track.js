const express = require('express');
const router = express.Router();
const Shipment = require('../models/Shipment');

// GET /api/track/:code
router.get('/:code', async (req, res) => {
  const code = req.params.code.toUpperCase().trim();
  try {
    const shipment = await Shipment.findOne({ code }).lean();
    if (!shipment) {
      return res.status(404).json({ error: 'Código de rastreio não encontrado', code });
    }
    res.json(shipment);
  } catch (err) {
    console.error('Erro ao buscar rastreio:', err);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

module.exports = router;
