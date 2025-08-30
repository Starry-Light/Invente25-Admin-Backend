// routes/scan.js
const express = require('express');
const db = require('../db');

const router = express.Router();

// scan endpoint — accept raw passId and return pass + slots (and event names)
router.get('/scan/:passId', async (req, res) => {
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
    console.error('GET /scan/:passId error', err);
    res.status(500).json({ error: 'server error' });
  }
});

module.exports = router;
