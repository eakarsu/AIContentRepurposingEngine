const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const bcrypt = require('bcryptjs');
const db = require('../db');

async function main() {
  if (!['1', 'true'].includes(String(process.env.ALLOW_SCHEMA_MIGRATION || '').toLowerCase())) {
    throw new Error('Refusing admin bootstrap without ALLOW_SCHEMA_MIGRATION=1');
  }

  const email = process.env.PROVISION_ADMIN_EMAIL;
  const password = process.env.PROVISION_ADMIN_PASSWORD;
  if (!email || !password) throw new Error('PROVISION_ADMIN_EMAIL and PROVISION_ADMIN_PASSWORD are required');

  const passwordHash = await bcrypt.hash(password, 10);
  await db.query(
    `INSERT INTO users (email, password, name)
     VALUES ($1, $2, $3)
     ON CONFLICT (email) DO UPDATE
     SET password = EXCLUDED.password, name = EXCLUDED.name`,
    [email, passwordHash, process.env.PROVISION_ADMIN_NAME || 'Runtime Administrator']
  );
}

main()
  .then(() => db.pool.end())
  .catch(async (error) => {
    console.error(error.message);
    await db.pool.end().catch(() => {});
    process.exit(1);
  });
