// dev_seed_more.js
// Run inside backend container: node dev_seed_more.js
require('dotenv').config();
const db = require('./src/db');
const bcrypt = require('bcryptjs');

async function run() {
  console.log('Starting dev seed... (this will TRUNCATE key tables in DEV)');
  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    // TRUNCATE key tables (safe in dev) — keep pgcrypto ext intact
    await client.query(`
      TRUNCATE TABLE slots, passes, admins, users, events, departments RESTART IDENTITY CASCADE;
    `);

    // 1) Departments
    const depts = ['CSE', 'ECE', 'MECH'];
    const deptRows = {};
    for (const name of depts) {
      const r = await client.query(`INSERT INTO departments (name) VALUES ($1) RETURNING id`, [name]);
      deptRows[name] = r.rows[0].id;
    }
    console.log('Created departments:', deptRows);

    // 2) Events (name, department_id, registrations default 0)
    const eventsToCreate = [
      { name: 'Algorithms', dept: 'CSE' },
      { name: 'Data Structures', dept: 'CSE' },
      { name: 'Circuits', dept: 'ECE' },
      { name: 'Robotics', dept: 'MECH' }
    ];
    const eventRows = {};
    for (const e of eventsToCreate) {
      const r = await client.query(
        `INSERT INTO events (name, department_id, registrations) VALUES ($1,$2,0) RETURNING id`,
        [e.name, deptRows[e.dept]]
      );
      eventRows[e.name] = r.rows[0].id;
    }
    console.log('Created events:', eventRows);

    // 3) Admins (4 roles)
    const admins = [
      { email: 'volunteer@invente.local', pwd: 'volpass', role: 'volunteer', dept: null },
      { email: 'eventadmin.cse@invente.local', pwd: 'eventpass', role: 'event_admin', dept: deptRows['CSE'] },
      { email: 'deptadmin.ece@invente.local', pwd: 'deptpass', role: 'dept_admin', dept: deptRows['ECE'] },
      { email: 'super@invente.local', pwd: 'superpass', role: 'super_admin', dept: null }
    ];
    for (const a of admins) {
      const hash = await bcrypt.hash(a.pwd, 10);
      await client.query(
        `INSERT INTO admins (email, password_hash, role, department_id) VALUES ($1,$2,$3,$4)`,
        [a.email, hash, a.role, a.dept]
      );
    }
    console.log('Created admins:', admins.map(a => ({email: a.email, role: a.role, pwd: a.pwd})));

    // 4) Users (participants)
    const users = [
      { email: 'alice@example.com', name: 'Alice', phone: '9999999991' },
      { email: 'bob@example.com', name: 'Bob', phone: '9999999992' },
      { email: 'carol@example.com', name: 'Carol', phone: '9999999993' },
      { email: 'dave@example.com', name: 'Dave', phone: '9999999994' }
    ];
    for (const u of users) {
      await client.query(
        `INSERT INTO users (email, name, phone) VALUES ($1,$2,$3)`,
        [u.email, u.name, u.phone]
      );
    }
    console.log('Created users:', users.map(u => u.email));

    // 5) Passes
    // Alice: 2 cash unverified
    const created = {};
    const resA1 = await client.query(
      `INSERT INTO passes (id, user_email, payment_method, verified, issued) VALUES (gen_random_uuid(), $1, 'cash', false, false) RETURNING id`,
      ['alice@example.com']
    );
    const alicePass1 = resA1.rows[0].id;
    const resA2 = await client.query(
      `INSERT INTO passes (id, user_email, payment_method, verified, issued) VALUES (gen_random_uuid(), $1, 'cash', false, false) RETURNING id`,
      ['alice@example.com']
    );
    const alicePass2 = resA2.rows[0].id;

    // Bob: 1 online verified
    const resB = await client.query(
      `INSERT INTO passes (id, user_email, payment_method, verified, issued) VALUES (gen_random_uuid(), $1, 'online', true, true) RETURNING id`,
      ['bob@example.com']
    );
    const bobPass = resB.rows[0].id;

    // Carol: 1 cash already verified
    const resC = await client.query(
      `INSERT INTO passes (id, user_email, payment_method, verified, issued) VALUES (gen_random_uuid(), $1, 'cash', true, true) RETURNING id`,
      ['carol@example.com']
    );
    const carolPass = resC.rows[0].id;

    // Dave: 1 online unverified (edge case)
    const resD = await client.query(
      `INSERT INTO passes (id, user_email, payment_method, verified, issued) VALUES (gen_random_uuid(), $1, 'online', false, false) RETURNING id`,
      ['dave@example.com']
    );
    const davePass = resD.rows[0].id;

    created.passes = { alicePass1, alicePass2, bobPass, carolPass, davePass };
    console.log('Created passes:', created.passes);

    // 6) Slots (assign some)
    // Bob: slot 1 -> Algorithms (attended true)
    await client.query(
      `INSERT INTO slots (pass_id, slot_no, event_id, attended, assigned_at) VALUES ($1,1,$2,true, now())`,
      [bobPass, eventRows['Algorithms']]
    );
    // Carol: slot 1 -> Circuits (attended false)
    await client.query(
      `INSERT INTO slots (pass_id, slot_no, event_id, attended, assigned_at) VALUES ($1,1,$2,false, now())`,
      [carolPass, eventRows['Circuits']]
    );
    // Alice pass 1: slot 1 -> Robotics (attended false)
    await client.query(
      `INSERT INTO slots (pass_id, slot_no, event_id, attended, assigned_at) VALUES ($1,1,$2,false, now())`,
      [alicePass1, eventRows['Robotics']]
    );

    // update events.registrations counts to reflect inserted slots
    await client.query(`UPDATE events SET registrations = 0`);
    await client.query(`
      UPDATE events e SET registrations = COALESCE(sub.cnt,0)
      FROM (SELECT event_id, COUNT(*) as cnt FROM slots GROUP BY event_id) sub
      WHERE e.id = sub.event_id
    `);

    await client.query('COMMIT');

    console.log('Seed complete.');
    console.log('Summary:');
    console.log('- Admins: volunteer@invente.local / volpass, eventadmin.cse@invente.local / eventpass, deptadmin.ece@invente.local / deptpass, super@invente.local / superpass');
    console.log('- Pass IDs:');
    console.log('  alicePass1:', alicePass1);
    console.log('  alicePass2:', alicePass2);
    console.log('  bobPass:', bobPass);
    console.log('  carolPass:', carolPass);
    console.log('  davePass:', davePass);

    console.log('');
    console.log('Example curl commands (replace token placeholder after /auth/login):');
    console.log('Login (get JWT):');
    console.log(`curl -s -X POST http://localhost:4000/auth/login -H "Content-Type: application/json" -d '{"email":"volunteer@invente.local","password":"volpass"}' | jq`);
    console.log('');
    console.log('Scan a pass (no auth required):');
    console.log(`curl http://localhost:4000/scan/${alicePass1}`);
    console.log('');
    console.log('List unverified cash passes (use JWT token in Authorization header):');
    console.log('curl -H "Authorization: Bearer <JWT>" "http://localhost:4000/passes?verified=false&payment_method=cash" | jq');
    console.log('');
    console.log('Assign a slot (as volunteer):');
    console.log(`curl -X POST http://localhost:4000/passes/${alicePass2}/slots -H "Authorization: Bearer <JWT>" -H "Content-Type: application/json" -d '{"slot_no":1,"event_id":${eventRows['Algorithms']}}'`);
    console.log('');
    console.log('Mark cash paid (as volunteer):');
    console.log(`curl -X POST http://localhost:4000/passes/${alicePass2}/mark-cash-paid -H "Authorization: Bearer <JWT>"`);
    console.log('');
    console.log('Mark attendance (as event_admin for event in their dept):');
    console.log(`curl -X POST http://localhost:4000/passes/${bobPass}/attendance -H "Authorization: Bearer <JWT>" -H "Content-Type: application/json" -d '{"event_id":${eventRows['Algorithms']}, "attended": true}'`);
    console.log('');

  } catch (err) {
    console.error('Seed failed, rolling back.', err);
    try { await client.query('ROLLBACK'); } catch (e) {}
    process.exit(1);
  } finally {
    client.release();
    process.exit(0);
  }
}

run();
