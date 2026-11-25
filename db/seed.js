const fs = require('fs');
const path = require('path');
const { pool } = require('../src/db');

async function main() {
  const sql = fs.readFileSync(path.join(__dirname, 'seed.sql'), 'utf8');
  const result = await pool.query(sql);
  console.log(`Seed complete (command: ${result.command || 'OK'}).`);
}

main()
  .catch((err) => {
    console.error('Could not seed database:', err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
