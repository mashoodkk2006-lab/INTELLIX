const path = require('path');
const fs = require('fs');
const { query } = require('../config/db');
const { generateCertificateCode } = require('../utils/idGenerator');
const { generateCertificatePDF } = require('../services/certificateService');

async function generateSingleCertificate(req, res) {
  try {
    const { registration_id, certificate_type, custom_title } = req.body;

    if (!registration_id) {
      return res.status(400).json({ success: false, message: 'Registration ID is required' });
    }

    // Fetch participant & event details
    const [rows] = await query(
      `SELECT 
        er.id as reg_id, er.full_name, er.register_number, er.email,
        e.id as event_id, e.title as event_title, e.start_datetime as event_date,
        e.cert_title, e.cert_signatory_name, e.cert_signatory_designation,
        COALESCE(att.status, 'unmarked') as attendance_status,
        cert.id as cert_id, cert.certificate_code, cert.pdf_path
       FROM event_registrations er
       JOIN events e ON er.event_id = e.id
       LEFT JOIN attendance att ON er.id = att.registration_id
       LEFT JOIN certificates cert ON er.id = cert.registration_id
       WHERE er.id = ?`,
      [registration_id]
    );

    if (!rows || rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Participant registration not found' });
    }

    const item = rows[0];

    // If attendance is absent, warn unless user explicitly overrides
    if (item.attendance_status !== 'present') {
      // Auto-update attendance to present when coordinator issues certificate
      await query('UPDATE attendance SET status = "present" WHERE registration_id = ?', [registration_id]);
    }

    let certificateCode = item.certificate_code;
    let isExisting = false;

    if (!certificateCode) {
      certificateCode = await generateCertificateCode();
    } else {
      isExisting = true;
    }

    const hostUrl = `${req.protocol}://${req.get('host')}`;

    // Generate PDF
    const pdfResult = await generateCertificatePDF({
      certificateCode,
      participantName: item.full_name,
      eventTitle: item.event_title,
      eventDate: item.event_date,
      certificateType: certificate_type || 'participation',
      certTitle: custom_title || item.cert_title || 'Certificate of Participation',
      signatoryName: item.cert_signatory_name || 'Dr. Eleanor Sterling',
      signatoryDesignation: item.cert_signatory_designation || 'HOD & Professor, INTELLIX',
      collegeName: process.env.COLLEGE_NAME || 'AL-AZHAR COLLEGE OF ENGINEERING AND TECHNOLOGY',
      associationName: process.env.ASSOCIATION_NAME || 'INTELLIX Association',
      hostUrl
    });

    const issueDate = new Date().toISOString().split('T')[0];

    if (isExisting) {
      await query(
        `UPDATE certificates SET 
          certificate_type = ?, title = ?, issue_date = ?, pdf_path = ?, qr_code_data = ?
         WHERE id = ?`,
        [
          certificate_type || 'participation',
          custom_title || item.cert_title,
          issueDate,
          pdfResult.relativeUrl,
          `CERT:${certificateCode}`,
          item.cert_id
        ]
      );
    } else {
      await query(
        `INSERT INTO certificates 
         (certificate_code, registration_id, event_id, certificate_type, title, issue_date, pdf_path, qr_code_data)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          certificateCode,
          registration_id,
          item.event_id,
          certificate_type || 'participation',
          custom_title || item.cert_title,
          issueDate,
          pdfResult.relativeUrl,
          `CERT:${certificateCode}`
        ]
      );
    }

    return res.json({
      success: true,
      message: 'Certificate generated successfully',
      certificate: {
        certificate_code: certificateCode,
        participant_name: item.full_name,
        download_url: `/api/certificates/download/${certificateCode}`
      }
    });
  } catch (err) {
    console.error('[Certificate Generation Error]', err);
    return res.status(500).json({ success: false, message: 'Failed to generate certificate: ' + err.message });
  }
}

async function bulkGenerateForEvent(req, res) {
  const { eventId } = req.params;
  try {
    // Find all participants marked as present who don't have a certificate yet
    const [attendees] = await query(
      `SELECT er.id as reg_id, er.full_name, e.id as event_id, e.title as event_title, e.start_datetime as event_date,
              e.cert_title, e.cert_signatory_name, e.cert_signatory_designation
       FROM event_registrations er
       JOIN events e ON er.event_id = e.id
       JOIN attendance att ON er.id = att.registration_id
       LEFT JOIN certificates cert ON er.id = cert.registration_id
       WHERE er.event_id = ? AND att.status = 'present' AND cert.id IS NULL`,
      [eventId]
    );

    if (attendees.length === 0) {
      return res.json({
        success: true,
        message: 'No new attendees requiring certificates found for this event.',
        generated_count: 0
      });
    }

    const hostUrl = `${req.protocol}://${req.get('host')}`;
    let count = 0;

    for (const attendee of attendees) {
      const certificateCode = await generateCertificateCode();
      const pdfResult = await generateCertificatePDF({
        certificateCode,
        participantName: attendee.full_name,
        eventTitle: attendee.event_title,
        eventDate: attendee.event_date,
        certificateType: 'participation',
        certTitle: attendee.cert_title || 'Certificate of Participation',
        signatoryName: attendee.cert_signatory_name,
        signatoryDesignation: attendee.cert_signatory_designation,
        collegeName: process.env.COLLEGE_NAME || 'AL-AZHAR COLLEGE OF ENGINEERING AND TECHNOLOGY',
        associationName: process.env.ASSOCIATION_NAME || 'INTELLIX Association',
        hostUrl
      });

      const issueDate = new Date().toISOString().split('T')[0];

      await query(
        `INSERT INTO certificates 
         (certificate_code, registration_id, event_id, certificate_type, title, issue_date, pdf_path, qr_code_data)
         VALUES (?, ?, ?, 'participation', ?, ?, ?, ?)`,
        [
          certificateCode,
          attendee.reg_id,
          attendee.event_id,
          attendee.cert_title || 'Certificate of Participation',
          issueDate,
          pdfResult.relativeUrl,
          `CERT:${certificateCode}`
        ]
      );
      count++;
    }

    return res.json({
      success: true,
      message: `Successfully generated ${count} certificates for present participants.`,
      generated_count: count
    });
  } catch (err) {
    console.error('[Bulk Certificate Error]', err);
    return res.status(500).json({ success: false, message: 'Failed to bulk generate certificates' });
  }
}

async function getCertificatesByEvent(req, res) {
  const { eventId } = req.params;
  try {
    const [rows] = await query(
      `SELECT 
        c.id, c.certificate_code, c.certificate_type, c.title, c.issue_date, c.pdf_path,
        er.full_name, er.register_number, er.department,
        e.title as event_title
       FROM certificates c
       JOIN event_registrations er ON c.registration_id = er.id
       JOIN events e ON c.event_id = e.id
       WHERE c.event_id = ?
       ORDER BY c.id DESC`,
      [eventId]
    );

    return res.json({
      success: true,
      certificates: rows.map(r => ({
        ...r,
        download_url: `/api/certificates/download/${r.certificate_code}`
      }))
    });
  } catch (err) {
    console.error('[GetCertificates Error]', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch certificates' });
  }
}

async function downloadCertificate(req, res) {
  const { code } = req.params;
  try {
    const cleanCode = code.trim().toUpperCase();
    const [certs] = await query(
      `SELECT c.*, er.full_name, e.title as event_title, e.start_datetime as event_date,
              e.cert_signatory_name, e.cert_signatory_designation
       FROM certificates c
       JOIN event_registrations er ON c.registration_id = er.id
       JOIN events e ON c.event_id = e.id
       WHERE c.certificate_code = ?`,
      [cleanCode]
    );

    if (!certs || certs.length === 0) {
      return res.status(404).send('Certificate not found');
    }

    const cert = certs[0];
    const certDir = path.join(__dirname, '../../uploads/certificates');
    const filePath = path.join(certDir, `${cleanCode}.pdf`);

    // Regenerate if file was cleared (e.g. Render ephemeral filesystem restart)
    if (!fs.existsSync(filePath)) {
      const hostUrl = `${req.protocol}://${req.get('host')}`;
      await generateCertificatePDF({
        certificateCode: cleanCode,
        participantName: cert.full_name,
        eventTitle: cert.event_title,
        eventDate: cert.event_date,
        certificateType: cert.certificate_type,
        certTitle: cert.title,
        signatoryName: cert.cert_signatory_name,
        signatoryDesignation: cert.cert_signatory_designation,
        collegeName: process.env.COLLEGE_NAME || 'AL-AZHAR COLLEGE OF ENGINEERING AND TECHNOLOGY',
        associationName: process.env.ASSOCIATION_NAME || 'INTELLIX Association',
        hostUrl
      });
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${cleanCode}.pdf"`);
    const fileStream = fs.createReadStream(filePath);
    return fileStream.pipe(res);
  } catch (err) {
    console.error('[DownloadCertificate Error]', err);
    return res.status(500).send('Error retrieving certificate file');
  }
}

async function verifyCertificate(req, res) {
  const { code } = req.query;
  if (!code) {
    return res.status(400).json({ success: false, message: 'Certificate ID is required' });
  }

  try {
    const cleanCode = code.trim().toUpperCase();
    const [rows] = await query(
      `SELECT 
        c.certificate_code, c.certificate_type, c.title as cert_title, c.issue_date,
        er.full_name as participant_name,
        e.title as event_title, e.start_datetime as event_date, e.venue as event_venue,
        e.cert_signatory_name as signatory_name, e.cert_signatory_designation as signatory_designation
       FROM certificates c
       JOIN event_registrations er ON c.registration_id = er.id
       JOIN events e ON c.event_id = e.id
       WHERE c.certificate_code = ?`,
      [cleanCode]
    );

    if (!rows || rows.length === 0) {
      return res.status(404).json({
        success: false,
        valid: false,
        message: 'Certificate not found. The provided Certificate ID does not match any authentic record in our database.'
      });
    }

    const cert = rows[0];

    // Format safe response - NO email or phone exposed!
    return res.json({
      success: true,
      valid: true,
      certificate: {
        code: cert.certificate_code,
        participant_name: cert.participant_name,
        event_title: cert.event_title,
        event_date: cert.event_date,
        certificate_type: cert.certificate_type,
        certificate_title: cert.cert_title,
        issue_date: cert.issue_date,
        signatory_name: cert.signatory_name,
        signatory_designation: cert.signatory_designation,
        download_url: `/api/certificates/download/${cert.certificate_code}`
      }
    });
  } catch (err) {
    console.error('[VerifyCertificate Error]', err);
    return res.status(500).json({ success: false, message: 'Server error verifying certificate' });
  }
}

module.exports = {
  generateSingleCertificate,
  bulkGenerateForEvent,
  getCertificatesByEvent,
  downloadCertificate,
  verifyCertificate
};
