const path = require('path');
const fs = require('fs');
const archiver = require('archiver');
const { query } = require('../config/db');
const { generateCertificateCode } = require('../utils/idGenerator');
const {
  generateCertificatePDF,
  generateCertificateRecordsPDF,
  getSafeDiskFilename,
  sanitizeForFilename
} = require('../services/certificateService');

function buildSequentialCertificateCode(prefix, num) {
  let cleanPrefix = String(prefix || '').trim();
  const numStr = String(num).padStart(3, '0');
  if (!cleanPrefix) {
    return `CERT-${numStr}`;
  }
  if (cleanPrefix.endsWith('/') || cleanPrefix.endsWith('-') || cleanPrefix.endsWith('_')) {
    return `${cleanPrefix}${numStr}`;
  }
  const sep = cleanPrefix.includes('/') ? '/' : (cleanPrefix.includes('-') ? '-' : '/');
  return `${cleanPrefix}${sep}${numStr}`;
}

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

    let finalCertCode = certificate_code ? String(certificate_code).trim() : null;

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
        const oldSafe = getSafeDiskFilename(existingCerts[0].certificate_code);
        const oldFile = path.join(__dirname, '../../uploads/certificates', `${oldSafe}.pdf`);
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
        download_url: `/api/certificates/download/${encodeURIComponent(finalCertCode)}`
      }
    });
  } catch (err) {
    console.error('[Certificate Generation Error]', err);
    return res.status(500).json({ success: false, message: 'Failed to generate certificate: ' + err.message });
  }
}

