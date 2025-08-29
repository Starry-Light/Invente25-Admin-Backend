require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const db = require('./db');
const { loginHandler, authMiddleware, requireRole } = require('./auth');
const cors = require('cors');
const { randomUUID } = require('crypto');

// huge index.js file - might refactor later into routes/ folder if it gets too big
// looks manageable for now tho (famous last words)

const app = express();
app.use(bodyParser.json());

app.use(cors()); // allow all origins in dev; restrict in prod if needed
const PORT = process.env.PORT || 4000;

// health
app.get('/health', (req, res) => res.json({ ok: true }));

// auth
app.post('/auth/login', loginHandler);


// also this is unprotected, (for now?) 
// scan endpoint — accept raw passId and return pass + slots (and event names)
app.get('/scan/:passId', async (req, res) => {
  const { passId } = req.params;

  try {
    const passRes = await db.query(
      'SELECT id, user_email, payment_method, verified, issued FROM passes WHERE id=$1',
      [passId]
    );
    if (passRes.rows.length === 0) return res.status(404).json({ error: 'pass not found' });
    const pass = passRes.rows[0];

    const slotsRes = await db.query(`
      SELECT s.slot_no, s.event_id, s.attended, e.name as event_name, e.department_id
      FROM slots s
      LEFT JOIN events e ON s.event_id = e.id
      WHERE s.pass_id = $1
      ORDER BY s.slot_no
    `, [passId]);

    res.json({ pass, slots: slotsRes.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'server error' });
  }
});


// get pass by id (protected)
app.get('/passes/:passId', authMiddleware, async (req, res) => {
  const { passId } = req.params;
  const passRes = await db.query('SELECT * FROM passes WHERE id=$1', [passId]);
  if (passRes.rows.length === 0) return res.status(404).json({ error: 'not found' });
  const slots = (await db.query('SELECT * FROM slots WHERE pass_id=$1 ORDER BY slot_no', [passId])).rows;
  res.json({ pass: passRes.rows[0], slots });
});

// list unverified cash passes ?? we decide whether to list all passes or only unverified cash passes based on 
// query params
// actually a really cool route (prevents sql injection)
app.get('/passes', authMiddleware, requireRole(['volunteer','dept_admin','super_admin']), async (req, res) => {
  const { verified, payment_method } = req.query;
  const q = [];
  const params = [];
  if (verified !== undefined) {
    params.push(verified === 'true');
    q.push(`verified = $${params.length}`);
  }
  if (payment_method) {
    params.push(payment_method);
    q.push(`payment_method = $${params.length}`);
  }
  const where = q.length ? 'WHERE ' + q.join(' AND ') : '';
  const rows = (await db.query(`SELECT * FROM passes ${where} ORDER BY created_at DESC`, params)).rows;
  res.json({ rows });
});

// assign slot (volunteer)
// we use a transaction here to ensure consistency - for example
// if the insert into slots succeeds but the update to events fails, we would have an inconsistent state
app.post('/passes/:passId/slots', authMiddleware, requireRole(['volunteer','dept_admin','super_admin']), async (req, res) => {
  const { passId } = req.params;
  const { slot_no, event_id } = req.body;
  if (!slot_no || !event_id) return res.status(400).json({ error: 'slot_no and event_id required' });

  const client = await db.getClient(); // get a client for transaction
  try {
    await client.query('BEGIN');

    // optional: we can lock the pass row to avoid concurrent writes but it's unlikely that such a case will happen
    const passRes = await client.query('SELECT verified FROM passes WHERE id=$1 FOR UPDATE', [passId]);
    if (passRes.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'pass not found' });
    }

    // insert slot; will fail if (pass_id, slot_no) already exists because of primary key constraint
    try {
      await client.query(
        `INSERT INTO slots(pass_id, slot_no, event_id, assigned_at) VALUES ($1,$2,$3,now())`,
        [passId, slot_no, event_id]
      );
    } catch (err) {
      await client.query('ROLLBACK');
      // Likely a primary key conflict (slot already assigned)
      return res.status(409).json({ error: 'slot already assigned or invalid slot/event' });
    }

    // increment event registration counter
    const r = await client.query(
      `UPDATE events SET registrations = COALESCE(registrations,0) + 1 WHERE id = $1 RETURNING registrations`,
      [event_id]
    );
    if (r.rowCount === 0) {
      // event not found or id invalid
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'event not found' });
    }

    await client.query('COMMIT');
    res.status(201).json({ ok: true });
  } catch (err) {
    console.error(err);
    await client.query('ROLLBACK');
    res.status(500).json({ error: 'server error' });
  } finally {
    client.release();
  }
});

