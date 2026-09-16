const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const { generateQRBuffer } = require('./qrService');

async function generateCertificatePDF({
  certificateCode,
  participantName,
  eventTitle,
  eventDate,
  certificateType = 'participation',
  certTitle = 'Certificate of Participation',
  signatoryName = 'Dr. Eleanor Sterling',
  signatoryDesignation = 'HOD & Professor, INTELLIX',
  coordinatorName = 'Mashood',
  coordinatorDesignation = 'Student Coordinator',
  collegeName = 'AL-AZHAR COLLEGE OF ENGINEERING AND TECHNOLOGY',
  associationName = 'INTELLIX Association',
  hostUrl = 'http://localhost:3000'
}) {
  return new Promise(async (resolve, reject) => {
    try {
      const doc = new PDFDocument({
        layout: 'landscape',
        size: 'A4',
        margin: 40
      });

      const certDir = path.join(__dirname, '../../uploads/certificates');
      if (!fs.existsSync(certDir)) {
        fs.mkdirSync(certDir, { recursive: true });
      }

      const filePath = path.join(certDir, `${certificateCode}.pdf`);
      const writeStream = fs.createWriteStream(filePath);
      doc.pipe(writeStream);

      const width = doc.page.width;
      const height = doc.page.height;

      // 1. Decorative Borders (Monochrome Black & Silver Theme)
      doc.rect(20, 20, width - 40, height - 40)
         .lineWidth(3)
         .stroke('#111111');

      doc.rect(26, 26, width - 52, height - 52)
         .lineWidth(1)
         .stroke('#888888');

      // Corner accents
      const cornerSize = 25;
      // Top Left
      doc.polygon([26, 26], [26 + cornerSize, 26], [26, 26 + cornerSize]).fill('#111111');
      // Top Right
      doc.polygon([width - 26, 26], [width - 26 - cornerSize, 26], [width - 26, 26 + cornerSize]).fill('#111111');
      // Bottom Left
      doc.polygon([26, height - 26], [26 + cornerSize, height - 26], [26, height - 26 - cornerSize]).fill('#111111');
      // Bottom Right
      doc.polygon([width - 26, height - 26], [width - 26 - cornerSize, height - 26], [width - 26, height - 26 - cornerSize]).fill('#111111');

      // 2. Header
      doc.font('Helvetica-Bold')
         .fontSize(16)
         .fillColor('#111111')
         .text(collegeName.toUpperCase(), 0, 55, { align: 'center' });

      doc.font('Helvetica')
         .fontSize(12)
         .fillColor('#444444')
         .text(associationName, 0, 78, { align: 'center' });

      // Subtle divider line
      doc.moveTo(width / 2 - 120, 98)
         .lineTo(width / 2 + 120, 98)
         .lineWidth(1)
         .stroke('#cccccc');

      // 3. Certificate Main Heading
      doc.font('Helvetica-Bold')
         .fontSize(26)
         .fillColor('#0a0a0a')
         .text((certTitle || 'CERTIFICATE OF PARTICIPATION').toUpperCase(), 0, 120, { align: 'center', characterSpacing: 1.5 });

      doc.font('Helvetica-Oblique')
         .fontSize(13)
         .fillColor('#555555')
         .text('This is proudly presented to', 0, 160, { align: 'center' });

      // 4. Participant Name
      doc.font('Helvetica-Bold')
         .fontSize(28)
         .fillColor('#000000')
         .text(participantName, 0, 185, { align: 'center' });

      // Name underline
      const nameWidth = doc.widthOfString(participantName);
      const underlineStart = (width - Math.min(nameWidth + 60, width - 200)) / 2;
      const underlineEnd = underlineStart + Math.min(nameWidth + 60, width - 200);
      doc.moveTo(underlineStart, 220)
         .lineTo(underlineEnd, 220)
         .lineWidth(1.2)
         .stroke('#222222');

      // 5. Body Text
      let formattedDate = eventDate;
      try {
        formattedDate = new Date(eventDate).toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        });
      } catch (e) {}

      const typeLabel = certificateType === 'winner' ? 'outstanding achievement and securing the top position' :
                        certificateType === 'runner_up' ? 'outstanding performance as Runner-Up' :
                        'active and meritorious participation';

      const bodyText = `for ${typeLabel} in "${eventTitle}" conducted by the ${associationName} on ${formattedDate}.`;

      doc.font('Helvetica')
         .fontSize(12)
         .fillColor('#333333')
         .text(bodyText, 100, 245, {
           align: 'center',
           width: width - 200,
           lineGap: 6
         });

      // 6. Signatures & QR Code verification section
      const signY = height - 130;

      // Left Signatory (Student Coordinator)
      doc.moveTo(70, signY)
         .lineTo(230, signY)
         .lineWidth(1)
         .stroke('#555555');

      doc.font('Helvetica-Bold')
         .fontSize(11)
         .fillColor('#111111')
         .text(coordinatorName, 70, signY + 8, { width: 160, align: 'center' });

      doc.font('Helvetica')
         .fontSize(9)
         .fillColor('#666666')
         .text(coordinatorDesignation, 70, signY + 23, { width: 160, align: 'center' });

      // Right Signatory (HOD / Faculty Patron)
      doc.moveTo(width - 230, signY)
         .lineTo(width - 70, signY)
         .lineWidth(1)
         .stroke('#555555');

      doc.font('Helvetica-Bold')
         .fontSize(11)
         .fillColor('#111111')
         .text(signatoryName, width - 230, signY + 8, { width: 160, align: 'center' });

      doc.font('Helvetica')
         .fontSize(9)
         .fillColor('#666666')
         .text(signatoryDesignation, width - 230, signY + 23, { width: 160, align: 'center' });

      // Center Verification QR & Certificate ID
      const verifyUrl = `${hostUrl}/verify.html?id=${encodeURIComponent(certificateCode)}`;
      const qrBuffer = await generateQRBuffer(verifyUrl);

      if (qrBuffer) {
        const qrSize = 65;
        const qrX = (width - qrSize) / 2;
        const qrY = signY - 35;
        doc.image(qrBuffer, qrX, qrY, { width: qrSize, height: qrSize });

        doc.font('Helvetica-Bold')
           .fontSize(8)
           .fillColor('#111111')
           .text(`CERT ID: ${certificateCode}`, 0, qrY + qrSize + 5, { align: 'center' });

        doc.font('Helvetica')
           .fontSize(7)
           .fillColor('#777777')
           .text('Scan to verify authenticity online', 0, qrY + qrSize + 16, { align: 'center' });
      }

      doc.end();

      writeStream.on('finish', () => {
        resolve({
          filePath,
          relativeUrl: `/uploads/certificates/${certificateCode}.pdf`,
          certificateCode
        });
      });

      writeStream.on('error', (err) => {
        reject(err);
      });
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = {
  generateCertificatePDF
};
