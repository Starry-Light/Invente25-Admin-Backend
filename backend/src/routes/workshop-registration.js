// routes/workshop-registration.js
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { authMiddleware, requireRole } = require('../auth');
const axios = require('axios');
const { createPaymentHeaders } = require('../paymentAuth');

const router = express.Router();

router.post('/', 
  authMiddleware, 
  requireRole(['volunteer', 'dept_admin', 'super_admin']),
  async (req, res) => {
    const { emailID, name, phoneNumber, workshops } = req.body;

    // Basic validation
    if (!emailID || !name || !phoneNumber || !Array.isArray(workshops)) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Validate email format
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailID)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    // Validate workshops array is not empty
    if (workshops.length === 0) {
      return res.status(400).json({ error: 'At least one workshop must be selected' });
    }

    const client = await db.getClient();
    try {
      await client.query('BEGIN');

      // Get workshop department ID
      const workshopDeptRes = await client.query(
        'SELECT id FROM departments WHERE name = $1',
        ['WORKSHOP']
      );
      
      if (workshopDeptRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(500).json({ error: 'Workshop department not found' });
      }
      
      const workshopDeptId = workshopDeptRes.rows[0].id;

      // Validate that all workshop IDs exist and belong to WORKSHOP department
      // Also check department access permissions
      const workshopIds = workshops.map(w => w.workshop_id);
      const workshopValidationQuery = `
        SELECT external_id, department_id 
        FROM events 
        WHERE external_id = ANY($1) AND department_id = $2
      `;
      
      const validWorkshops = await client.query(workshopValidationQuery, [workshopIds, workshopDeptId]);
      
      if (validWorkshops.rows.length !== workshops.length) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'One or more invalid workshop IDs' });
      }

      // Check department access permissions
      if (req.user.role === 'dept_admin' || (req.user.role === 'volunteer' && req.user.department_id)) {
        // Department-specific roles can only register for workshops from their department
        // Since workshops are in WORKSHOP department, only central volunteers and super admins can register
        await client.query('ROLLBACK');
        return res.status(403).json({ error: 'Only central volunteers and super admins can register for workshops' });
      }

      const paymentID = uuidv4();
      const timestamp = new Date().toISOString();
      // Compute amount as sum of workshop costs from DB (fallback to env default if missing)
      const costsRes = await client.query(
        `SELECT external_id, cost FROM events WHERE external_id = ANY($1) AND event_type = 'workshop'`,
        [workshopIds]
      );

      if (costsRes.rows.length !== workshops.length) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'One or more workshops missing costs or invalid' });
      }

      const defaultWorkshop = Number(process.env.WORKSHOP_PRICE || 300);
      const totalAmount = costsRes.rows.reduce((sum, row) => sum + Number(row.cost ?? defaultWorkshop), 0);
      const amount = totalAmount.toFixed(2);

      // Prepare eventBookingDetails in the new format
      const eventBookingDetails = workshops.map(workshop => ({
        "1": workshop.workshop_id
      }));

      // Call payment service with workshop parameter and HMAC authentication
      const paymentHeaders = createPaymentHeaders(process.env.PAYMENT_SERVICE_SECRET);
      await axios.post(process.env.PAYMENT_SERVICE_URL, {
        emailID,
        name,
        paymentID,
        phoneNumber,
        createdAt: timestamp,
        eventBookingDetails,
        type: "workshop"
      }, {
        headers: paymentHeaders
      });

      // Call receipt service (same as cash registration)
      await axios.post(process.env.RECEIPT_SERVICE_URL, {
        emailID,
        paymentID,
        paidOn: timestamp,
        method: "Cash",
        amount,
        phoneNumber
      });

      await client.query('COMMIT');
      res.json({ 
        success: true, 
        paymentID,
        amount,
        workshopCount: workshops.length
      });

    } catch (err) {
      await client.query('ROLLBACK');
      console.error('Workshop registration error:', err);
      res.status(500).json({ 
        error: err.message === 'One or more invalid workshop IDs' 
          ? err.message 
          : 'Server error during workshop registration' 
      });
    } finally {
      client.release();
    }
  }
);

module.exports = router;
