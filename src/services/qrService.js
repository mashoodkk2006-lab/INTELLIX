const QRCode = require('qrcode');

async function generateQRDataURL(text) {
  try {
    return await QRCode.toDataURL(text, {
      errorCorrectionLevel: 'M',
      margin: 2,
      width: 200,
      color: {
        dark: '#000000',
        light: '#ffffff'
      }
    });
  } catch (err) {
    console.error('[QR Service] Error generating QR code:', err);
    return null;
  }
}

async function generateQRBuffer(text) {
  try {
    return await QRCode.toBuffer(text, {
      errorCorrectionLevel: 'M',
      margin: 1,
      width: 140,
      color: {
        dark: '#0a0a0a',
        light: '#ffffff'
      }
    });
  } catch (err) {
    console.error('[QR Service] Error generating QR buffer:', err);
    return null;
  }
}

module.exports = {
  generateQRDataURL,
  generateQRBuffer
};
