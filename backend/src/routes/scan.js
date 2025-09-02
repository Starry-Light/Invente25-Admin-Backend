// routes/scan.js
const express = require('express');
const db = require('../db');
const {authMiddleware} = require('../auth');
const router = express.Router();

// Helper function to detect pass type from passId
function detectPassType(passId) {
  const upperPassId = passId.toUpperCase();
  if (upperPassId.endsWith('$t')) return 'technical';
  if (upperPassId.endsWith('$n')) return 'non-technical';
  if (upperPassId.endsWith('$w')) return 'workshop';
  if (upperPassId.endsWith('$h')) return 'hackathon';
  return 'technical'; // Default for backward compatibility
}

// scan endpoint — accept raw passId and return pass + slots (and event names)
router.get('/scan/:passId', authMiddleware, async (req, res) => {
  const { passId } = req.params;
  const passType = detectPassType(passId);

  try {
    if (passType === 'technical') {
      // Handle technical events (existing behavior)
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

      res.json({ 
        passType: 'technical',
        pass, 
        slots: slotsRes.rows 
      });

    } else if (passType === 'non-technical' || passType === 'workshop') {
      // Handle non-technical events and workshops
      const passRes = await db.query(
        'SELECT pass_id, user_email, payment_id, ticket_issued FROM passes WHERE pass_id=$1',
        [passId]
      );
      if (passRes.rows.length === 0) return res.status(404).json({ error: 'pass not found' });
      const pass = passRes.rows[0];

      // Get the single slot for this pass
      const slotsQuery = `
        SELECT s.slot_no, s.event_id, s.attended, e.name as event_name, e.department_id, e.event_type
        FROM slots s
        LEFT JOIN events e ON s.event_id = e.external_id
        WHERE s.pass_id = $1
      `;
      
      const slotsRes = await db.query(slotsQuery, [passId]);
      
      if (slotsRes.rows.length === 0) {
        return res.status(404).json({ error: 'no event found for this pass' });
      }

      const slot = slotsRes.rows[0];

      // Check department access for non-super-admins and non-central-volunteers
      if (req.user.role !== 'super_admin' && !(req.user.role === 'volunteer' && !req.user.department_id)) {
        if (slot.department_id !== req.user.department_id) {
          return res.status(403).json({ error: 'unauthorized to view this event' });
        }
      }

      res.json({ 
        passType,
        pass, 
        event: {
          slot_no: slot.slot_no,
          event_id: slot.event_id,
          event_name: slot.event_name,
          attended: slot.attended,
          event_type: slot.event_type
        }
      });

    } else if (passType === 'hackathon') {
      // Handle hackathon passes
      const hackPassRes = await db.query(
        'SELECT team_id, leader_email, team_name, track, payment_id, ticket_issued, attended FROM hackathon_passes WHERE team_id=$1',
        [passId]
      );
      if (hackPassRes.rows.length === 0) return res.status(404).json({ error: 'hackathon pass not found' });
      const hackPass = hackPassRes.rows[0];

      // Get all team members
      const teamMembersRes = await db.query(
        'SELECT email, full_name, institution, phone_number FROM hack_reg_details WHERE team_id=$1 ORDER BY email',
        [passId]
      );

      res.json({ 
        passType: 'hackathon',
        pass: hackPass, 
        teamMembers: teamMembersRes.rows
      });

    } else {
      return res.status(400).json({ error: 'invalid pass type' });
    }

  } catch (err) {
    console.error('GET /scan/:passId error', err);
    res.status(500).json({ error: 'server error' });
  }
});

