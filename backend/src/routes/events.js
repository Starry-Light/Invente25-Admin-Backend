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

    // Determine which events to show based on user role
    let rows;
    const queryBase = `
      SELECT e.external_id, e.name, e.department_id, d.name AS department_name, e.registrations
      FROM events e
      LEFT JOIN departments d ON e.department_id = d.id
    `;

    if (req.user.role === 'super_admin' || (req.user.role === 'volunteer' && !req.user.department_id)) {
      // Super admin and central volunteer see all events
      if (deptId) {
        rows = (await db.query(queryBase + ' WHERE e.department_id = $1 ORDER BY e.name', [deptId])).rows;
      } else {
        rows = (await db.query(queryBase + ' ORDER BY e.name')).rows;
      }
    } else if (req.user.role === 'dept_admin' || (req.user.role === 'volunteer' && req.user.department_id) || req.user.role === 'event_admin') {
      // Department-specific roles only see their department's events
      if (deptId && deptId !== req.user.department_id) {
        return res.status(403).json({ error: 'unauthorized to view other department events' });
      }
      rows = (await db.query(
        queryBase + ' WHERE e.department_id = $1 ORDER BY e.name',
        [req.user.department_id]
      )).rows;
    } else {
      return res.status(403).json({ error: 'unauthorized role' });
    }

    return res.json({ rows });
  } catch (err) {
    console.error('GET /events error', err);
    return res.status(500).json({ error: 'server error' });
  }
});

module.exports = router;
