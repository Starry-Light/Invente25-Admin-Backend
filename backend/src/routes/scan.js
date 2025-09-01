// routes/scan.js
const express = require('express');
const db = require('../db');
const {authMiddleware} = require('../auth');
const router = express.Router();

// scan endpoint — accept raw passId and return pass + slots (and event names)
router.get('/scan/:passId', authMiddleware, async (req, res) => {
  const { passId } = req.params;

  try {
    const passRes = await db.query(
      'SELECT pass_id, user_email, payment_id, ticket_issued FROM passes WHERE pass_id=$1',
      [passId]
    );
    if (passRes.rows.length === 0) return res.status(404).json({ error: 'pass not found' });
    const pass = passRes.rows[0];

    // Build the slots query based on user role
    let slotsQuery = `
      SELECT s.slot_no, s.event_id, s.attended, e.name as event_name, e.department_id
      FROM slots s
      LEFT JOIN events e ON s.event_id = e.external_id
      WHERE s.pass_id = $1
    `;
    
    const queryParams = [passId];

    // Department-specific roles only see their department's events
    if (req.user.role !== 'super_admin' && !(req.user.role === 'volunteer' && !req.user.department_id)) {
      slotsQuery += ' AND e.department_id = $2';
      queryParams.push(req.user.department_id);
    }

    slotsQuery += ' ORDER BY s.slot_no';
    const slotsRes = await db.query(slotsQuery, queryParams);

    res.json({ pass, slots: slotsRes.rows });
  } catch (err) {
    console.error('GET /scan/:passId error', err);
    res.status(500).json({ error: 'server error' });
  }
});

// Assign event to a slot
router.post('/scan/:passId/assign', authMiddleware, async (req, res) => {
  const { passId } = req.params;
  const { slot_no, event_id } = req.body;

  if (!slot_no || !event_id) {
    return res.status(400).json({ error: 'slot_no and event_id are required' });
  }

  if (!['super_admin', 'dept_admin', 'volunteer'].includes(req.user.role)) {
    return res.status(403).json({ error: 'unauthorized to assign events' });
  }

  try {
    // First verify the pass exists
    const passRes = await db.query(
      'SELECT pass_id FROM passes WHERE pass_id=$1',
      [passId]
    );
    if (passRes.rows.length === 0) {
      return res.status(404).json({ error: 'pass not found' });
    }

    // Check if the event exists and verify department access
    const eventRes = await db.query(
      'SELECT external_id, department_id FROM events WHERE external_id=$1',
      [event_id]
    );
    if (eventRes.rows.length === 0) {
      return res.status(404).json({ error: 'event not found' });
    }

    // For non-super-admins and non-central-volunteers, verify the event belongs to their department
    if (req.user.role !== 'super_admin' && !(req.user.role === 'volunteer' && !req.user.department_id)) {
      if (eventRes.rows[0].department_id !== req.user.department_id) {
        return res.status(403).json({ error: 'unauthorized to assign events from other departments' });
      }
    }

    // Insert or update the slot
    const slotRes = await db.query(
      `INSERT INTO slots (pass_id, slot_no, event_id, assigned_at)
       VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
       ON CONFLICT (pass_id, slot_no) 
       DO UPDATE SET event_id=$3, assigned_at=CURRENT_TIMESTAMP, attended=false
       RETURNING *`,
      [passId, slot_no, event_id]
    );

    res.json({ message: 'event assigned', slot: slotRes.rows[0] });
  } catch (err) {
    console.error('POST /scan/:passId/assign error', err);
    res.status(500).json({ error: 'server error' });
  }
});

// Mark attendance for a slot
router.post('/scan/:passId/attend', authMiddleware, async (req, res) => {
  const { passId } = req.params;
  const { slot_no } = req.body;

  if (!slot_no) {
    return res.status(400).json({ error: 'slot_no is required' });
  }

  if (!(req.user.role === 'super_admin' || req.user.role === 'dept_admin' || req.user.role === 'event_admin' || (req.user.role === 'volunteer' && !req.user.department_id))) {
    return res.status(403).json({ error: 'unauthorized to mark attendance' });
  }

  try {
    // First verify the pass exists
    const passRes = await db.query(
      'SELECT pass_id FROM passes WHERE pass_id=$1',
      [passId]
    );
    if (passRes.rows.length === 0) {
      return res.status(404).json({ error: 'pass not found' });
    }

    // For non-super-admins and non-central-volunteers, verify the slot belongs to their department
    if (req.user.role !== 'super_admin' && !(req.user.role === 'volunteer' && !req.user.department_id)) {
      const slotDeptCheck = await db.query(
        `SELECT e.department_id 
         FROM slots s 
         JOIN events e ON s.event_id = e.external_id 
         WHERE s.pass_id = $1 AND s.slot_no = $2`,
        [passId, slot_no]
      );
      
      if (slotDeptCheck.rows.length === 0) {
        return res.status(404).json({ error: 'slot not found' });
      }
      
      if (slotDeptCheck.rows[0].department_id !== req.user.department_id) {
        return res.status(403).json({ error: 'unauthorized to mark attendance for this department' });
      }
    }

    // Then update the attendance
    const updateRes = await db.query(
      'UPDATE slots SET attended=true WHERE pass_id=$1 AND slot_no=$2 RETURNING *',
      [passId, slot_no]
    );

    if (updateRes.rows.length === 0) {
      return res.status(404).json({ error: 'slot not found' });
    }

    res.json({ message: 'attendance marked', slot: updateRes.rows[0] });
  } catch (err) {
    console.error('POST /scan/:passId/attend error', err);
    res.status(500).json({ error: 'server error' });
  }
});

// Delete a slot
router.delete('/scan/:passId/slot/:slotNo', async (req, res) => {
  const { passId, slotNo } = req.params;

  try {
    // First verify the pass exists
    const passRes = await db.query(
      'SELECT pass_id FROM passes WHERE pass_id=$1',
      [passId]
    );
    if (passRes.rows.length === 0) {
      return res.status(404).json({ error: 'pass not found' });
    }

    // Delete the slot
    const deleteRes = await db.query(
      'DELETE FROM slots WHERE pass_id=$1 AND slot_no=$2 RETURNING *',
      [passId, slotNo]
    );

    if (deleteRes.rows.length === 0) {
      return res.status(404).json({ error: 'slot not found' });
    }

    res.json({ message: 'slot deleted', slot: deleteRes.rows[0] });
  } catch (err) {
    console.error('DELETE /scan/:passId/slot/:slotNo error', err);
    res.status(500).json({ error: 'server error' });
  }
});

module.exports = router;
