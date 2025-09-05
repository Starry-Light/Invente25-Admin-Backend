// routes/receipt.js
const express = require('express');
const multer = require('multer');
const axios = require('axios');
const { ImageAnnotatorClient } = require('@google-cloud/vision');
const { createPaymentHeaders } = require('../paymentAuth');
const db = require('../db');

const router = express.Router();

// Memory storage; we don't persist files
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

// Accept either field name 'image' or 'receipt'
const fileFields = upload.any();

// Track limits
const TRACK_LIMITS = {
  software: 30,
  hardware: 20
};

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

// GET endpoint to check hackathon track availability
router.get('/hackathon/availability', async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT track, COUNT(*) as count FROM hack_passes GROUP BY track'
    );
    
    const trackCounts = {};
    rows.forEach(row => {
      trackCounts[row.track] = parseInt(row.count);
    });
    
    const response = {};
    Object.keys(TRACK_LIMITS).forEach(track => {
      const count = trackCounts[track] || 0;
      const max = TRACK_LIMITS[track];
      response[track] = {
        available: count < max,
        count: count,
        max: max,
        remaining_count: max - count
      };
    });
    
    res.json(response);
  } catch (err) {
    console.error('GET /hackathon/availability error:', err);
    res.status(500).json({ error: 'server error checking track availability' });
  }
});
router.post('/receipt', fileFields, async (req, res) => {
  try {
    const body = req.body || {};
    const file = (req.files || []).find(f => f.fieldname === 'image' || f.fieldname === 'receipt');

    if (body.paymentID && PAYMENT_ID_REGEX.test(body.paymentID)) {
      await forwardToPaymentService(body);
      return res.json({ success: true, paymentID: body.paymentID, forwarded: true });
    }

    if (!file) {
      return res.status(400).json({ error: 'image file is required (field: image or receipt)' });
    }

    const mime = (file.mimetype || '').toLowerCase();
    if (!(mime === 'image/jpeg' || mime === 'image/png' || mime === 'application/pdf')) {
      return res.status(400).json({ error: 'unsupported file type, only jpg, png and pdf are allowed' });
    }
    
    // --- START: CORRECTED OCR LOGIC ---
    let fullText = '';
    
    if (mime === 'application/pdf') {
      console.log('Processing PDF with batchAnnotateFiles...');
      const request = {
        requests: [{
          inputConfig: { content: file.buffer, mimeType: 'application/pdf' },
          features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
        }],
      };
      const [result] = await visionClient.batchAnnotateFiles(request);
      const annotation = result.responses[0].responses[0].fullTextAnnotation;
      fullText = annotation ? annotation.text : '';
    } else {
      console.log('Processing Image with textDetection...');
      const [result] = await visionClient.textDetection({ image: { content: file.buffer } });
      const annotation = result.fullTextAnnotation;
      fullText = annotation ? annotation.text : '';
    }
    // --- END: CORRECTED OCR LOGIC ---
    
    if (!fullText) {
      return res.status(400).json({ error: 'no text detected in file' });
    }

    const match = fullText.match(PAYMENT_ID_REGEX);
    if (!match) {
      return res.status(400).json({ error: 'payment_id not found in file' });
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
      // Check track availability before forwarding to payment service
      if (body.track) {
        const track = body.track.split('$')[0].toLowerCase(); // Extract track from "Software$Hospitality$BedSys"
        if (track === 'software' || track === 'hardware') {
          const { rows } = await db.query(
            'SELECT COUNT(*) as count FROM hack_passes WHERE track = $1',
            [track]
          );
          const count = parseInt(rows[0].count);
          const max = TRACK_LIMITS[track];
          
          if (count >= max) {
            return res.status(400).json({ 
              error: `${track.charAt(0).toUpperCase() + track.slice(1)} track is full` 
            });
          }
        }
      }
      
      await forwardToHackathonPaymentService(body);
      return res.json({ success: true, paymentID: body.paymentID, forwarded: true });
    }

    if (!file) {
      return res.status(400).json({ error: 'image file is required (field: image or receipt)' });
    }

    // Allow jpg/png/pdf
    const mime = (file.mimetype || '').toLowerCase();
    if (!(mime === 'image/jpeg' || mime === 'image/png' || mime === 'application/pdf')) {
      return res.status(400).json({ error: 'unsupported file type, only jpg, png and pdf are allowed' });
    }

    // --- START: CORRECTED OCR LOGIC ---
    let fullText = '';
    
    if (mime === 'application/pdf') {
      const request = {
        requests: [{
          inputConfig: { content: file.buffer, mimeType: 'application/pdf' },
          features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
        }],
      };
      const [result] = await visionClient.batchAnnotateFiles(request);
      const annotation = result.responses[0].responses[0].fullTextAnnotation;
      fullText = annotation ? annotation.text : '';
    } else {
      const [result] = await visionClient.textDetection({ image: { content: file.buffer } });
      const annotation = result.fullTextAnnotation;
      fullText = annotation ? annotation.text : '';
    }
    // --- END: CORRECTED OCR LOGIC ---
    
    if (!fullText) {
      return res.status(400).json({ error: 'no text detected in file' });
    }

    const match = fullText.match(PAYMENT_ID_REGEX);
    if (!match) {
      return res.status(400).json({ error: 'payment_id not found in image' });
    }
    const paymentID = match[0];

    const payload = { ...body, paymentID };

    // Check track availability before forwarding to payment service
    if (payload.track) {
      const track = payload.track.split('$')[0].toLowerCase(); // Extract track from "Software$Hospitality$BedSys"
      if (track === 'software' || track === 'hardware') {
        const { rows } = await db.query(
          'SELECT COUNT(*) as count FROM hack_passes WHERE track = $1',
          [track]
        );
        const count = parseInt(rows[0].count);
        const max = TRACK_LIMITS[track];
        
        if (count >= max) {
          return res.status(400).json({ 
            error: `${track.charAt(0).toUpperCase() + track.slice(1)} track is full` 
          });
        }
      }
    }

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

  // Remove any file-related fields and ensure only JSON-serializable data
  const forwardBody = { ...payload };
  delete forwardBody.image;
  delete forwardBody.receipt;
  
  // If eventBookingDetails is a string (from multipart), try to parse JSON
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

  // Remove any file-related fields and ensure only JSON-serializable data
  const forwardBody = { ...payload };
  delete forwardBody.image;
  delete forwardBody.receipt;

  await axios.post(process.env.HACKATHON_PAYMENT_SERVICE_URL, forwardBody, { headers: paymentHeaders });
}

module.exports = router;