// Assign event to a slot (only for technical events)
router.post('/scan/:passId/assign', authMiddleware, async (req, res) => {
  const { passId } = req.params;
  const { slot_no, event_id } = req.body;
  const passType = detectPassType(passId);

  // Only allow slot assignment for technical events
  if (passType !== 'technical') {
    return res.status(400).json({ error: 'slot assignment only allowed for technical events' });
  }

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
  const passType = detectPassType(passId);

  if (!(req.user.role === 'super_admin' || req.user.role === 'dept_admin' || req.user.role === 'event_admin' || (req.user.role === 'volunteer' && !req.user.department_id))) {
    return res.status(403).json({ error: 'unauthorized to mark attendance' });
  }

  try {
    if (passType === 'technical') {
      // Handle technical events (existing behavior)
      if (!slot_no) {
        return res.status(400).json({ error: 'slot_no is required for technical events' });
      }

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

    } else if (passType === 'non-technical' || passType === 'workshop') {
      // Handle non-technical events and workshops
      // First verify the pass exists
      const passRes = await db.query(
        'SELECT pass_id FROM passes WHERE pass_id=$1',
        [passId]
      );
      if (passRes.rows.length === 0) {
        return res.status(404).json({ error: 'pass not found' });
      }

      // Get the single slot for this pass
      const slotRes = await db.query(
        `SELECT s.slot_no, s.event_id, s.attended, e.department_id
         FROM slots s
         LEFT JOIN events e ON s.event_id = e.external_id
         WHERE s.pass_id = $1`,
        [passId]
      );

      if (slotRes.rows.length === 0) {
        return res.status(404).json({ error: 'no event found for this pass' });
      }

      const slot = slotRes.rows[0];

      // Check department access for non-super-admins and non-central-volunteers
      if (req.user.role !== 'super_admin' && !(req.user.role === 'volunteer' && !req.user.department_id)) {
        if (slot.department_id !== req.user.department_id) {
          return res.status(403).json({ error: 'unauthorized to mark attendance for this department' });
        }
      }

      // Update attendance
      const updateRes = await db.query(
        'UPDATE slots SET attended=true WHERE pass_id=$1 AND slot_no=$2 RETURNING *',
        [passId, slot.slot_no]
      );

      res.json({ message: 'attendance marked', slot: updateRes.rows[0] });

    } else if (passType === 'hackathon') {
      // Handle hackathon passes
      const hackPassRes = await db.query(
        'SELECT team_id FROM hackathon_passes WHERE team_id=$1',
        [passId]
      );
      if (hackPassRes.rows.length === 0) {
        return res.status(404).json({ error: 'hackathon pass not found' });
      }

      // Update attendance for hackathon
      const updateRes = await db.query(
        'UPDATE hackathon_passes SET attended=true WHERE team_id=$1 RETURNING *',
        [passId]
      );

      res.json({ message: 'hackathon attendance marked', pass: updateRes.rows[0] });

    } else {
      return res.status(400).json({ error: 'invalid pass type' });
    }

  } catch (err) {
    console.error('POST /scan/:passId/attend error', err);
    res.status(500).json({ error: 'server error' });
  }
});

// Delete a slot (only for technical events and only if not attended)
router.delete('/scan/:passId/slot/:slotNo', authMiddleware, async (req, res) => {
  const { passId, slotNo } = req.params;
  const passType = detectPassType(passId);

  // Only allow slot deletion for technical events
  if (passType !== 'technical') {
    return res.status(400).json({ error: 'slot deletion only allowed for technical events' });
  }

  if (!['super_admin', 'dept_admin', 'volunteer'].includes(req.user.role)) {
    return res.status(403).json({ error: 'unauthorized to delete slots' });
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

    // Check if slot exists and is not attended
    const slotCheck = await db.query(
      'SELECT slot_no, attended FROM slots WHERE pass_id=$1 AND slot_no=$2',
      [passId, slotNo]
    );

    if (slotCheck.rows.length === 0) {
      return res.status(404).json({ error: 'slot not found' });
    }

    if (slotCheck.rows[0].attended) {
      return res.status(400).json({ error: 'cannot delete attended slot' });
    }

    // Delete the slot
    const deleteRes = await db.query(
      'DELETE FROM slots WHERE pass_id=$1 AND slot_no=$2 RETURNING *',
      [passId, slotNo]
    );

    res.json({ message: 'slot deleted', slot: deleteRes.rows[0] });
  } catch (err) {
    console.error('DELETE /scan/:passId/slot/:slotNo error', err);
    res.status(500).json({ error: 'server error' });
  }
});

module.exports = router;
