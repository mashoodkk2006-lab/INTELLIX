const { query } = require('../config/db');

async function generateRegistrationCode(eventCode) {
  const assocCode = process.env.ASSOCIATION_CODE || 'INTELLIX';
  const cleanEventCode = (eventCode || 'EVT').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const year = new Date().getFullYear();
  const prefix = `${assocCode}-${cleanEventCode}-${year}-`;

  // Find latest number for this pattern
  const [rows] = await query(
    `SELECT registration_code FROM event_registrations 
     WHERE registration_code LIKE ? 
     ORDER BY id DESC LIMIT 1`,
    [`${prefix}%`]
  );

  let nextNum = 1;
  if (rows && rows.length > 0) {
    const lastCode = rows[0].registration_code;
    const parts = lastCode.split('-');
    const lastNumStr = parts[parts.length - 1];
    const parsed = parseInt(lastNumStr, 10);
    if (!isNaN(parsed)) {
      nextNum = parsed + 1;
    }
  }

  const paddedNum = String(nextNum).padStart(4, '0');
  return `${prefix}${paddedNum}`;
}

async function generateCertificateCode(year = new Date().getFullYear()) {
  const assocCode = process.env.ASSOCIATION_CODE || 'INTELLIX';
  const prefix = `${assocCode}-CERT-${year}-`;

  const [rows] = await query(
    `SELECT certificate_code FROM certificates 
     WHERE certificate_code LIKE ? 
     ORDER BY id DESC LIMIT 1`,
    [`${prefix}%`]
  );

  let nextNum = 1;
  if (rows && rows.length > 0) {
    const lastCode = rows[0].certificate_code;
    const parts = lastCode.split('-');
    const lastNumStr = parts[parts.length - 1];
    const parsed = parseInt(lastNumStr, 10);
    if (!isNaN(parsed)) {
      nextNum = parsed + 1;
    }
  }

  const paddedNum = String(nextNum).padStart(4, '0');
  return `${prefix}${paddedNum}`;
}

module.exports = {
  generateRegistrationCode,
  generateCertificateCode
};
