const path = require('path');
const fs = require('fs');
const { query } = require('../config/db');
const { generateCertificateCode } = require('../utils/idGenerator');
const { generateCertificatePDF } = require('../services/certificateService');

async function generateSingleCertificate(req, res) {
  try {
    const {
      registration_id,
      recipient_name,
      recipient_register_number,
      member_index = 0,
      certificate_code,
      certificate_type = 'participation',
      custom_title,
      signatory_name,
      signatory_designation
    } = req.body;

    if (!registration_id) {
      return res.status(400).json({ success: false, message: 'Registration ID is required' });
    }

    // Fetch participant & event details
    const [rows] = await query(
      `SELECT 
        er.id as reg_id, er.full_name, er.register_number, er.email, er.team_name, er.team_members,
        e.id as event_id, e.title as event_title, e.start_datetime as event_date,
        e.cert_title, e.cert_signatory_name, e.cert_signatory_designation,
        COALESCE(att.status, 'unmarked') as attendance_status
       FROM event_registrations er
       JOIN events e ON er.event_id = e.id
       LEFT JOIN attendance att ON er.id = att.registration_id
       WHERE er.id = ?`,
      [registration_id]
    );

    if (!rows || rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Participant registration not found' });
    }

    const item = rows[0];

    // Auto-update attendance to present when certificate is issued
    if (item.attendance_status !== 'present') {
      await query('UPDATE attendance SET status = "present" WHERE registration_id = ?', [registration_id]);
    }

    // Determine target recipient name & register number
    const finalRecipientName = (recipient_name && String(recipient_name).trim()) || item.full_name;
    const finalRecipientReg = (recipient_register_number && String(recipient_register_number).trim()) || item.register_number;
    const mIdx = parseInt(member_index, 10) || 0;

    // Check if certificate already exists for this registration and member_index / name
    const [existingCerts] = await query(
      `SELECT * FROM certificates WHERE registration_id = ? AND (member_index = ? OR recipient_name = ?)`,
      [registration_id, mIdx, finalRecipientName]
    );

    let finalCertCode = certificate_code ? String(certificate_code).trim().toUpperCase() : null;

    if (finalCertCode) {
      // Validate uniqueness if user provided a custom code
      const existingId = existingCerts.length > 0 ? existingCerts[0].id : 0;
      const [dup] = await query(
        `SELECT id, certificate_code FROM certificates WHERE certificate_code = ? AND id != ?`,
        [finalCertCode, existingId]
      );
      if (dup.length > 0) {
        return res.status(409).json({
          success: false,
          message: `The Certificate Code "${finalCertCode}" is already in use by another certificate. Please provide a unique code.`
        });
      }
    } else {
      if (existingCerts.length > 0 && existingCerts[0].certificate_code) {
        finalCertCode = existingCerts[0].certificate_code;
      } else {
        finalCertCode = await generateCertificateCode();
      }
    }

    const hostUrl = `${req.protocol}://${req.get('host')}`;

    // Generate PDF
    const pdfResult = await generateCertificatePDF({
      certificateCode: finalCertCode,
      participantName: finalRecipientName,
      eventTitle: item.event_title,
      eventDate: item.event_date,
      certificateType: certificate_type || 'participation',
      certTitle: custom_title || item.cert_title || 'Certificate of Participation',
      signatoryName: signatory_name || item.cert_signatory_name || 'Dr. Eleanor Sterling',
      signatoryDesignation: signatory_designation || item.cert_signatory_designation || 'Head of Department',
      collegeName: process.env.COLLEGE_NAME || 'AL-AZHAR COLLEGE OF ENGINEERING AND TECHNOLOGY',
      associationName: process.env.ASSOCIATION_NAME || 'INTELLIX Association',
      hostUrl
    });

    const issueDate = new Date().toISOString().split('T')[0];

    if (existingCerts.length > 0) {
      const existingId = existingCerts[0].id;
      // If code changed, delete old file if present
      if (existingCerts[0].certificate_code !== finalCertCode) {
        const oldFile = path.join(__dirname, '../../uploads/certificates', `${existingCerts[0].certificate_code}.pdf`);
        if (fs.existsSync(oldFile)) {
          try { fs.unlinkSync(oldFile); } catch (e) {}
        }
      }

      await query(
        `UPDATE certificates SET 
          certificate_code = ?,
          recipient_name = ?,
          recipient_register_number = ?,
          member_index = ?,
          certificate_type = ?,
          title = ?,
          issue_date = ?,
          pdf_path = ?,
          qr_code_data = ?
         WHERE id = ?`,
        [
          finalCertCode,
          finalRecipientName,
          finalRecipientReg,
          mIdx,
          certificate_type || 'participation',
          custom_title || item.cert_title || 'Certificate of Participation',
          issueDate,
          pdfResult.relativeUrl,
          `CERT:${finalCertCode}`,
          existingId
        ]
      );
    } else {
      await query(
        `INSERT INTO certificates 
         (certificate_code, registration_id, recipient_name, recipient_register_number, member_index, event_id, certificate_type, title, issue_date, pdf_path, qr_code_data)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          finalCertCode,
          registration_id,
          finalRecipientName,
          finalRecipientReg,
          mIdx,
          item.event_id,
          certificate_type || 'participation',
          custom_title || item.cert_title || 'Certificate of Participation',
          issueDate,
          pdfResult.relativeUrl,
          `CERT:${finalCertCode}`
        ]
      );
    }

    return res.json({
      success: true,
      message: `Certificate issued successfully for ${finalRecipientName} (${finalCertCode})`,
      certificate: {
        certificate_code: finalCertCode,
        recipient_name: finalRecipientName,
        recipient_register_number: finalRecipientReg,
        download_url: `/api/certificates/download/${finalCertCode}`
      }
    });
  } catch (err) {
    console.error('[Certificate Generation Error]', err);
    return res.status(500).json({ success: false, message: 'Failed to generate certificate: ' + err.message });
  }
}

async function bulkGenerateForEvent(req, res) {
  const { eventId } = req.params;
  const { code_prefix, certificate_type = 'participation', custom_title } = req.body || {};
  try {
    const [events] = await query('SELECT * FROM events WHERE id = ?', [eventId]);
    if (!events || events.length === 0) {
      return res.status(404).json({ success: false, message: 'Event not found' });
    }
    const event = events[0];

    // Find all present registrations
    const [registrations] = await query(
      `SELECT er.*, COALESCE(att.status, 'unmarked') as attendance_status
       FROM event_registrations er
       JOIN attendance att ON er.id = att.registration_id
       WHERE er.event_id = ? AND att.status = 'present'`,
      [eventId]
    );

    if (registrations.length === 0) {
      return res.json({
        success: true,
        message: 'No participants marked as Present were found for this event.',
        generated_count: 0
      });
    }

    // Fetch existing certificates for this event
    const [existingCerts] = await query('SELECT * FROM certificates WHERE event_id = ?', [eventId]);
    const certsMap = {};
    for (const c of existingCerts) {
      certsMap[`${c.registration_id}_idx_${c.member_index || 0}`] = c;
      if (c.recipient_name) {
        certsMap[`${c.registration_id}_name_${c.recipient_name.trim().toLowerCase()}`] = c;
      }
    }

    const hostUrl = `${req.protocol}://${req.get('host')}`;
    let count = 0;
    const year = new Date().getFullYear();

    // Prepare list of individuals needing certificates
    const individuals = [];
    for (const reg of registrations) {
      // 1. Leader / Individual participant
      if (!certsMap[`${reg.id}_idx_0`] && !certsMap[`${reg.id}_name_${reg.full_name.trim().toLowerCase()}`]) {
        individuals.push({
          registration_id: reg.id,
          recipient_name: reg.full_name,
          recipient_register_number: reg.register_number,
          member_index: 0
        });
      }

      // 2. Additional team members
      if (reg.team_members) {
        let members = [];
        try {
          const parsed = typeof reg.team_members === 'string' ? JSON.parse(reg.team_members) : reg.team_members;
          if (Array.isArray(parsed)) {
            members = parsed;
          } else if (typeof reg.team_members === 'string') {
            members = reg.team_members.split(/\r?\n/).map(s => s.trim()).filter(Boolean).map(s => ({ name: s, identifier: '' }));
          }
        } catch {
          members = String(reg.team_members).split(/\r?\n/).map(s => s.trim()).filter(Boolean).map(s => ({ name: s, identifier: '' }));
        }

        members.forEach((m, idx) => {
          const mName = typeof m === 'string' ? m.trim() : (m.name || m.full_name || '').trim();
          const mReg = typeof m === 'string' ? '' : (m.identifier || m.register_number || '').trim();
          const mIdx = idx + 1;
          if (mName && !certsMap[`${reg.id}_idx_${mIdx}`] && !certsMap[`${reg.id}_name_${mName.toLowerCase()}`]) {
            individuals.push({
              registration_id: reg.id,
              recipient_name: mName,
              recipient_register_number: mReg || reg.register_number,
              member_index: mIdx
            });
          }
        });
      }
    }

    if (individuals.length === 0) {
      return res.json({
        success: true,
        message: 'All present participants and team members already have certificates generated.',
        generated_count: 0
      });
    }

    for (const ind of individuals) {
      let certificateCode;
      if (code_prefix && String(code_prefix).trim()) {
        const cleanPref = String(code_prefix).trim().toUpperCase();
        const [pRows] = await query('SELECT certificate_code FROM certificates WHERE certificate_code LIKE ? ORDER BY id DESC LIMIT 1', [`${cleanPref}%`]);
        let nextNum = 1;
        if (pRows.length > 0) {
          const parts = pRows[0].certificate_code.split('-');
          const lastNum = parseInt(parts[parts.length - 1], 10);
          if (!isNaN(lastNum)) nextNum = lastNum + 1;
        }
        certificateCode = `${cleanPref}${String(nextNum).padStart(4, '0')}`;
      } else {
        certificateCode = await generateCertificateCode(year);
      }

      const pdfResult = await generateCertificatePDF({
        certificateCode,
        participantName: ind.recipient_name,
        eventTitle: event.title,
        eventDate: event.start_datetime,
        certificateType: certificate_type || 'participation',
        certTitle: custom_title || event.cert_title || 'Certificate of Participation',
        signatoryName: event.cert_signatory_name || 'Dr. Eleanor Sterling',
        signatoryDesignation: event.cert_signatory_designation || 'Head of Department',
        collegeName: process.env.COLLEGE_NAME || 'AL-AZHAR COLLEGE OF ENGINEERING AND TECHNOLOGY',
        associationName: process.env.ASSOCIATION_NAME || 'INTELLIX Association',
        hostUrl
      });

      const issueDate = new Date().toISOString().split('T')[0];

      await query(
        `INSERT INTO certificates 
         (certificate_code, registration_id, recipient_name, recipient_register_number, member_index, event_id, certificate_type, title, issue_date, pdf_path, qr_code_data)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          certificateCode,
          ind.registration_id,
          ind.recipient_name,
          ind.recipient_register_number,
          ind.member_index,
          eventId,
          certificate_type || 'participation',
          custom_title || event.cert_title || 'Certificate of Participation',
          issueDate,
          pdfResult.relativeUrl,
          `CERT:${certificateCode}`
        ]
      );
      count++;
    }

    return res.json({
      success: true,
      message: `Successfully generated ${count} individual certificates for all present participants & team members.`,
      generated_count: count
    });
  } catch (err) {
    console.error('[Bulk Certificate Error]', err);
    return res.status(500).json({ success: false, message: 'Failed to bulk generate certificates: ' + err.message });
  }
}

async function getCertificatesByEvent(req, res) {
  const { eventId } = req.params;
  try {
    const [rows] = await query(
      `SELECT 
        c.id, c.certificate_code, c.certificate_type, c.title, c.issue_date, c.pdf_path,
        c.recipient_name, c.recipient_register_number, c.member_index,
        er.full_name as reg_full_name, er.register_number as reg_number, er.department, er.team_name,
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
        participant_name: r.recipient_name || r.reg_full_name,
        participant_register_number: r.recipient_register_number || r.reg_number,
        download_url: `/api/certificates/download/${r.certificate_code}`
      }))
    });
  } catch (err) {
    console.error('[GetCertificates Error]', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch certificates' });
  }
}

