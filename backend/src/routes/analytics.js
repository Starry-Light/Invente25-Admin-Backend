// routes/analytics.js
const express = require('express');
const db = require('../db');
const { authMiddleware, requireRole } = require('../auth');
const XLSX = require('xlsx');

const router = express.Router();

// Enhanced Department analytics
router.get('/department/:id', authMiddleware, requireRole(['dept_admin','super_admin']), async (req, res) => {
  const deptId = Number(req.params.id);
  if (Number.isNaN(deptId)) return res.status(400).json({ error: 'invalid department id' });

  // if dept_admin, ensure they can only access their own department
  if (req.user.role === 'dept_admin' && req.user.department_id !== deptId) {
    return res.status(403).json({ error: 'forbidden' });
  }

  try {
    const deptRow = (await db.query('SELECT id, name FROM departments WHERE id=$1', [deptId])).rows[0];
    if (!deptRow) return res.status(404).json({ error: 'department not found' });

    // Basic counts
    const totEventsRes = await db.query('SELECT COUNT(*)::int AS total_events FROM events WHERE department_id=$1', [deptId]);
    const total_events = totEventsRes.rows[0].total_events;

    // Technical events analytics
    const techRegRes = await db.query(`
      SELECT
        COUNT(s.*)::int AS total_registrations,
        COALESCE(SUM(CASE WHEN s.attended THEN 1 ELSE 0 END),0)::int AS total_attendance
      FROM slots s
      JOIN events e ON s.event_id = e.external_id
      WHERE e.department_id = $1 AND e.event_type = 'technical'
    `, [deptId]);
    const tech_registrations = techRegRes.rows[0].total_registrations || 0;
    const tech_attendance = techRegRes.rows[0].total_attendance || 0;

    // Non-technical events analytics
    const nonTechRegRes = await db.query(`
      SELECT
        COUNT(s.*)::int AS total_registrations,
        COALESCE(SUM(CASE WHEN s.attended THEN 1 ELSE 0 END),0)::int AS total_attendance
      FROM slots s
      JOIN events e ON s.event_id = e.external_id
      WHERE e.department_id = $1 AND e.event_type = 'non-technical'
    `, [deptId]);
    const nontech_registrations = nonTechRegRes.rows[0].total_registrations || 0;
    const nontech_attendance = nonTechRegRes.rows[0].total_attendance || 0;

    const total_registrations = tech_registrations + nontech_registrations;
    const total_attendance = tech_attendance + nontech_attendance;

    // Per-event breakdown with event types
    const perEvent = (await db.query(`
      SELECT
        e.external_id AS event_id,
        e.name AS event_name,
        e.event_type,
        e.cost,
        COUNT(s.*)::int AS registrations,
        COALESCE(SUM(CASE WHEN s.attended THEN 1 ELSE 0 END),0)::int AS attendance,
        COALESCE(SUM(e.cost), 0)::decimal AS revenue
      FROM events e
      LEFT JOIN slots s ON s.event_id = e.external_id
      WHERE e.department_id = $1
      GROUP BY e.external_id, e.name, e.event_type, e.cost
      ORDER BY registrations DESC, e.name
    `, [deptId])).rows;

    // Event type breakdown
    const eventTypeBreakdown = (await db.query(`
      SELECT
        e.event_type,
        COUNT(DISTINCT e.external_id)::int AS event_count,
        COUNT(s.*)::int AS total_registrations,
        COALESCE(SUM(CASE WHEN s.attended THEN 1 ELSE 0 END),0)::int AS total_attendance,
        COALESCE(SUM(e.cost), 0)::decimal AS total_revenue
      FROM events e
      LEFT JOIN slots s ON s.event_id = e.external_id
      WHERE e.department_id = $1
      GROUP BY e.event_type
      ORDER BY total_registrations DESC
    `, [deptId])).rows;

    // Top events
    const top_event_by_registrations = perEvent.length ? perEvent[0] : null;
    const top_event_by_attendance = perEvent.slice().sort((a,b) => (b.attendance - a.attendance) || b.registrations - a.registrations)[0] || null;

    // Time-based analytics
    const timeRes = (await db.query(`
      SELECT 
        date_trunc('day', s.created_at)::date AS day, 
        COUNT(*)::int AS count,
        e.event_type
      FROM slots s
      JOIN events e ON s.event_id = e.external_id
      WHERE e.department_id = $1 AND s.created_at >= now() - interval '30 days'
      GROUP BY day, e.event_type
      ORDER BY day, e.event_type
    `, [deptId])).rows;

    // Payment analytics
    const passesByPayment = (await db.query(`
      SELECT 
        r.method,
        COUNT(DISTINCT p.pass_id)::int AS total_passes,
        COALESCE(SUM(r.amount), 0)::decimal AS total_revenue
      FROM passes p
      JOIN receipts r ON p.payment_id = r.payment_id
      JOIN slots s ON s.pass_id = p.pass_id
      JOIN events e ON s.event_id = e.external_id
      WHERE e.department_id = $1
      GROUP BY r.method
    `, [deptId])).rows;

    // Revenue analytics
    const revenueRes = (await db.query(`
      SELECT 
        COALESCE(SUM(r.amount), 0)::decimal AS total_revenue,
        COALESCE(AVG(r.amount), 0)::decimal AS avg_transaction
      FROM passes p
      JOIN receipts r ON p.payment_id = r.payment_id
      JOIN slots s ON s.pass_id = p.pass_id
      JOIN events e ON s.event_id = e.external_id
      WHERE e.department_id = $1
    `, [deptId])).rows[0];

    return res.json({
      department: deptRow,
      totals: {
        total_events,
        total_registrations,
        total_attendance,
        total_revenue: revenueRes.total_revenue,
        avg_transaction: revenueRes.avg_transaction
      },
      breakdown: {
        technical: {
          registrations: tech_registrations,
          attendance: tech_attendance
        },
        non_technical: {
          registrations: nontech_registrations,
          attendance: nontech_attendance
        }
      },
      event_type_breakdown: eventTypeBreakdown,
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

// Enhanced College-level analytics: visible to super_admin only
router.get('/college', authMiddleware, requireRole(['super_admin']), async (req, res) => {
  try {
    // Basic totals
    const totalsRes = (await db.query(`
      SELECT
        (SELECT COUNT(*) FROM departments WHERE name != 'WORKSHOP')::int AS total_departments,
        (SELECT COUNT(*) FROM events WHERE department_id != (SELECT id FROM departments WHERE name = 'WORKSHOP'))::int AS total_events,
        (SELECT COUNT(*) FROM slots)::int AS total_registrations,
        (SELECT COALESCE(SUM(CASE WHEN attended THEN 1 ELSE 0 END),0)::int FROM slots) AS total_attendance,
        (SELECT COUNT(*) FROM hack_passes)::int AS total_hackathon_teams,
        (SELECT COUNT(*) FROM events WHERE department_id = (SELECT id FROM departments WHERE name = 'WORKSHOP'))::int AS total_workshops
    `)).rows[0];

    // Revenue analytics
    const revenueRes = (await db.query(`
      SELECT 
        COALESCE(SUM(r.amount), 0)::decimal AS total_revenue,
        COALESCE(AVG(r.amount), 0)::decimal AS avg_transaction,
        COUNT(DISTINCT r.payment_id)::int AS total_transactions
      FROM receipts r
    `)).rows[0];

    // Department analytics (excluding WORKSHOP)
    const perDept = (await db.query(`
      SELECT
        d.id AS department_id,
        d.name AS department_name,
        COUNT(DISTINCT e.external_id)::int AS event_count,
        COUNT(s.*)::int AS registrations,
        COALESCE(SUM(CASE WHEN s.attended THEN 1 ELSE 0 END),0)::int AS attendance,
        COALESCE(SUM(r.amount), 0)::decimal AS revenue
      FROM departments d
      LEFT JOIN events e ON e.department_id = d.id
      LEFT JOIN slots s ON s.event_id = e.external_id
      LEFT JOIN passes p ON p.pass_id = s.pass_id
      LEFT JOIN receipts r ON r.payment_id = p.payment_id
      WHERE d.name != 'WORKSHOP'
      GROUP BY d.id, d.name
      ORDER BY registrations DESC
    `)).rows;

    // Event type breakdown
    const eventTypeBreakdown = (await db.query(`
      SELECT
        e.event_type,
        COUNT(DISTINCT e.external_id)::int AS event_count,
        COUNT(s.*)::int AS total_registrations,
        COALESCE(SUM(CASE WHEN s.attended THEN 1 ELSE 0 END),0)::int AS total_attendance,
        COALESCE(SUM(r.amount), 0)::decimal AS total_revenue
      FROM events e
      LEFT JOIN slots s ON s.event_id = e.external_id
      LEFT JOIN passes p ON p.pass_id = s.pass_id
      LEFT JOIN receipts r ON r.payment_id = p.payment_id
      WHERE e.department_id != (SELECT id FROM departments WHERE name = 'WORKSHOP')
      GROUP BY e.event_type
      ORDER BY total_registrations DESC
    `)).rows;

    // Top events
    const topEvents = (await db.query(`
      SELECT
        e.external_id AS event_id,
        e.name AS event_name,
        e.event_type,
        d.id AS department_id,
        d.name AS department_name,
        COUNT(s.*)::int AS registrations,
        COALESCE(SUM(CASE WHEN s.attended THEN 1 ELSE 0 END),0)::int AS attendance,
        COALESCE(SUM(r.amount), 0)::decimal AS revenue
      FROM events e
      LEFT JOIN departments d ON e.department_id = d.id
      LEFT JOIN slots s ON s.event_id = e.external_id
      LEFT JOIN passes p ON p.pass_id = s.pass_id
      LEFT JOIN receipts r ON r.payment_id = p.payment_id
      WHERE e.department_id != (SELECT id FROM departments WHERE name = 'WORKSHOP')
      GROUP BY e.external_id, e.name, e.event_type, d.id, d.name
      ORDER BY registrations DESC
      LIMIT 20
    `)).rows;

    // Time-based analytics
    const timeRes = (await db.query(`
      SELECT 
        date_trunc('day', s.created_at)::date AS day, 
        COUNT(*)::int AS count,
        e.event_type
      FROM slots s
      JOIN events e ON s.event_id = e.external_id
      WHERE s.created_at >= now() - interval '30 days'
      GROUP BY day, e.event_type
      ORDER BY day, e.event_type
    `)).rows;

    // Payment analytics
    const passesByPayment = (await db.query(`
      SELECT 
        r.method,
        COUNT(DISTINCT p.pass_id)::int AS total_passes,
        COALESCE(SUM(r.amount), 0)::decimal AS total_revenue
      FROM passes p
      JOIN receipts r ON p.payment_id = r.payment_id
      GROUP BY r.method
    `)).rows;

    // Workshop analytics
    const workshopAnalytics = (await db.query(`
      SELECT
        e.external_id AS event_id,
        e.name AS event_name,
        e.cost,
        COUNT(s.*)::int AS registrations,
        COALESCE(SUM(CASE WHEN s.attended THEN 1 ELSE 0 END),0)::int AS attendance,
        COALESCE(SUM(r.amount), 0)::decimal AS revenue
      FROM events e
      LEFT JOIN slots s ON s.event_id = e.external_id
      LEFT JOIN passes p ON p.pass_id = s.pass_id
      LEFT JOIN receipts r ON r.payment_id = p.payment_id
      WHERE e.department_id = (SELECT id FROM departments WHERE name = 'WORKSHOP')
      GROUP BY e.external_id, e.name, e.cost
      ORDER BY registrations DESC
    `)).rows;

    // Hackathon analytics
    const hackathonAnalytics = (await db.query(`
      SELECT
        track,
        COUNT(*)::int AS team_count,
        COUNT(CASE WHEN attended THEN 1 END)::int AS attended_teams,
        COUNT(DISTINCT leader_email)::int AS unique_leaders
      FROM hack_passes
      GROUP BY track
      ORDER BY team_count DESC
    `)).rows;

    const hackathonDetails = (await db.query(`
      SELECT
        h.team_id,
        h.team_name,
        h.track,
        h.attended,
        h.created_at,
        COUNT(hd.email)::int AS team_size
      FROM hack_passes h
      LEFT JOIN hack_reg_details hd ON h.team_id = hd.team_id
      GROUP BY h.team_id, h.team_name, h.track, h.attended, h.created_at
      ORDER BY h.created_at DESC
      LIMIT 50
    `)).rows;

    return res.json({
      totals: {
        ...totalsRes,
        total_revenue: revenueRes.total_revenue,
        avg_transaction: revenueRes.avg_transaction,
        total_transactions: revenueRes.total_transactions
      },
      per_department: perDept,
      event_type_breakdown: eventTypeBreakdown,
      top_events: topEvents,
      registrations_over_time: timeRes,
      passes_by_payment: passesByPayment,
      workshops: {
        analytics: workshopAnalytics,
        summary: {
          total_workshops: workshopAnalytics.length,
          total_registrations: workshopAnalytics.reduce((sum, w) => sum + w.registrations, 0),
          total_revenue: workshopAnalytics.reduce((sum, w) => sum + Number(w.revenue), 0)
        }
      },
      hackathons: {
        track_breakdown: hackathonAnalytics,
        recent_teams: hackathonDetails,
        summary: {
          total_teams: totalsRes.total_hackathon_teams,
          total_attended: hackathonAnalytics.reduce((sum, h) => sum + h.attended_teams, 0),
          total_participants: hackathonDetails.reduce((sum, h) => sum + h.team_size, 0)
        }
      }
    });
  } catch (err) {
    console.error('analytics/college error', err);
    return res.status(500).json({ error: 'server error' });
  }
});

// Excel export endpoint
router.get('/export/college', authMiddleware, requireRole(['super_admin']), async (req, res) => {
  try {
    // Get all the data for export by calling the same queries as college analytics
    const collegeData = await getCollegeAnalyticsDataForExport();
    
    // Create workbook
    const wb = XLSX.utils.book_new();
    
    // Summary sheet
    const summaryData = [
      ['Metric', 'Value'],
      ['Total Departments', collegeData.totals.total_departments],
      ['Total Events', collegeData.totals.total_events],
      ['Total Registrations', collegeData.totals.total_registrations],
      ['Total Attendance', collegeData.totals.total_attendance],
      ['Total Revenue', collegeData.totals.total_revenue],
      ['Average Transaction', collegeData.totals.avg_transaction],
      ['Total Hackathon Teams', collegeData.totals.total_hackathon_teams],
      ['Total Workshops', collegeData.totals.total_workshops]
    ];
    const summaryWS = XLSX.utils.aoa_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(wb, summaryWS, 'Summary');
    
    // Department breakdown
    const deptData = [
      ['Department', 'Events', 'Registrations', 'Attendance', 'Revenue'],
      ...collegeData.per_department.map(d => [
        d.department_name, d.event_count, d.registrations, d.attendance, d.revenue
      ])
    ];
    const deptWS = XLSX.utils.aoa_to_sheet(deptData);
    XLSX.utils.book_append_sheet(wb, deptWS, 'Departments');
    
    // Event type breakdown
    const eventTypeData = [
      ['Event Type', 'Event Count', 'Registrations', 'Attendance', 'Revenue'],
      ...collegeData.event_type_breakdown.map(e => [
        e.event_type, e.event_count, e.total_registrations, e.total_attendance, e.total_revenue
      ])
    ];
    const eventTypeWS = XLSX.utils.aoa_to_sheet(eventTypeData);
    XLSX.utils.book_append_sheet(wb, eventTypeWS, 'Event Types');
    
    // Top events
    const topEventsData = [
      ['Event Name', 'Department', 'Type', 'Registrations', 'Attendance', 'Revenue'],
      ...collegeData.top_events.map(e => [
        e.event_name, e.department_name, e.event_type, e.registrations, e.attendance, e.revenue
      ])
    ];
    const topEventsWS = XLSX.utils.aoa_to_sheet(topEventsData);
    XLSX.utils.book_append_sheet(wb, topEventsWS, 'Top Events');
    
    // Workshops
    const workshopData = [
      ['Workshop Name', 'Cost', 'Registrations', 'Attendance', 'Revenue'],
      ...collegeData.workshops.analytics.map(w => [
        w.event_name, w.cost, w.registrations, w.attendance, w.revenue
      ])
    ];
    const workshopWS = XLSX.utils.aoa_to_sheet(workshopData);
    XLSX.utils.book_append_sheet(wb, workshopWS, 'Workshops');
    
    // Hackathons
    const hackathonData = [
      ['Track', 'Team Count', 'Attended Teams', 'Unique Leaders'],
      ...collegeData.hackathons.track_breakdown.map(h => [
        h.track, h.team_count, h.attended_teams, h.unique_leaders
      ])
    ];
    const hackathonWS = XLSX.utils.aoa_to_sheet(hackathonData);
    XLSX.utils.book_append_sheet(wb, hackathonWS, 'Hackathons');
    
    // Generate buffer
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    
    // Set headers for download
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="invente25-analytics-${new Date().toISOString().split('T')[0]}.xlsx"`);
    res.send(buffer);
    
  } catch (err) {
    console.error('Export error:', err);
    res.status(500).json({ error: 'Export failed' });
  }
});

// Helper function to get college analytics data for export
async function getCollegeAnalyticsDataForExport() {
  // Basic totals
  const totalsRes = (await db.query(`
    SELECT
      (SELECT COUNT(*) FROM departments WHERE name != 'WORKSHOP')::int AS total_departments,
      (SELECT COUNT(*) FROM events WHERE department_id != (SELECT id FROM departments WHERE name = 'WORKSHOP'))::int AS total_events,
      (SELECT COUNT(*) FROM slots)::int AS total_registrations,
      (SELECT COALESCE(SUM(CASE WHEN attended THEN 1 ELSE 0 END),0)::int FROM slots) AS total_attendance,
      (SELECT COUNT(*) FROM hack_passes)::int AS total_hackathon_teams,
      (SELECT COUNT(*) FROM events WHERE department_id = (SELECT id FROM departments WHERE name = 'WORKSHOP'))::int AS total_workshops
  `)).rows[0];

  // Revenue analytics
  const revenueRes = (await db.query(`
    SELECT 
      COALESCE(SUM(r.amount), 0)::decimal AS total_revenue,
      COALESCE(AVG(r.amount), 0)::decimal AS avg_transaction,
      COUNT(DISTINCT r.payment_id)::int AS total_transactions
    FROM receipts r
  `)).rows[0];

  // Department analytics (excluding WORKSHOP)
  const perDept = (await db.query(`
    SELECT
      d.id AS department_id,
      d.name AS department_name,
      COUNT(DISTINCT e.external_id)::int AS event_count,
      COUNT(s.*)::int AS registrations,
      COALESCE(SUM(CASE WHEN s.attended THEN 1 ELSE 0 END),0)::int AS attendance,
      COALESCE(SUM(r.amount), 0)::decimal AS revenue
    FROM departments d
    LEFT JOIN events e ON e.department_id = d.id
    LEFT JOIN slots s ON s.event_id = e.external_id
    LEFT JOIN passes p ON p.pass_id = s.pass_id
    LEFT JOIN receipts r ON r.payment_id = p.payment_id
    WHERE d.name != 'WORKSHOP'
    GROUP BY d.id, d.name
    ORDER BY registrations DESC
  `)).rows;

  // Event type breakdown
  const eventTypeBreakdown = (await db.query(`
    SELECT
      e.event_type,
      COUNT(DISTINCT e.external_id)::int AS event_count,
      COUNT(s.*)::int AS total_registrations,
      COALESCE(SUM(CASE WHEN s.attended THEN 1 ELSE 0 END),0)::int AS total_attendance,
      COALESCE(SUM(r.amount), 0)::decimal AS total_revenue
    FROM events e
    LEFT JOIN slots s ON s.event_id = e.external_id
    LEFT JOIN passes p ON p.pass_id = s.pass_id
    LEFT JOIN receipts r ON r.payment_id = p.payment_id
    WHERE e.department_id != (SELECT id FROM departments WHERE name = 'WORKSHOP')
    GROUP BY e.event_type
    ORDER BY total_registrations DESC
  `)).rows;

  // Top events
  const topEvents = (await db.query(`
    SELECT
      e.external_id AS event_id,
      e.name AS event_name,
      e.event_type,
      d.id AS department_id,
      d.name AS department_name,
      COUNT(s.*)::int AS registrations,
      COALESCE(SUM(CASE WHEN s.attended THEN 1 ELSE 0 END),0)::int AS attendance,
      COALESCE(SUM(r.amount), 0)::decimal AS revenue
    FROM events e
    LEFT JOIN departments d ON e.department_id = d.id
    LEFT JOIN slots s ON s.event_id = e.external_id
    LEFT JOIN passes p ON p.pass_id = s.pass_id
    LEFT JOIN receipts r ON r.payment_id = p.payment_id
    WHERE e.department_id != (SELECT id FROM departments WHERE name = 'WORKSHOP')
    GROUP BY e.external_id, e.name, e.event_type, d.id, d.name
    ORDER BY registrations DESC
    LIMIT 20
  `)).rows;

  // Workshop analytics
  const workshopAnalytics = (await db.query(`
    SELECT
      e.external_id AS event_id,
      e.name AS event_name,
      e.cost,
      COUNT(s.*)::int AS registrations,
      COALESCE(SUM(CASE WHEN s.attended THEN 1 ELSE 0 END),0)::int AS attendance,
      COALESCE(SUM(r.amount), 0)::decimal AS revenue
    FROM events e
    LEFT JOIN slots s ON s.event_id = e.external_id
    LEFT JOIN passes p ON p.pass_id = s.pass_id
    LEFT JOIN receipts r ON r.payment_id = p.payment_id
    WHERE e.department_id = (SELECT id FROM departments WHERE name = 'WORKSHOP')
    GROUP BY e.external_id, e.name, e.cost
    ORDER BY registrations DESC
  `)).rows;

  // Hackathon analytics
  const hackathonAnalytics = (await db.query(`
    SELECT
      track,
      COUNT(*)::int AS team_count,
      COUNT(CASE WHEN attended THEN 1 END)::int AS attended_teams,
      COUNT(DISTINCT leader_email)::int AS unique_leaders
    FROM hack_passes
    GROUP BY track
    ORDER BY team_count DESC
  `)).rows;

  return {
    totals: {
      ...totalsRes,
      total_revenue: revenueRes.total_revenue,
      avg_transaction: revenueRes.avg_transaction,
      total_transactions: revenueRes.total_transactions
    },
    per_department: perDept,
    event_type_breakdown: eventTypeBreakdown,
    top_events: topEvents,
    workshops: {
      analytics: workshopAnalytics
    },
    hackathons: {
      track_breakdown: hackathonAnalytics
    }
  };
}

// Workshop analytics endpoint (separate from departments)
router.get('/workshops', authMiddleware, requireRole(['super_admin']), async (req, res) => {
  try {
    const workshopAnalytics = (await db.query(`
      SELECT
        e.external_id AS event_id,
        e.name AS event_name,
        e.cost,
        COUNT(s.*)::int AS registrations,
        COALESCE(SUM(CASE WHEN s.attended THEN 1 ELSE 0 END),0)::int AS attendance,
        COALESCE(SUM(r.amount), 0)::decimal AS revenue
      FROM events e
      LEFT JOIN slots s ON s.event_id = e.external_id
      LEFT JOIN passes p ON p.pass_id = s.pass_id
      LEFT JOIN receipts r ON r.payment_id = p.payment_id
      WHERE e.department_id = (SELECT id FROM departments WHERE name = 'WORKSHOP')
      GROUP BY e.external_id, e.name, e.cost
      ORDER BY registrations DESC
    `)).rows;

    const summary = {
      total_workshops: workshopAnalytics.length,
      total_registrations: workshopAnalytics.reduce((sum, w) => sum + w.registrations, 0),
      total_attendance: workshopAnalytics.reduce((sum, w) => sum + w.attendance, 0),
      total_revenue: workshopAnalytics.reduce((sum, w) => sum + Number(w.revenue), 0)
    };

    res.json({
      summary,
      workshops: workshopAnalytics
    });
  } catch (err) {
    console.error('Workshop analytics error:', err);
    res.status(500).json({ error: 'server error' });
  }
});

// Hackathon analytics endpoint
router.get('/hackathons', authMiddleware, requireRole(['super_admin']), async (req, res) => {
  try {
    const trackBreakdown = (await db.query(`
      SELECT
        track,
        COUNT(*)::int AS team_count,
        COUNT(CASE WHEN attended THEN 1 END)::int AS attended_teams,
        COUNT(DISTINCT leader_email)::int AS unique_leaders
      FROM hack_passes
      GROUP BY track
      ORDER BY team_count DESC
    `)).rows;

    const teamDetails = (await db.query(`
      SELECT
        h.team_id,
        h.team_name,
        h.track,
        h.attended,
        h.created_at,
        COUNT(hd.email)::int AS team_size
      FROM hack_passes h
      LEFT JOIN hack_reg_details hd ON h.team_id = hd.team_id
      GROUP BY h.team_id, h.team_name, h.track, h.attended, h.created_at
      ORDER BY h.created_at DESC
    `)).rows;

    const demographicData = (await db.query(`
      SELECT
        hd.department,
        hd.year_of_study,
        hd.gender,
        COUNT(*)::int AS participant_count
      FROM hack_reg_details hd
      GROUP BY hd.department, hd.year_of_study, hd.gender
      ORDER BY participant_count DESC
    `)).rows;

    const summary = {
      total_teams: trackBreakdown.reduce((sum, t) => sum + t.team_count, 0),
      total_attended: trackBreakdown.reduce((sum, t) => sum + t.attended_teams, 0),
      total_participants: teamDetails.reduce((sum, t) => sum + t.team_size, 0)
    };

    res.json({
      summary,
      track_breakdown: trackBreakdown,
      team_details: teamDetails,
      demographics: demographicData
    });
  } catch (err) {
    console.error('Hackathon analytics error:', err);
    res.status(500).json({ error: 'server error' });
  }
});

module.exports = router;
