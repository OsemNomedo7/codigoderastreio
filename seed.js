/**
 * Script de migração: importa os rastreios do shipments.json para o MongoDB.
 * Execute UMA VEZ após configurar o MONGO_URI no .env:
 *   node seed.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const Shipment = require('./models/Shipment');

const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error('❌  MONGO_URI não definida no .env');
  process.exit(1);
}

let shipmentsData;
try {
  shipmentsData = require('./data/shipments.json');
} catch {
  console.error('❌  Arquivo data/shipments.json não encontrado');
  process.exit(1);
}

async function seed() {
  await mongoose.connect(MONGO_URI);
  console.log('✅  Conectado ao MongoDB\n');

  const shipments = Object.values(shipmentsData);
  let inserted = 0;
  let skipped  = 0;

  for (const s of shipments) {
    const exists = await Shipment.findOne({ code: s.code });
    if (exists) {
      console.log(`⏭   ${s.code} — já existe, pulando`);
      skipped++;
    } else {
      await Shipment.create(s);
      console.log(`✔   ${s.code} — importado`);
      inserted++;
    }
  }

  console.log(`\n🎉  Migração concluída: ${inserted} inseridos, ${skipped} ignorados`);
  await mongoose.disconnect();
}

seed().catch(err => {
  console.error('❌  Erro na migração:', err.message);
  process.exit(1);
});
