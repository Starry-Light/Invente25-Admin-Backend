// routes/admin.js
const express = require('express');
const db = require('../db');
const { authMiddleware, requireRole } = require('../auth');

const router = express.Router();

// Superadmin-only: dump contents of key tables
router.get('/dump', authMiddleware, requireRole(['super_admin']), async (req, res) => {
  try {
    const tables = [
      'users',
      'departments',
      'events',
      'receipts',
      'passes',
      'slots',
      'hack_passes',
      'hack_reg_details',
      'admins'
    ];

    const payload = {};
    for (const t of tables) {
      try {
        const { rows } = await db.query(`SELECT * FROM ${t} ORDER BY 1 LIMIT 500`);
        payload[t] = rows;
      } catch (e) {
        payload[t] = { error: e.message };
      }
    }

    return res.json({ ok: true, tables: payload });
  } catch (err) {
    console.error('admin dump error', err);
    return res.status(500).json({ ok: false, error: 'server error' });
  }
});

module.exports = router;


