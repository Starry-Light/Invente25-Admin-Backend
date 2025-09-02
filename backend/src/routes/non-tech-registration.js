// routes/non-tech-registration.js
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { authMiddleware, requireRole } = require('../auth');
const axios = require('axios');

const router = express.Router();

router.post('/', 
  authMiddleware, 
  requireRole(['volunteer', 'dept_admin', 'super_admin']),
  async (req, res) => {
    const { emailID, name, phoneNumber, events } = req.body;

    // Basic validation
    if (!emailID || !name || !phoneNumber || !Array.isArray(events)) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Validate email format
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailID)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    // Validate events array is not empty
    if (events.length === 0) {
      return res.status(400).json({ error: 'At least one event must be selected' });
    }

    const client = await db.getClient();
    try {
      await client.query('BEGIN');

      // Validate that all event IDs exist and are non-technical events
      const eventIds = events.map(e => e.event_id);
      const eventValidationQuery = `
        SELECT external_id, department_id 
        FROM events 
        WHERE external_id = ANY($1) AND event_type = 'non-technical'
      `;
      
      const validEvents = await client.query(eventValidationQuery, [eventIds]);
      
      if (validEvents.rows.length !== events.length) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'One or more invalid non-technical event IDs' });
      }

      // Check department access permissions
      if (req.user.role === 'dept_admin' || (req.user.role === 'volunteer' && req.user.department_id)) {
        // Department-specific roles can only register for events from their department
        const userDeptId = req.user.department_id;
        const userDeptEvents = validEvents.rows.filter(event => event.department_id === userDeptId);
        
        if (userDeptEvents.length !== events.length) {
          await client.query('ROLLBACK');
          return res.status(403).json({ error: 'You can only register for non-technical events from your department' });
        }
      }

      const paymentId = uuidv4();
      const timestamp = new Date().toISOString();
      const amount = (events.length * 300).toFixed(2); // 300 per event

      // Prepare eventBookingDetails in the same format as workshops
      const eventBookingDetails = events.map(event => ({
        "1": event.event_id
      }));

      // Call payment service (no type parameter needed)
      await axios.post(process.env.PAYMENT_SERVICE_URL, {
        emailID,
        name,
        paymentId,
        phoneNumber,
        createdAt: timestamp,
        eventBookingDetails
      });

      // Call receipt service (same as cash registration)
      await axios.post(process.env.RECEIPT_SERVICE_URL, {
        emailID,
        paymentId,
        paidOn: timestamp,
        method: "Cash",
        amount,
        phoneNumber
      });

      await client.query('COMMIT');
      res.json({ 
        success: true, 
        paymentId,
        amount,
        eventCount: events.length
      });

    } catch (err) {
      await client.query('ROLLBACK');
      console.error('Non-tech registration error:', err);
      res.status(500).json({ 
        error: err.message === 'One or more invalid non-technical event IDs' 
          ? err.message 
          : 'Server error during non-tech registration' 
      });
    } finally {
      client.release();
    }
  }
);

module.exports = router;
