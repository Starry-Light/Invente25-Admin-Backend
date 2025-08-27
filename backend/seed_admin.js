require('dotenv').config();

const bcrypt = require('bcryptjs');
const db = require('./src/db');

const argv = require('minimist')(process.argv.slice(2));

const email = argv.email || process.env.SEED_ADMIN_EMAIL || 'admin@invente.local';
const password = argv.pwd || process.env.SEED_ADMIN_PWD || 'password';
const role = argv.role || 'super_admin';
const dept = argv.dept_id || null;

async function run() {
  const hash = await bcrypt.hash(password, 10);
  try {
    await db.query(
      `INSERT INTO admins (email, password_hash, role, department_id) VALUES ($1,$2,$3,$4)
       ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, role = EXCLUDED.role, department_id = EXCLUDED.department_id`,
      [email, hash, role, dept]
    );
    console.log('Admin seeded:', email, 'role=', role);
    process.exit(0);
  } catch (err) {
    console.error('Seed failed', err);
    process.exit(1);
  }
}

run();
