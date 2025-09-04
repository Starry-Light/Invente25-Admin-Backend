// paymentAuth.js - HMAC signature authentication for payment service
const crypto = require('crypto');

/**
 * Generate HMAC signature for payment service authentication
 * @param {number} timestamp - Current Unix timestamp in seconds
 * @param {string} secretKey - Secret key from environment
 * @returns {string} HMAC SHA256 signature in Base64
 */
function generatePaymentSignature(timestamp, secretKey) {
  return crypto.createHmac('sha256', secretKey).update(timestamp.toString()).digest('base64');
}

/**
 * Create authenticated headers for payment service requests
 * @param {string} secretKey - Secret key from environment
 * @returns {object} Headers object with X-Timestamp and X-Signature
 */
function createPaymentHeaders(secretKey) {
  if (!secretKey) {
    throw new Error('PAYMENT_SERVICE_SECRET environment variable is required');
  }
  
  const timestamp = Math.floor(Date.now() / 1000); // Unix timestamp in seconds
  const signature = generatePaymentSignature(timestamp, secretKey);
  
  return {
    'X-Timestamp': timestamp.toString(),
    'X-Signature': signature,
    'Content-Type': 'application/json'
  };
}

module.exports = {
  generatePaymentSignature,
  createPaymentHeaders
};
