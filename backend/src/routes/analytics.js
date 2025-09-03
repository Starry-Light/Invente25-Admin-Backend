// routes/analytics.js
const express = require('express');
const db = require('../db');
const { authMiddleware, requireRole } = require('../auth');

const router = express.Router();

// Department analytics
router.get('/department/:id', authMiddleware, requireRole(['dept_admin','super_admin']), async (req, res) => {
  const deptId = Number(req.params.id);
  if (Number.isNaN(deptId)) return res.status(400).json({ error: 'invalid department id' });

  // if dept_admin, ensure they can only access their own department
  // figure out exactly what more analytics are needed later.
  if (req.user.role === 'dept_admin' && req.user.department_id !== deptId) {
    return res.status(403).json({ error: 'forbidden' });
  }

  try {
    const deptRow = (await db.query('SELECT id, name FROM departments WHERE id=$1', [deptId])).rows[0];
    if (!deptRow) return res.status(404).json({ error: 'department not found' });

    const totEventsRes = await db.query('SELECT COUNT(*)::int AS total_events FROM events WHERE department_id=$1', [deptId]);
    const total_events = totEventsRes.rows[0].total_events;

    const regRes = await db.query(`
      SELECT
        COUNT(s.*)::int AS total_registrations,
        COALESCE(SUM(CASE WHEN s.attended THEN 1 ELSE 0 END),0)::int AS total_attendance
      FROM slots s
      JOIN events e ON s.event_id = e.external_id
      WHERE e.department_id = $1
    `, [deptId]);
    const total_registrations = regRes.rows[0].total_registrations || 0;
    const total_attendance = regRes.rows[0].total_attendance || 0;

    const perEvent = (await db.query(`
      SELECT
        e.external_id AS event_id,
        e.name AS event_name,
        COUNT(s.*)::int AS registrations,
        COALESCE(SUM(CASE WHEN s.attended THEN 1 ELSE 0 END),0)::int AS attendance
      FROM events e
      LEFT JOIN slots s ON s.event_id = e.external_id
      WHERE e.department_id = $1
      GROUP BY e.external_id, e.name
      ORDER BY registrations DESC, e.name
    `, [deptId])).rows;

    const top_event_by_registrations = perEvent.length ? perEvent[0] : null;
    const top_event_by_attendance = perEvent.slice().sort((a,b) => (b.attendance - a.attendance) || b.registrations - a.registrations)[0] || null;

    const timeRes = (await db.query(`
      SELECT date_trunc('day', s.created_at)::date AS day, COUNT(*)::int AS count
      FROM slots s
      JOIN events e ON s.event_id = e.external_id
      WHERE e.department_id = $1 AND s.created_at >= now() - interval '30 days'
      GROUP BY day
      ORDER BY day
    `, [deptId])).rows;

    const passesByPayment = (await db.query(`
      SELECT 
        r.method,
        COUNT(DISTINCT p.pass_id)::int AS total_passes
      FROM passes p
      JOIN receipts r ON p.payment_id = r.payment_id
      JOIN slots s ON s.pass_id = p.pass_id
      JOIN events e ON s.event_id = e.external_id
      WHERE e.department_id = $1
      GROUP BY r.method
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
router.get('/college', authMiddleware, requireRole(['super_admin']), async (req, res) => {
  try {
    const totalsRes = (await db.query(`
      SELECT
        (SELECT COUNT(*) FROM departments)::int AS total_departments,
        (SELECT COUNT(*) FROM events)::int AS total_events,
        (SELECT COUNT(*) FROM slots)::int AS total_registrations,
        (SELECT COALESCE(SUM(CASE WHEN attended THEN 1 ELSE 0 END),0)::int FROM slots) AS total_attendance
    `)).rows[0];

    const perDept = (await db.query(`
      SELECT
        d.id AS department_id,
        d.name AS department_name,
        COUNT(s.*)::int AS registrations,
        COALESCE(SUM(CASE WHEN s.attended THEN 1 ELSE 0 END),0)::int AS attendance
      FROM departments d
      LEFT JOIN events e ON e.department_id = d.id
      LEFT JOIN slots s ON s.event_id = e.external_id
      GROUP BY d.id, d.name
      ORDER BY registrations DESC
    `)).rows;

    const topEvents = (await db.query(`
      SELECT
        e.external_id AS event_id,
        e.name AS event_name,
        d.id AS department_id,
        d.name AS department_name,
        COUNT(s.*)::int AS registrations,
        COALESCE(SUM(CASE WHEN s.attended THEN 1 ELSE 0 END),0)::int AS attendance
      FROM events e
      LEFT JOIN departments d ON e.department_id = d.id
      LEFT JOIN slots s ON s.event_id = e.external_id
      GROUP BY e.external_id, e.name, d.id, d.name
      ORDER BY registrations DESC
      LIMIT 20
    `)).rows;

    const timeRes = (await db.query(`
      SELECT date_trunc('day', s.created_at)::date AS day, COUNT(*)::int AS count
      FROM slots s
      WHERE s.created_at >= now() - interval '30 days'
      GROUP BY day
      ORDER BY day
    `)).rows;

    const passesByPayment = (await db.query(`
      SELECT 
        r.method,
        COUNT(DISTINCT p.pass_id)::int AS total_passes
      FROM passes p
      JOIN receipts r ON p.payment_id = r.payment_id
      GROUP BY r.method
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

module.exports = router;
