// routes/events.js
const express = require('express');
const db = require('../db');
const { authMiddleware } = require('../auth');

const router = express.Router();

// list events, optional filter by department_id
router.get('/', authMiddleware, async (req, res) => {
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

module.exports = router;