async function deleteCertificate(req, res) {
  const { id } = req.params;
  try {
    const [rows] = await query('SELECT * FROM certificates WHERE id = ? OR certificate_code = ?', [id, id]);
    if (!rows || rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Certificate record not found' });
    }

    const cert = rows[0];

    // Remove PDF file if present
    const baseUploadDir = process.env.UPLOADS_DIR || path.join(__dirname, '../../uploads');
    const certDir = path.join(baseUploadDir, 'certificates');
    const filePath = path.join(certDir, `${cert.certificate_code}.pdf`);
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch (fErr) {
        console.warn('[DeleteCert] Could not unlink PDF:', fErr.message);
      }
    }

    await query('DELETE FROM certificates WHERE id = ?', [cert.id]);

    return res.json({
      success: true,
      message: `Certificate "${cert.certificate_code}" has been deleted successfully.`
    });
  } catch (err) {
    console.error('[DeleteCertificate Error]', err);
    return res.status(500).json({ success: false, message: 'Failed to delete certificate: ' + err.message });
  }
}

async function downloadCertificate(req, res) {
  const { code } = req.params;
  try {
    const cleanCode = code.trim().toUpperCase();
    const [certs] = await query(
      `SELECT c.*, er.full_name as reg_full_name, e.title as event_title, e.start_datetime as event_date,
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
    const participantName = cert.recipient_name || cert.reg_full_name;
    const baseUploadDir = process.env.UPLOADS_DIR || path.join(__dirname, '../../uploads');
    const certDir = path.join(baseUploadDir, 'certificates');
    const filePath = path.join(certDir, `${cleanCode}.pdf`);

    // Regenerate if file was cleared (e.g. server restart)
    if (!fs.existsSync(filePath)) {
      const hostUrl = `${req.protocol}://${req.get('host')}`;
      await generateCertificatePDF({
        certificateCode: cleanCode,
        participantName: participantName,
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
        c.recipient_name,
        er.full_name as reg_full_name,
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

    return res.json({
      success: true,
      valid: true,
      certificate: {
        code: cert.certificate_code,
        participant_name: cert.recipient_name || cert.reg_full_name,
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
  deleteCertificate,
  downloadCertificate,
  verifyCertificate
};
