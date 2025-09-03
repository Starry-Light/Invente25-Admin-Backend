// paymentAuth.js - HMAC signature authentication for payment service
const crypto = require('crypto');

/**
 * Generate HMAC signature for payment service authentication
 * @param {string} timestamp - Current timestamp in ISO format
 * @param {string} secretKey - Secret key from environment
 * @returns {string} HMAC SHA256 signature
 */
function generatePaymentSignature(timestamp, secretKey) {
  return crypto.createHmac('sha256', secretKey).update(timestamp).digest('hex');
}

/**
 * Create authenticated headers for payment service requests
 * @param {string} secretKey - Secret key from environment
 * @returns {object} Headers object with X-Timestamp and X-Signature
 */
function createPaymentHeaders(secretKey) {
  const timestamp = new Date().toISOString();
  const signature = generatePaymentSignature(timestamp, secretKey);
  
  return {
    'X-Timestamp': timestamp,
    'X-Signature': signature,
    'Content-Type': 'application/json'
  };
}

module.exports = {
  generatePaymentSignature,
  createPaymentHeaders
};
