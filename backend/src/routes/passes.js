// routes/passes.js
const express = require('express');
const db = require('../db');
const { authMiddleware, requireRole } = require('../auth');
const { randomUUID } = require('crypto');

const router = express.Router();

// get pass by id
router.get('/:passId', authMiddleware, async (req, res) => {
  const { passId } = req.params;
  const passRes = await db.query('SELECT * FROM passes WHERE pass_id=$1', [passId]);
  if (passRes.rows.length === 0) return res.status(404).json({ error: 'not found' });
  const slots = (await db.query('SELECT * FROM slots WHERE pass_id=$1 ORDER BY slot_no', [passId])).rows;
  res.json({ pass: passRes.rows[0], slots });
});

// list all passes with their payment details
router.get('/', authMiddleware, requireRole(['volunteer','dept_admin','super_admin']), async (req, res) => {
  const rows = (await db.query(`
    SELECT p.*, r.method as payment_method 
    FROM passes p 
    LEFT JOIN receipts r ON p.payment_id = r.payment_id 
    ORDER BY p.created_at DESC`
  )).rows;
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
  
  // verify event exists with this external_id
  const eventExists = await db.query('SELECT 1 FROM events WHERE external_id = $1', [evId]);
  if (eventExists.rows.length === 0) return res.status(400).json({ error: 'event not found' });

  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    // Verify pass exists (lock row to serialize concurrent ops for this pass)
    const passRow = (await client.query('SELECT pass_id FROM passes WHERE pass_id = $1 FOR UPDATE', [passId])).rows[0];
    if (!passRow) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'pass not found' });
    }

    // Verify event exists and get its department_id
    const eventRow = (await client.query('SELECT external_id, department_id FROM events WHERE external_id = $1', [evId])).rows[0];
    if (!eventRow) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'event not found' });
    }

    const eventDept = eventRow.department_id === null ? null : Number(eventRow.department_id);

    // Enforce volunteer scoping:
    // - central volunteer => req.user.role === 'volunteer' && req.user.department_id == null -> allowed all events
    // - dept volunteer => req.user.role === 'volunteer' && req.user.department_id != null -> allowed only events in same dept
    if (req.user.role === 'volunteer') {
      const userDept = (req.user.department_id === null || typeof req.user.department_id === 'undefined')
        ? null
        : Number(req.user.department_id);

      if (userDept !== null) {
        // dept volunteer — must match event's department
        if (eventDept === null || userDept !== eventDept) {
          await client.query('ROLLBACK');
          return res.status(403).json({ error: 'forbidden: volunteer can only assign events from their department' });
        }
      }
      // if userDept === null -> central volunteer -> allowed
    }

    // Enforce dept_admin scoping: must have department_id set and match event's department
    if (req.user.role === 'dept_admin') {
      const userDept = (req.user.department_id === null || typeof req.user.department_id === 'undefined')
        ? null
        : Number(req.user.department_id);
      if (userDept === null) {
        await client.query('ROLLBACK');
        return res.status(403).json({ error: 'forbidden: dept_admin has no department assigned' });
      }
      if (eventDept === null || userDept !== eventDept) {
        await client.query('ROLLBACK');
        return res.status(403).json({ error: 'forbidden: dept_admin can only assign events from their department' });
      }
    }

    // Prevent duplicate event on same pass
    const existingSameEvent = (await client.query(
      'SELECT 1 FROM slots WHERE pass_id = $1 AND event_id = $2 LIMIT 1',
      [passId, evId]
    )).rows[0];
    if (existingSameEvent) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'this event is already assigned to the pass' });
    }

    // Ensure slot number for this pass is free
    const existingSlotNo = (await client.query(
      'SELECT 1 FROM slots WHERE pass_id = $1 AND slot_no = $2 LIMIT 1',
      [passId, slotNo]
    )).rows[0];
    if (existingSlotNo) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'slot number already used for this pass' });
    }

    // Insert slot
    const insertRes = await client.query(
      `INSERT INTO slots (pass_id, slot_no, event_id, attended, created_at)
       VALUES ($1, $2, $3, false, now())
       RETURNING pass_id, slot_no, event_id, attended, created_at`,
      [passId, slotNo, evId]
    );

    // increment events.registrations
    await client.query('UPDATE events SET registrations = registrations + 1 WHERE external_id = $1', [evId]);

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

// mark attendance (event_admin, dept_admin, super_admin)
router.post('/:passId/attendance', authMiddleware, requireRole(['event_admin','dept_admin','super_admin']), async (req, res) => {
  const { passId } = req.params;
  const { event_id, attended } = req.body;
  if (!event_id) return res.status(400).json({ error: 'event_id required' });

  try {
    // verify event exists and get its department
    const evRow = (await db.query('SELECT external_id, department_id FROM events WHERE external_id = $1', [event_id])).rows[0];
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
      JOIN events e ON s.event_id = e.external_id
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
    await db.query('UPDATE events SET registrations = GREATEST(registrations - 1, 0) WHERE external_id = $1', [slotRow.event_id]);

    return res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /passes/:passId/slots/:slot_no error', err);
    return res.status(500).json({ error: 'server error' });
  }
});

module.exports = router;
