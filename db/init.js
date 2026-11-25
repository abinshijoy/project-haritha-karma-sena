const fs = require('fs');
const path = require('path');
const { pool } = require('../src/db');

async function main() {
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await pool.query(sql);
  console.log('Database schema is ready.');
}

main()
  .catch((err) => {
    console.error('Could not initialise database:', err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
