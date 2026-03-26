const mongoose = require('mongoose');

const historySchema = new mongoose.Schema({
  id:          String,
  date:        String,
  location:    String,
  description: String,
  status_code: String,
}, { _id: false });

const shipmentSchema = new mongoose.Schema({
  code:               { type: String, required: true, unique: true },
  recipient:          { type: String, default: 'Não informado' },
  sender:             { type: String, default: 'Não informado' },
  origin:             String,
  destination:        String,
  status:             { type: String, default: 'Objeto recebido' },
  status_code:        { type: String, default: 'received' },
  location:           String,
  estimated_delivery: { type: String, default: '' },
  last_update:        String,
  weight:             { type: String, default: '' },
  dimensions:         { type: String, default: '' },
  service_type:       { type: String, default: 'Padrão' },
  history:            [historySchema],
}, { versionKey: false });

module.exports = mongoose.model('Shipment', shipmentSchema);
