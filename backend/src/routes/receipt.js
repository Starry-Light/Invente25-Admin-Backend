// routes/receipt.js
const express = require('express');
const multer = require('multer');
const axios = require('axios');
const { ImageAnnotatorClient } = require('@google-cloud/vision');
const { createPaymentHeaders } = require('../paymentAuth');

const router = express.Router();

// Memory storage; we don't persist files
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

// Accept either field name 'image' or 'receipt'
const fileFields = upload.any();

// Pre-compiled regex for payment ID
const PAYMENT_ID_REGEX = /pay_[A-Za-z0-9]{14,32}/; //maybe change to exactly length 14 later

// Initialize GCV client using local credentials.json if present or env default
let visionClient;
try {
  visionClient = new ImageAnnotatorClient({
    keyFilename: 'credentials.json'
  });
} catch (e) {
  // Fallback to default credentials (GOOGLE_APPLICATION_CREDENTIALS)
  visionClient = new ImageAnnotatorClient();
}

router.post('/receipt', fileFields, async (req, res) => {
  try {
    // Extract structured fields from multipart form-data
    const body = req.body || {};

    // If client sent JSON strings for complex fields, keep as-is; payment service expects JSON serializable
    // Extract file buffer
    const file = (req.files || []).find(f => f.fieldname === 'image' || f.fieldname === 'receipt');

    // If paymentID provided and valid, skip OCR
    if (body.paymentID && PAYMENT_ID_REGEX.test(body.paymentID)) {
      await forwardToPaymentService(body);
      return res.json({ success: true, paymentID: body.paymentID, forwarded: true });
    }

    if (!file) {
      return res.status(400).json({ error: 'image file is required (field: image or receipt)' });
    }

    // Only allow jpg/png
    const mime = (file.mimetype || '').toLowerCase();
    if (!(mime === 'image/jpeg' || mime === 'image/png')) {
      return res.status(400).json({ error: 'unsupported file type, only jpg and png are allowed' });
    }

    // Run OCR
    const [result] = await visionClient.textDetection({ image: { content: file.buffer } });
    const fullText = (result.fullTextAnnotation && result.fullTextAnnotation.text) || '';
    if (!fullText) {
      return res.status(400).json({ error: 'no text detected in image' });
    }

    const match = fullText.match(PAYMENT_ID_REGEX);
    if (!match) {
      return res.status(400).json({ error: 'payment_id not found in image' });
    }
    const paymentID = match[0];

    const payload = { ...body, paymentID };

    await forwardToPaymentService(payload);

    return res.json({ success: true, paymentID, forwarded: true });
  } catch (err) {
    console.error('POST /receipt error:', err);
    return res.status(500).json({ error: 'server error during receipt processing' });
  }
});

router.post('/hackathon-receipt', fileFields, async (req, res) => {
  try {
    // Extract all fields from multipart form-data (no specific structure expected)
    const body = req.body || {};

    // Extract file buffer
    const file = (req.files || []).find(f => f.fieldname === 'image' || f.fieldname === 'receipt');

    // If paymentID provided and valid, skip OCR
    if (body.paymentID && PAYMENT_ID_REGEX.test(body.paymentID)) {
      await forwardToHackathonPaymentService(body);
      return res.json({ success: true, paymentID: body.paymentID, forwarded: true });
    }

    if (!file) {
      return res.status(400).json({ error: 'image file is required (field: image or receipt)' });
    }

    // Only allow jpg/png
    const mime = (file.mimetype || '').toLowerCase();
    if (!(mime === 'image/jpeg' || mime === 'image/png')) {
      return res.status(400).json({ error: 'unsupported file type, only jpg and png are allowed' });
    }

    // Run OCR
    const [result] = await visionClient.textDetection({ image: { content: file.buffer } });
    const fullText = (result.fullTextAnnotation && result.fullTextAnnotation.text) || '';
    if (!fullText) {
      return res.status(400).json({ error: 'no text detected in image' });
    }

    const match = fullText.match(PAYMENT_ID_REGEX);
    if (!match) {
      return res.status(400).json({ error: 'payment_id not found in image' });
    }
    const paymentID = match[0];

    const payload = { ...body, paymentID };

    await forwardToHackathonPaymentService(payload);

    return res.json({ success: true, paymentID, forwarded: true });
  } catch (err) {
    console.error('POST /hackathon-receipt error:', err);
    return res.status(500).json({ error: 'server error during hackathon receipt processing' });
  }
});

async function forwardToPaymentService(payload) {
  // Ensure we do not forward file buffers; only JSON fields
  const paymentHeaders = createPaymentHeaders(process.env.PAYMENT_SERVICE_SECRET);

  // If eventBookingDetails is a string (from multipart), try to parse JSON
  let forwardBody = { ...payload };
  if (typeof forwardBody.eventBookingDetails === 'string') {
    try {
      forwardBody.eventBookingDetails = JSON.parse(forwardBody.eventBookingDetails);
    } catch (_) {
      // leave as-is; payment service may reject if malformed
    }
  }

  // createdAt: if provided as string, keep; if missing, set now
  if (!forwardBody.createdAt) {
    forwardBody.createdAt = new Date().toISOString();
  }

  await axios.post(process.env.PAYMENT_SERVICE_URL, forwardBody, { headers: paymentHeaders });
}

async function forwardToHackathonPaymentService(payload) {
  // Ensure we do not forward file buffers; only JSON fields
  const paymentHeaders = createPaymentHeaders(process.env.PAYMENT_SERVICE_SECRET);

  // Forward all fields as-is (no special processing for hackathon)
  const forwardBody = { ...payload };

  await axios.post(process.env.HACKATHON_PAYMENT_SERVICE_URL, forwardBody, { headers: paymentHeaders });
}

module.exports = router;