async function bulkGenerateForEvent(req, res) {
  const { eventId } = req.params;
  const {
    code_prefix,
    starting_number = 1,
    certificate_type = 'participation',
    custom_title,
    selected_participants = null
  } = req.body || {};

  try {
    const [events] = await query('SELECT * FROM events WHERE id = ?', [eventId]);
    if (!events || events.length === 0) {
      return res.status(404).json({ success: false, message: 'Event not found' });
    }
    const event = events[0];

    // Find registrations for this event
    const [registrations] = await query(
      `SELECT er.*, COALESCE(att.status, 'unmarked') as attendance_status
       FROM event_registrations er
       LEFT JOIN attendance att ON er.id = att.registration_id
       WHERE er.event_id = ?`,
      [eventId]
    );

    if (registrations.length === 0) {
      return res.json({
        success: true,
        message: 'No participant registrations found for this event.',
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

    // Build target individuals list
    const individuals = [];
    const isSelectedMode = Array.isArray(selected_participants) && selected_participants.length > 0;
    const selectedSet = new Set(
      isSelectedMode ? selected_participants.map(p => `${p.registration_id}_${p.member_index ?? 0}`) : []
    );

    for (const reg of registrations) {
      // 1. Leader / Individual participant
      const leaderKey = `${reg.id}_0`;
      const hasLeaderCert = !!(certsMap[`${reg.id}_idx_0`] || certsMap[`${reg.id}_name_${reg.full_name.trim().toLowerCase()}`]);

      if (isSelectedMode) {
        if (selectedSet.has(leaderKey) && !hasLeaderCert) {
          individuals.push({
            registration_id: reg.id,
            recipient_name: reg.full_name,
            recipient_register_number: reg.register_number,
            member_index: 0
          });
        }
      } else {
        // Default mode: all ungenerated participants
        if (!hasLeaderCert) {
          individuals.push({
            registration_id: reg.id,
            recipient_name: reg.full_name,
            recipient_register_number: reg.register_number,
            member_index: 0
          });
        }
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
          const memberKey = `${reg.id}_${mIdx}`;
          const hasMemberCert = !!(certsMap[`${reg.id}_idx_${mIdx}`] || certsMap[`${reg.id}_name_${mName.toLowerCase()}`]);

          if (mName && !hasMemberCert) {
            if (isSelectedMode) {
              if (selectedSet.has(memberKey)) {
                individuals.push({
                  registration_id: reg.id,
                  recipient_name: mName,
                  recipient_register_number: mReg || reg.register_number,
                  member_index: mIdx
                });
              }
            } else {
              individuals.push({
                registration_id: reg.id,
                recipient_name: mName,
                recipient_register_number: mReg || reg.register_number,
                member_index: mIdx
              });
            }
          }
        });
      }
    }

    if (individuals.length === 0) {
      return res.json({
        success: true,
        message: 'No pending participants require certificate generation in the current selection.',
        generated_count: 0
      });
    }

    const hostUrl = `${req.protocol}://${req.get('host')}`;
    const issueDate = new Date().toISOString().split('T')[0];
    const prefix = code_prefix && String(code_prefix).trim() ? String(code_prefix).trim() : 'CERT';

    let currentNum = Math.max(1, parseInt(starting_number, 10) || 1);
    let count = 0;
    const generatedList = [];

    for (const ind of individuals) {
      // Find the next available non-duplicate certificate code
      let candidateNum = currentNum;
      let candidateCode = buildSequentialCertificateCode(prefix, candidateNum);

      while (true) {
        const [existing] = await query('SELECT id FROM certificates WHERE certificate_code = ?', [candidateCode]);
        if (!existing || existing.length === 0) {
          break;
        }
        candidateNum++;
        candidateCode = buildSequentialCertificateCode(prefix, candidateNum);
      }

      currentNum = candidateNum + 1;
      const certificateCode = candidateCode;

      // Generate PDF file
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

      // Insert certificate
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

      // Auto update attendance to present
      try {
        await query(
          `INSERT INTO attendance (registration_id, event_id, status, marked_at) 
           VALUES (?, ?, 'present', CURRENT_TIMESTAMP)
           ON DUPLICATE KEY UPDATE status = 'present', marked_at = CURRENT_TIMESTAMP`,
          [ind.registration_id, eventId]
        );
      } catch (attErr) {
        // Fallback for sqlite
        try {
          await query(`UPDATE attendance SET status = 'present' WHERE registration_id = ?`, [ind.registration_id]);
        } catch (e2) {}
      }

      generatedList.push({
        certificate_code: certificateCode,
        recipient_name: ind.recipient_name,
        download_url: `/api/certificates/download/${encodeURIComponent(certificateCode)}`
      });

      count++;
    }

    const firstCode = generatedList.length > 0 ? generatedList[0].certificate_code : '';
    const lastCode = generatedList.length > 0 ? generatedList[generatedList.length - 1].certificate_code : '';

    return res.json({
      success: true,
      message: `✓ ${count} Certificates Generated Successfully`,
      generated_count: count,
      code_prefix: prefix,
      start_code: firstCode,
      end_code: lastCode,
      certificates: generatedList
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
        er.id as registration_id, er.registration_code, er.full_name as reg_full_name,
        er.register_number as reg_number, er.department, er.semester, er.team_name,
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
        download_url: `/api/certificates/download/${encodeURIComponent(r.certificate_code)}`
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
    const safeDiskName = getSafeDiskFilename(cert.certificate_code);
    const filePath = path.join(certDir, `${safeDiskName}.pdf`);
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
  try {
    const rawParam = req.params[0] || req.params.code || req.query.code;
    if (!rawParam) {
      return res.status(400).send('Certificate code is required');
    }

    const cleanCode = decodeURIComponent(rawParam).trim();

    const [certs] = await query(
      `SELECT c.*, er.full_name as reg_full_name, er.register_number as reg_number,
              e.title as event_title, e.start_datetime as event_date,
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
    const safeFileCode = getSafeDiskFilename(cleanCode);
    const filePath = path.join(certDir, `${safeFileCode}.pdf`);

    // Regenerate if file is missing
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

    const outputName = `${sanitizeForFilename(participantName)}_${safeFileCode}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${outputName}"`);
    const fileStream = fs.createReadStream(filePath);
    return fileStream.pipe(res);
  } catch (err) {
    console.error('[DownloadCertificate Error]', err);
    return res.status(500).send('Error retrieving certificate file: ' + err.message);
  }
}

async function downloadCertificatesZip(req, res) {
  const { eventId } = req.params;
  const { ids } = req.query;

  try {
    const [events] = await query('SELECT * FROM events WHERE id = ?', [eventId]);
    if (!events || events.length === 0) {
      return res.status(404).send('Event not found');
    }
    const event = events[0];

    let sql = `
      SELECT c.*, er.full_name as reg_full_name, er.register_number as reg_number,
             e.title as event_title, e.start_datetime as event_date,
             e.cert_signatory_name, e.cert_signatory_designation
      FROM certificates c
      JOIN event_registrations er ON c.registration_id = er.id
      JOIN events e ON c.event_id = e.id
      WHERE c.event_id = ?
    `;
    const params = [eventId];

    if (ids) {
      const idList = String(ids).split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n));
      if (idList.length > 0) {
        sql += ` AND c.id IN (${idList.map(() => '?').join(',')})`;
        params.push(...idList);
      }
    }

    sql += ` ORDER BY c.id ASC`;
    const [certs] = await query(sql, params);

    if (!certs || certs.length === 0) {
      return res.status(404).send('No certificates found to download');
    }

    const zipFilename = `${sanitizeForFilename(event.code || event.title)}_Certificates.zip`;
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${zipFilename}"`);

    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.pipe(res);

    const baseUploadDir = process.env.UPLOADS_DIR || path.join(__dirname, '../../uploads');
    const certDir = path.join(baseUploadDir, 'certificates');
    const hostUrl = `${req.protocol}://${req.get('host')}`;

    for (const cert of certs) {
      const participantName = cert.recipient_name || cert.reg_full_name;
      const safeFileCode = getSafeDiskFilename(cert.certificate_code);
      const filePath = path.join(certDir, `${safeFileCode}.pdf`);

      // Ensure PDF exists on disk
      if (!fs.existsSync(filePath)) {
        await generateCertificatePDF({
          certificateCode: cert.certificate_code,
          participantName,
          eventTitle: cert.event_title,
          eventDate: cert.event_date,
          certificateType: cert.certificate_type,
          certTitle: cert.title,
          signatoryName: cert.cert_signatory_name,
          signatoryDesignation: cert.cert_signatory_designation,
          collegeName: process.env.COLLENAME || 'AL-AZHAR COLLEGE OF ENGINEERING AND TECHNOLOGY',
          associationName: process.env.ASSOCIATION_NAME || 'INTELLIX Association',
          hostUrl
        });
      }

      const zipEntryName = `${sanitizeForFilename(participantName)}_${safeFileCode}.pdf`;
      archive.file(filePath, { name: zipEntryName });
    }

    await archive.finalize();
  } catch (err) {
    console.error('[Download ZIP Error]', err);
    if (!res.headersSent) {
      return res.status(500).send('Error generating certificates ZIP: ' + err.message);
    }
  }
}

/**
 * Export ONLY the 5 required fields:
 * Student Name, Class, Team Name, Register Number, Certificate Code
 */
async function exportCertificateData(req, res) {
  const { eventId } = req.params;
  const { format = 'csv', ids } = req.query;

  try {
    const [events] = await query('SELECT * FROM events WHERE id = ?', [eventId]);
    if (!events || events.length === 0) {
      return res.status(404).json({ success: false, message: 'Event not found' });
    }
    const event = events[0];

    let sql = `
      SELECT c.id, c.certificate_code, c.recipient_name, c.recipient_register_number, c.member_index,
             er.full_name as reg_full_name, er.register_number as reg_number,
             er.department, er.semester, er.team_name,
             e.title as event_title, e.start_datetime as event_date
      FROM certificates c
      JOIN event_registrations er ON c.registration_id = er.id
      JOIN events e ON c.event_id = e.id
      WHERE c.event_id = ?
    `;
    const params = [eventId];

    if (ids) {
      const idList = String(ids).split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n));
      if (idList.length > 0) {
        sql += ` AND c.id IN (${idList.map(() => '?').join(',')})`;
        params.push(...idList);
      }
    }

    sql += ` ORDER BY c.id ASC`;
    const [certs] = await query(sql, params);

    // Map strictly to the 5 specified fields
    const records = certs.map(c => {
      const studentName = c.recipient_name || c.reg_full_name || '—';
      const className = [c.semester, c.department].filter(Boolean).join(' ') || '—';
      const teamName = c.team_name || '—';
      const regNo = c.recipient_register_number || c.reg_number || '—';
      const certCode = c.certificate_code || '—';

      return {
        student_name: studentName,
        class_name: className,
        team_name: teamName,
        register_number: regNo,
        certificate_code: certCode
      };
    });

    const eventSlug = sanitizeForFilename(event.code || event.title);

    if (format === 'pdf') {
      const pdfBuffer = await generateCertificateRecordsPDF({
        eventTitle: event.title,
        eventDate: event.start_datetime,
        collegeName: process.env.COLLEGE_NAME || 'AL-AZHAR COLLEGE OF ENGINEERING AND TECHNOLOGY',
        associationName: process.env.ASSOCIATION_NAME || 'INTELLIX Association',
        records
      });

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${eventSlug}_Certificate_Records.pdf"`);
      return res.send(pdfBuffer);
    }

    // Default: CSV Export
    // Headers: Student Name,Class,Team Name,Register Number,Certificate Code
    const csvRows = [
      'Student Name,Class,Team Name,Register Number,Certificate Code'
    ];

    records.forEach(r => {
      const escapeCsv = val => {
        const str = String(val || '');
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      };

      csvRows.push([
        escapeCsv(r.student_name),
        escapeCsv(r.class_name),
        escapeCsv(r.team_name),
        escapeCsv(r.register_number),
        escapeCsv(r.certificate_code)
      ].join(','));
    });

    const csvContent = csvRows.join('\r\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${eventSlug}_Certificate_Data.csv"`);
    return res.send(csvContent);
  } catch (err) {
    console.error('[ExportCertificateData Error]', err);
    return res.status(500).json({ success: false, message: 'Export failed: ' + err.message });
  }
}

async function verifyCertificate(req, res) {
  const { code } = req.query;
  if (!code) {
    return res.status(400).json({ success: false, message: 'Certificate ID is required' });
  }

  try {
    const cleanCode = decodeURIComponent(String(code)).trim();
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
        download_url: `/api/certificates/download/${encodeURIComponent(cert.certificate_code)}`
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
  downloadCertificatesZip,
  exportCertificateData,
  verifyCertificate
};
