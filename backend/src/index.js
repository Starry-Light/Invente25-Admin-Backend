require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const db = require('./db');
const { loginHandler, authMiddleware, requireRole } = require('./auth');

const app = express();
app.use(bodyParser.json());

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

// list unverified cash passes
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
  const rows = (await db.query(`SELECT * FROM passes ${where} ORDER BY created_at DESC LIMIT 200`, params)).rows;
  res.json({ rows });
});

// assign slot (volunteer)
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

    // increment event registration counter (no capacity enforcement)
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


// volunteer marks cash as paid -> call payment-verification service
app.post('/passes/:passId/mark-cash-paid', authMiddleware, requireRole(['volunteer','dept_admin','super_admin']), async (req, res) => {
  const { passId } = req.params;
  const paymentUrl = process.env.PAYMENT_VERIF_URL;
  const apiKey = process.env.PAYMENT_VERIF_API_KEY;

  if (!paymentUrl) return res.status(500).json({ error: 'payment verification URL not configured' });

  try {
    const response = await fetch(paymentUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey || ''}`
      },
      body: JSON.stringify({ pass_id: passId, marked_by: req.user.email, timestamp: new Date().toISOString() })
    });

    if (!response.ok) {
      const txt = await response.text().catch(()=>null);
      return res.status(502).json({ error: 'verification service failed', details: txt });
    }

    //await db.query('UPDATE passes SET verified=true WHERE id=$1', [passId]); 
    // this is done by the payment verification service 
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(502).json({ error: 'verification service error' });
  }
});

// mark attendance (event_admin)
app.post('/passes/:passId/attendance', authMiddleware, requireRole(['event_admin','dept_admin','super_admin']), async (req, res) => {
  const { passId } = req.params;
  const { event_id, attended } = req.body;
  if (!event_id) return res.status(400).json({ error: 'event_id required' });

  try {
    // verify slot exists
    const slot = (await db.query('SELECT * FROM slots WHERE pass_id=$1 AND event_id=$2', [passId, event_id])).rows[0];
    if (!slot) return res.status(404).json({ error: 'slot for event not found on this pass' });

    await db.query('UPDATE slots SET attended=$1 WHERE pass_id=$2 AND event_id=$3', [attended === true, passId, event_id]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'server error' });
  }
});

app.listen(PORT, () => {
  console.log(`Invente25 admin backend listening on ${PORT}`);
});