// this is the one that needs workkkkkkkkkkkkkkkkkkkkkkkk. need to coordinate with payment-verification service
// volunteer marks cash as paid -> call payment-verification service (idempotent)
app.post('/passes/:passId/mark-cash-paid', authMiddleware, requireRole(['volunteer','dept_admin','super_admin']), async (req, res) => {
  const { passId } = req.params;
  const paymentUrl = process.env.PAYMENT_VERIF_URL;
  const apiKey = process.env.PAYMENT_VERIF_API_KEY;

  if (!paymentUrl) return res.status(500).json({ error: 'payment verification URL not configured' });

  try {
    // 1) check local state first (fast idempotent check)
    const passRow = (await db.query('SELECT verified FROM passes WHERE id=$1', [passId])).rows[0];
    if (!passRow) return res.status(404).json({ error: 'pass not found' });

    if (passRow.verified) {
      // Already verified — idempotent success
      return res.json({ ok: true, message: 'already verified' });
    }

    // 2) call external payment verification service with an operation id for dedupe
    const operation_id = randomUUID();
    const payload = {
      pass_id: passId,
      marked_by: req.user.email,
      timestamp: new Date().toISOString(),
      operation_id
    };

    const response = await fetch(paymentUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey || ''}`
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const txt = await response.text().catch(() => null);
      return res.status(502).json({ error: 'verification service failed', details: txt });
    }

    // 3) update local DB only if still unverified (avoid race)
    const updateRes = await db.query('UPDATE passes SET verified = true WHERE id = $1 AND verified = false RETURNING id', [passId]);
    if (updateRes.rowCount === 0) {
      // another process marked it verified concurrently — treat as success
      return res.json({ ok: true, message: 'already verified by another process' });
    }

    return res.json({ ok: true, operation_id });
  } catch (err) {
    console.error('mark-cash-paid error', err);
    return res.status(502).json({ error: 'verification service error' });
  }
});


// mark attendance (event_admin, dept_admin, super_admin)
// Added check: if requester is event_admin, ensure event belongs to their department
// !! if multiple slots for same event on a pass, this marks all of them attended/unattended
// maybe enforce unique (pass_id, event_id) in slots table?
app.post('/passes/:passId/attendance', authMiddleware, requireRole(['event_admin','dept_admin','super_admin']), async (req, res) => {
  const { passId } = req.params;
  const { event_id, attended } = req.body;
  if (!event_id) return res.status(400).json({ error: 'event_id required' });

  try {
    // verify event exists and get its department
    const evRow = (await db.query('SELECT id, department_id FROM events WHERE id = $1', [event_id])).rows[0];
    if (!evRow) return res.status(404).json({ error: 'event not found' });

    // If the caller is an event_admin, ensure they belong to the same department
    if (req.user.role === 'event_admin') {
      if (req.user.department_id !== evRow.department_id) {
        return res.status(403).json({ error: 'forbidden: event not in your department' });
      }
    }

    // verify slot exists for this pass and event
    const slot = (await db.query('SELECT * FROM slots WHERE pass_id=$1 AND event_id=$2', [passId, event_id])).rows[0];
    if (!slot) return res.status(404).json({ error: 'slot for event not found on this pass' });

    await db.query('UPDATE slots SET attended=$1 WHERE pass_id=$2 AND event_id=$3', [attended === true, passId, event_id]);
    res.json({ ok: true });
  } catch (err) {
    console.error('attendance error', err);
    res.status(500).json({ error: 'server error' });
  }
});



// ---------- Analytics endpoints ----------
// Department analytics: accessible to dept_admin (for their dept) and super_admin
app.get('/analytics/department/:id', authMiddleware, requireRole(['dept_admin','super_admin']), async (req, res) => {
  const deptId = Number(req.params.id);
  if (Number.isNaN(deptId)) return res.status(400).json({ error: 'invalid department id' });

  // if dept_admin, ensure they can only access their own department
  if (req.user.role === 'dept_admin' && req.user.department_id !== deptId) {
    return res.status(403).json({ error: 'forbidden' });
  }

  try {
    // 1) department basic info
    const deptRow = (await db.query('SELECT id, name FROM departments WHERE id=$1', [deptId])).rows[0];
    if (!deptRow) return res.status(404).json({ error: 'department not found' });

    // 2) total events
    const totEventsRes = await db.query('SELECT COUNT(*)::int AS total_events FROM events WHERE department_id=$1', [deptId]);
    const total_events = totEventsRes.rows[0].total_events;

    // 3) total registrations & attendance for department (via slots join)
    const regRes = await db.query(`
      SELECT
        COUNT(s.*)::int AS total_registrations,
        COALESCE(SUM(CASE WHEN s.attended THEN 1 ELSE 0 END),0)::int AS total_attendance
      FROM slots s
      JOIN events e ON s.event_id = e.id
      WHERE e.department_id = $1
    `, [deptId]);
    const total_registrations = regRes.rows[0].total_registrations || 0;
    const total_attendance = regRes.rows[0].total_attendance || 0;

    // 4) per-event breakdown
    const perEvent = (await db.query(`
      SELECT
        e.id AS event_id,
        e.name AS event_name,
        COUNT(s.*)::int AS registrations,
        COALESCE(SUM(CASE WHEN s.attended THEN 1 ELSE 0 END),0)::int AS attendance
      FROM events e
      LEFT JOIN slots s ON s.event_id = e.id
      WHERE e.department_id = $1
      GROUP BY e.id, e.name
      ORDER BY registrations DESC, e.name
    `, [deptId])).rows;

    const top_event_by_registrations = perEvent.length ? perEvent[0] : null;
    const top_event_by_attendance = perEvent.slice().sort((a,b) => (b.attendance - a.attendance) || b.registrations - a.registrations)[0] || null;

    // 5) registrations over time (last 30 days)
    const timeRes = (await db.query(`
      SELECT date_trunc('day', s.assigned_at)::date AS day, COUNT(*)::int AS count
      FROM slots s
      JOIN events e ON s.event_id = e.id
      WHERE e.department_id = $1 AND s.assigned_at >= now() - interval '30 days'
      GROUP BY day
      ORDER BY day
    `, [deptId])).rows;

    // 6) passes by payment method (distinct passes that have slots in this dept)
    const passesByPayment = (await db.query(`
      SELECT p.payment_method,
             COUNT(DISTINCT p.id)::int AS total_passes,
             SUM(CASE WHEN p.verified THEN 1 ELSE 0 END)::int AS verified_passes
      FROM passes p
      JOIN slots s ON s.pass_id = p.id
      JOIN events e ON s.event_id = e.id
      WHERE e.department_id = $1
      GROUP BY p.payment_method
    `, [deptId])).rows;

    return res.json({
      department: deptRow,
      total_events,
      total_registrations,
      total_attendance,
      per_event: perEvent,
      top_event_by_registrations,
      top_event_by_attendance,
      registrations_over_time: timeRes,
      passes_by_payment: passesByPayment
    });
  } catch (err) {
    console.error('analytics/department error', err);
    return res.status(500).json({ error: 'server error' });
  }
});

// College-level analytics: visible to super_admin only
app.get('/analytics/college', authMiddleware, requireRole(['super_admin']), async (req, res) => {
  try {
    // totals
    const totalsRes = (await db.query(`
      SELECT
        (SELECT COUNT(*) FROM departments)::int AS total_departments,
        (SELECT COUNT(*) FROM events)::int AS total_events,
        (SELECT COUNT(*) FROM slots)::int AS total_registrations,
        (SELECT COALESCE(SUM(CASE WHEN attended THEN 1 ELSE 0 END),0)::int FROM slots) AS total_attendance
    `)).rows[0];

    // per-department summary
    const perDept = (await db.query(`
      SELECT
        d.id AS department_id,
        d.name AS department_name,
        COUNT(s.*)::int AS registrations,
        COALESCE(SUM(CASE WHEN s.attended THEN 1 ELSE 0 END),0)::int AS attendance
      FROM departments d
      LEFT JOIN events e ON e.department_id = d.id
      LEFT JOIN slots s ON s.event_id = e.id
      GROUP BY d.id, d.name
      ORDER BY registrations DESC
    `)).rows;

    // top events overall
    const topEvents = (await db.query(`
      SELECT
        e.id AS event_id,
        e.name AS event_name,
        d.id AS department_id,
        d.name AS department_name,
        COUNT(s.*)::int AS registrations,
        COALESCE(SUM(CASE WHEN s.attended THEN 1 ELSE 0 END),0)::int AS attendance
      FROM events e
      LEFT JOIN departments d ON e.department_id = d.id
      LEFT JOIN slots s ON s.event_id = e.id
      GROUP BY e.id, e.name, d.id, d.name
      ORDER BY registrations DESC
      LIMIT 20
    `)).rows;

    // registrations over time (last 30 days) overall
    const timeRes = (await db.query(`
      SELECT date_trunc('day', s.assigned_at)::date AS day, COUNT(*)::int AS count
      FROM slots s
      WHERE s.assigned_at >= now() - interval '30 days'
      GROUP BY day
      ORDER BY day
    `)).rows;

    // passes by payment method and verified counts (overall)
    const passesByPayment = (await db.query(`
      SELECT payment_method,
             COUNT(*)::int AS total_passes,
             SUM(CASE WHEN verified THEN 1 ELSE 0 END)::int AS verified_passes
      FROM passes
      GROUP BY payment_method
    `)).rows;

    return res.json({
      totals: totalsRes,
      per_department: perDept,
      top_events: topEvents,
      registrations_over_time: timeRes,
      passes_by_payment: passesByPayment
    });
  } catch (err) {
    console.error('analytics/college error', err);
    return res.status(500).json({ error: 'server error' });
  }
});


// list events, optional filter by department_id
app.get('/events', authMiddleware, async (req, res) => {
  try {
    const deptId = req.query.department_id ? Number(req.query.department_id) : null;
    if (deptId && Number.isNaN(deptId)) return res.status(400).json({ error: 'invalid department_id' });

    let rows;
    if (deptId) {
      const q = `
        SELECT e.id, e.name, e.department_id, d.name AS department_name, e.registrations
        FROM events e
        LEFT JOIN departments d ON e.department_id = d.id
        WHERE e.department_id = $1
        ORDER BY e.name
      `;
      rows = (await db.query(q, [deptId])).rows;
    } else {
      const q = `
        SELECT e.id, e.name, e.department_id, d.name AS department_name, e.registrations
        FROM events e
        LEFT JOIN departments d ON e.department_id = d.id
        ORDER BY e.name
      `;
      rows = (await db.query(q)).rows;
    }

    return res.json({ rows });
  } catch (err) {
    console.error('GET /events error', err);
    return res.status(500).json({ error: 'server error' });
  }
});


// delete a slot (only if not attended) — roles: volunteer, dept_admin, super_admin
app.delete('/passes/:passId/slots/:slot_no', authMiddleware, requireRole(['volunteer','dept_admin','super_admin']), async (req, res) => {
  const { passId, slot_no } = req.params;
  const slotNo = Number(slot_no);
  if (Number.isNaN(slotNo)) return res.status(400).json({ error: 'invalid slot_no' });

  try {
    const slotRow = (await db.query(`
      SELECT s.pass_id, s.slot_no, s.event_id, s.attended, e.department_id
      FROM slots s
      JOIN events e ON s.event_id = e.id
      WHERE s.pass_id = $1 AND s.slot_no = $2
    `, [passId, slotNo])).rows[0];

    if (!slotRow) return res.status(404).json({ error: 'slot not found' });
    if (slotRow.attended) return res.status(400).json({ error: 'cannot delete attended slot' });

    // If caller is event_admin, ensure event belongs to their department
    if (req.user.role === 'event_admin') {
      if (req.user.department_id !== slotRow.department_id) {
        return res.status(403).json({ error: 'forbidden: event not in your department' });
      }
    }

    // delete the slot
    await db.query('DELETE FROM slots WHERE pass_id = $1 AND slot_no = $2', [passId, slotNo]);

    // decrement events.registrations safely
    await db.query('UPDATE events SET registrations = GREATEST(registrations - 1, 0) WHERE id = $1', [slotRow.event_id]);

    return res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /passes/:passId/slots/:slot_no error', err);
    return res.status(500).json({ error: 'server error' });
  }
});


app.listen(PORT, () => {
  console.log(`Invente25 admin backend listening on ${PORT}`);
});
