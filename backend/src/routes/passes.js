// routes/passes.js
const express = require('express');
const db = require('../db');
const { authMiddleware, requireRole } = require('../auth');
const { randomUUID } = require('crypto');

const router = express.Router();

// get pass by id. where is this used??? why did i make this
router.get('/:passId', authMiddleware, async (req, res) => {
  const { passId } = req.params;
  const passRes = await db.query('SELECT * FROM passes WHERE id=$1', [passId]);
  if (passRes.rows.length === 0) return res.status(404).json({ error: 'not found' });
  const slots = (await db.query('SELECT * FROM slots WHERE pass_id=$1 ORDER BY slot_no', [passId])).rows;
  res.json({ pass: passRes.rows[0], slots });
});

// can hit this endpoint to list passes (used to list unverified passes for cash payment)
router.get('/', authMiddleware, requireRole(['volunteer','dept_admin','super_admin']), async (req, res) => {
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

// Assign a slot to a pass (idempotent check for duplicate event on pass)
// Roles allowed: volunteer, dept_admin, super_admin
router.post('/:passId/slots', authMiddleware, requireRole(['volunteer','dept_admin','super_admin']), async (req, res) => {
  const { passId } = req.params;
  const { slot_no, event_id } = req.body;

  // basic validation
  const slotNo = Number(slot_no);
  const evId = Number(event_id);
  if (!passId) return res.status(400).json({ error: 'passId required' });
  if (!Number.isInteger(slotNo) || slotNo < 1 || slotNo > 4) return res.status(400).json({ error: 'slot_no must be integer between 1 and 4' });
  if (!Number.isInteger(evId)) return res.status(400).json({ error: 'event_id required' });

  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    // Verify pass exists
    const passRow = (await client.query('SELECT id FROM passes WHERE id = $1 FOR UPDATE', [passId])).rows[0];
    if (!passRow) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'pass not found' });
    }

    // Verify event exists
    const eventRow = (await client.query('SELECT id FROM events WHERE id = $1', [evId])).rows[0];
    if (!eventRow) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'event not found' });
    }

    // Prevent duplicate event on same pass
    // so many checks istg
    const existingSameEvent = (await client.query(
      'SELECT 1 FROM slots WHERE pass_id = $1 AND event_id = $2 LIMIT 1',
      [passId, evId]
    )).rows[0];
    if (existingSameEvent) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'this event is already assigned to the pass' });
    }

    // Ensure slot number for this pass is free
    // idempotent check
    const existingSlotNo = (await client.query(
      'SELECT 1 FROM slots WHERE pass_id = $1 AND slot_no = $2 LIMIT 1',
      [passId, slotNo]
    )).rows[0];
    if (existingSlotNo) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'slot number already used for this pass' });
    }

    // Insert slot
    // finally
    // the case of simultaneous requests is handled by the unique constraint on (pass_id, event_id) and (pass_id, slot_no)
    // we lock the pass row at the start of the transaction to serialize concurrent requests for same
    const insertRes = await client.query(
      `INSERT INTO slots (pass_id, slot_no, event_id, attended, assigned_at)
       VALUES ($1, $2, $3, false, now())
       RETURNING pass_id, slot_no, event_id, attended, assigned_at`,
      [passId, slotNo, evId]
    );

    // increment events.registrations
    await client.query('UPDATE events SET registrations = registrations + 1 WHERE id = $1', [evId]);

    await client.query('COMMIT');

    return res.json({ ok: true, slot: insertRes.rows[0] });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (e) {}
    console.error('assign slot error', err);
    return res.status(500).json({ error: 'server error' });
  } finally {
    client.release();
  }
});

// mark_cash_paid endpoint (volunteer marks cash and we call payment-verification service)
router.post('/:passId/mark-cash-paid', authMiddleware, requireRole(['volunteer','dept_admin','super_admin']), async (req, res) => {
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
router.post('/:passId/attendance', authMiddleware, requireRole(['event_admin','dept_admin','super_admin']), async (req, res) => {
  const { passId } = req.params;
  const { event_id, attended } = req.body;
  if (!event_id) return res.status(400).json({ error: 'event_id required' });

  try {
    // verify event exists and get its department
    const evRow = (await db.query('SELECT id, department_id FROM events WHERE id = $1', [event_id])).rows[0];
    if (!evRow) return res.status(404).json({ error: 'event not found' });

    // If the caller is an event_admin, ensure they belong to the same department
    // do we need this??? checkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkk
    // if we don't, simply remove these 4 lines ig
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

// delete a slot (only if not attended) — roles: volunteer, dept_admin, super_admin
router.delete('/:passId/slots/:slot_no', authMiddleware, requireRole(['volunteer','dept_admin','super_admin']), async (req, res) => {
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
    // here too, volunteer can delete any slot but event admin can only
    // delete slots for events in their own dept???
    //checkkkk :(
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

module.exports = router;
