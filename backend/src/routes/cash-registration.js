// routes/cash-registration.js
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { authMiddleware, requireRole } = require('../auth');
const axios = require('axios');

const router = express.Router();

// Validate that all event IDs exist in our database
async function validateEvents(eventIds) {
  if (!eventIds.length) return true;
  
  const result = await db.query(
    'SELECT COUNT(*) as count FROM events WHERE external_id = ANY($1)',
    [eventIds]
  );
  return result.rows[0].count === eventIds.length;
}

router.post('/', 
  authMiddleware, 
  requireRole(['volunteer', 'dept_admin', 'super_admin']),
  async (req, res) => {
    const { emailID, name, phoneNumber, passes } = req.body;

    // Basic validation
    if (!emailID || !name || !phoneNumber || !Array.isArray(passes)) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Validate email format
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailID)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    // Extract all event IDs for validation
    const eventIds = passes.flatMap(pass => 
      Object.values(pass.slots || {})
    ).filter(id => id);

    const client = await db.getClient();
    try {
      await client.query('BEGIN');

      // Validate all event IDs exist
      if (eventIds.length && !(await validateEvents(eventIds))) {
        throw new Error('One or more invalid event IDs');
      }

      const paymentId = uuidv4();
      const timestamp = new Date().toISOString();
      const amount = (passes.length * 300).toFixed(2); // 300 per pass

      // Call payment service
      await axios.post(process.env.PAYMENT_SERVICE_URL, {
        emailID,
        name,
        paymentId,
        phoneNumber,
        createdAt: timestamp,
        eventBookingDetails: passes.map(p => p.slots || {})
      });

      // Call receipt service
      await axios.post(process.env.RECEIPT_SERVICE_URL, {
        emailID,
        paymentId,
        paidOn: timestamp,
        method: "Cash",
        amount,
        phoneNumber
      });

      // Create user if doesn't exist
      await client.query(
        'INSERT INTO users (email, name, phone) VALUES ($1, $2, $3) ON CONFLICT (email) DO UPDATE SET name = $2, phone = $3',
        [emailID, name, phoneNumber]
      );

      await client.query('COMMIT');
      res.json({ 
        success: true, 
        paymentId,
        amount
      });

    } catch (err) {
      await client.query('ROLLBACK');
      console.error('Cash registration error:', err);
      res.status(500).json({ 
        error: err.message === 'One or more invalid event IDs' 
          ? err.message 
          : 'Server error during registration' 
      });
    } finally {
      client.release();
    }
  }
);

module.exports = router;
