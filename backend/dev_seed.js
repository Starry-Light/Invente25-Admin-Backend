// dev_seed.js - lightweight dev seed to create dept, event, user, pass and print passId
require('dotenv').config();
const db = require('./src/db');

async function run() {
  try {
    const deptName = process.env.DEV_DEPT_NAME || 'CSE';
    const eventName = process.env.DEV_EVENT_NAME || 'Algorithms';
    const userEmail = process.env.DEV_USER_EMAIL || 'alice@example.com';
    const userName = process.env.DEV_USER_NAME || 'Alice';
    const userPhone = process.env.DEV_USER_PHONE || '9999999999';
    const paymentMethod = process.env.DEV_PAYMENT_METHOD || 'cash';

    // 1) ensure department exists
    await db.query(`INSERT INTO departments (name) VALUES ($1) ON CONFLICT (name) DO NOTHING`, [deptName]);
    const deptRow = (await db.query(`SELECT id FROM departments WHERE name=$1`, [deptName])).rows[0];
    const deptId = deptRow.id;

    // 2) create an event
    const ev = await db.query(
      `INSERT INTO events (name, department_id, registrations) VALUES ($1,$2,0) RETURNING id`,
      [eventName, deptId]
    );
    const eventId = ev.rows[0].id;

    // 3) create user (participant)
    await db.query(
      `INSERT INTO users (email, name, phone) VALUES ($1,$2,$3) ON CONFLICT (email) DO UPDATE SET name=EXCLUDED.name, phone=EXCLUDED.phone`,
      [userEmail, userName, userPhone]
    );

    // 4) create a pass
    const passRes = await db.query(
      `INSERT INTO passes (user_email, payment_method, verified, issued) VALUES ($1,$2,false,false) RETURNING id`,
      [userEmail, paymentMethod]
    );
    const passId = passRes.rows[0].id;

    console.log('=== Dev seed complete ===');
    console.log('department:', deptName, '(id=' + deptId + ')');
    console.log('event:', eventName, '(id=' + eventId + ')');
    console.log('user:', userEmail);
    console.log('pass_id:', passId);
    console.log('');
    console.log('Example curl to scan (raw passId):');
    console.log(`curl http://localhost:4000/scan/${passId}`);
    console.log('');
    process.exit(0);
  } catch (err) {
    console.error('dev_seed error', err);
    process.exit(1);
  }
}

run();
