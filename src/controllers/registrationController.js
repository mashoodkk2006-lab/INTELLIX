const { query } = require('../config/db');
const { generateRegistrationCode } = require('../utils/idGenerator');
const { generateQRDataURL } = require('../services/qrService');

async function register(req, res) {
  try {
    const {
      event_id,
      full_name,
      register_number,
      department,
      semester,
      email,
      phone,
      team_name,
      team_members,
      transaction_id,
      payment_screenshot_url,
      custom_data
    } = req.body;

    if (!event_id || !full_name || !register_number || !department || !semester || !email || !phone) {
      return res.status(400).json({
        success: false,
        message: 'Please provide all mandatory participant details (Name, Register No, Department, Semester, Email, Phone).'
      });
    }

    // 1. Fetch Event and check conditions
    const [events] = await query('SELECT * FROM events WHERE id = ?', [event_id]);
    if (!events || events.length === 0) {
      return res.status(404).json({ success: false, message: 'The requested event does not exist.' });
    }

    const event = events[0];

    if (event.status !== 'published') {
      return res.status(400).json({ success: false, message: 'Registrations are not active for this event.' });
    }

    if (event.registration_open !== 1 && event.registration_open !== true) {
      return res.status(400).json({ success: false, message: 'Registration for this event has been closed by the coordinator.' });
    }

    const now = new Date();
    const deadline = new Date(event.registration_deadline);
    if (now > deadline) {
      return res.status(400).json({ success: false, message: 'Registration deadline for this event has already passed.' });
    }

    // Team validation if event participation_type is 'team'
    let storedTeamName = null;
    let storedTeamMembers = null;

    if (event.participation_type === 'team') {
      if (!team_name || !String(team_name).trim()) {
        return res.status(400).json({
          success: false,
          message: 'Team Name is required for this team event.'
        });
      }
      storedTeamName = String(team_name).trim();

      let parsedMembersList = [];
      if (Array.isArray(team_members)) {
        parsedMembersList = team_members.filter(m => m && (typeof m === 'string' ? m.trim() : (m.name || m.full_name)));
      } else if (typeof team_members === 'string' && team_members.trim()) {
        try {
          const parsed = JSON.parse(team_members);
          if (Array.isArray(parsed)) {
            parsedMembersList = parsed.filter(m => m && (typeof m === 'string' ? m.trim() : (m.name || m.full_name)));
          } else {
            parsedMembersList = team_members.split('\n').map(s => s.trim()).filter(Boolean);
          }
        } catch {
          parsedMembersList = team_members.split('\n').map(s => s.trim()).filter(Boolean);
        }
      }

      const minAllowed = parseInt(event.min_team_members, 10) || 2;
      const maxAllowed = parseInt(event.max_team_members, 10) || 4;
      const totalTeamCount = 1 + parsedMembersList.length; // Team leader + members

      if (totalTeamCount < minAllowed) {
        return res.status(400).json({
          success: false,
          message: `This event requires at least ${minAllowed} team members (including team leader). You provided ${totalTeamCount} members.`
        });
      }

      if (totalTeamCount > maxAllowed) {
        return res.status(400).json({
          success: false,
          message: `Maximum allowed team members for this event is ${maxAllowed} (including team leader). You entered ${totalTeamCount} members.`
        });
      }

      storedTeamMembers = JSON.stringify(parsedMembersList);
    }

    // 2. Check seat capacity
    const [countRows] = await query('SELECT COUNT(*) as count FROM event_registrations WHERE event_id = ?', [event_id]);
    const currentCount = countRows[0].count || countRows[0]['COUNT(*)'] || 0;
    if (currentCount >= event.max_participants) {
      return res.status(400).json({ success: false, message: 'This event has reached its maximum seat capacity.' });
    }

    // 2b. Payment validation (if payment_required)
    const isPaymentRequired = event.payment_required === 1 || event.payment_required === true;
    if (isPaymentRequired) {
      if (!transaction_id || !String(transaction_id).trim()) {
        return res.status(400).json({
          success: false,
          message: 'Payment is required for this event. Please provide your Transaction ID / UTR Number.'
        });
      }
    }

    // 3. Duplicate check (prevent duplicate register_number or email for this event)
    const [existing] = await query(
      'SELECT id, registration_code FROM event_registrations WHERE event_id = ? AND (register_number = ? OR email = ?)',
      [event_id, register_number.trim(), email.trim()]
    );

    if (existing.length > 0) {
      return res.status(409).json({
        success: false,
        message: `A registration with Register Number "${register_number}" or Email "${email}" already exists for this event (${existing[0].registration_code}).`
      });
    }

    // 4. Validate custom fields defined for this event
    const [formFields] = await query(
      'SELECT * FROM event_form_fields WHERE event_id = ? ORDER BY display_order ASC',
      [event_id]
    );

    let parsedCustomData = {};
    if (custom_data) {
      parsedCustomData = typeof custom_data === 'string' ? JSON.parse(custom_data) : custom_data;
    }

    for (const field of formFields) {
      if (field.is_required === 1 || field.is_required === true) {
        const value = parsedCustomData[field.field_name];
        if (value === undefined || value === null || String(value).trim() === '') {
          return res.status(400).json({
            success: false,
            message: `Required field missing: "${field.field_label}"`
          });
        }
      }
    }

    // 5. Generate unique Registration ID
    const registrationCode = await generateRegistrationCode(event.code);

    // 6. Generate QR Code
    const qrDataText = `REG:${registrationCode}|${event.code}|${register_number.trim()}`;
    const qrCodeDataUrl = await generateQRDataURL(qrDataText);

    // 7. Insert into event_registrations
    const [regResult] = await query(
      `INSERT INTO event_registrations 
       (registration_code, event_id, full_name, register_number, department, semester, email, phone, team_name, team_members, transaction_id, payment_screenshot_url, payment_status, qr_code_data)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        registrationCode,
        event_id,
        full_name.trim(),
        register_number.trim(),
        department.trim(),
        semester.trim(),
        email.trim().toLowerCase(),
        phone.trim(),
        storedTeamName,
        storedTeamMembers,
        isPaymentRequired ? (transaction_id ? String(transaction_id).trim() : null) : null,
        isPaymentRequired ? (payment_screenshot_url || null) : null,
        isPaymentRequired ? 'pending' : 'unpaid',
        qrDataText
      ]
    );

    const registrationId = regResult.insertId;

    // 8. Insert dynamic field values
    for (const field of formFields) {
      const val = parsedCustomData[field.field_name];
      if (val !== undefined && val !== null) {
        const stringVal = Array.isArray(val) ? val.join(', ') : String(val);
        await query(
          `INSERT INTO registration_field_values (registration_id, field_id, field_value)
           VALUES (?, ?, ?)`,
          [registrationId, field.id, stringVal]
        );
      }
    }

    // 9. Initialize attendance record
    await query(
      `INSERT INTO attendance (registration_id, event_id, status)
       VALUES (?, ?, 'unmarked')`,
      [registrationId, event_id]
    );

    return res.status(201).json({
      success: true,
      message: event.confirmation_message || 'Registration completed successfully!',
      registration: {
        id: registrationId,
        registration_code: registrationCode,
        event_id: event.id,
        event_title: event.title,
        event_date: event.start_datetime,
        event_venue: event.venue,
        full_name: full_name.trim(),
        register_number: register_number.trim(),
        department: department.trim(),
        semester: semester.trim(),
        email: email.trim().toLowerCase(),
        phone: phone.trim(),
        team_name: storedTeamName,
        team_members: storedTeamMembers,
        payment_required: isPaymentRequired ? 1 : 0,
        payment_status: isPaymentRequired ? 'pending' : 'unpaid',
        transaction_id: isPaymentRequired ? (transaction_id ? String(transaction_id).trim() : null) : null,
        qr_code: qrCodeDataUrl,
        registered_at: new Date().toISOString()
      }
    });
  } catch (err) {
    console.error('[RegistrationController Error]', err);
    return res.status(500).json({ success: false, message: 'Failed to process registration: ' + err.message });
  }
}

async function getRegistrationsByEvent(req, res) {
  const { eventId } = req.params;
  const { search, attendance_status } = req.query;

  try {
    let sql = `
      SELECT 
        er.id, er.registration_code, er.event_id, er.full_name, er.register_number,
        er.department, er.semester, er.email, er.phone, er.team_name, er.team_members, er.created_at,
        er.transaction_id, er.payment_screenshot_url, er.payment_status,
        COALESCE(att.status, 'unmarked') as attendance_status,
        att.marked_at,
        cert.certificate_code,
        cert.id as certificate_id
      FROM event_registrations er
      LEFT JOIN attendance att ON er.id = att.registration_id
      LEFT JOIN certificates cert ON er.id = cert.registration_id
      WHERE er.event_id = ?
    `;
    const params = [eventId];

    if (search) {
      sql += ` AND (er.full_name LIKE ? OR er.register_number LIKE ? OR er.registration_code LIKE ? OR er.email LIKE ?)`;
      const p = `%${search}%`;
      params.push(p, p, p, p);
    }

    if (attendance_status) {
      sql += ` AND COALESCE(att.status, 'unmarked') = ?`;
      params.push(attendance_status);
    }

    sql += ` ORDER BY er.id DESC`;

    const [registrations] = await query(sql, params);

    // Fetch custom field values for these registrations
    const [fields] = await query(
      'SELECT id, field_name, field_label FROM event_form_fields WHERE event_id = ? ORDER BY display_order ASC',
      [eventId]
    );

    const [values] = await query(
      `SELECT rfv.registration_id, rfv.field_id, rfv.field_value, eff.field_name, eff.field_label
       FROM registration_field_values rfv
       JOIN event_form_fields eff ON rfv.field_id = eff.id
       WHERE eff.event_id = ?`,
      [eventId]
    );

    const valuesByRegId = {};
    for (const v of values) {
      if (!valuesByRegId[v.registration_id]) {
        valuesByRegId[v.registration_id] = {};
      }
      valuesByRegId[v.registration_id][v.field_name] = {
        label: v.field_label,
        value: v.field_value
      };
    }

    const enriched = registrations.map(reg => ({
      ...reg,
      custom_fields: valuesByRegId[reg.id] || {}
    }));

    return res.json({
      success: true,
      fields,
      total: enriched.length,
      registrations: enriched
    });
  } catch (err) {
    console.error('[GetRegistrations Error]', err);
    return res.status(500).json({ success: false, message: 'Failed to retrieve registrations' });
  }
}

async function exportRegistrationsCSV(req, res) {
  const { eventId } = req.params;
  try {
    const [events] = await query('SELECT title, code FROM events WHERE id = ?', [eventId]);
    if (!events || events.length === 0) {
      return res.status(404).send('Event not found');
    }

    const event = events[0];
    const [registrations] = await query(
      `SELECT 
        er.id, er.registration_code, er.full_name, er.register_number,
        er.department, er.semester, er.email, er.phone, er.team_name, er.team_members, er.created_at,
        er.transaction_id, er.payment_status,
        COALESCE(att.status, 'unmarked') as attendance,
        cert.certificate_code
      FROM event_registrations er
      LEFT JOIN attendance att ON er.id = att.registration_id
      LEFT JOIN certificates cert ON er.id = cert.registration_id
      WHERE er.event_id = ?
      ORDER BY er.id ASC`,
      [eventId]
    );

    // Fetch custom form field headers
    const [fields] = await query(
      'SELECT id, field_name, field_label FROM event_form_fields WHERE event_id = ? ORDER BY display_order ASC',
      [eventId]
    );

    const [values] = await query(
      `SELECT rfv.registration_id, rfv.field_id, rfv.field_value
       FROM registration_field_values rfv
       JOIN event_form_fields eff ON rfv.field_id = eff.id
       WHERE eff.event_id = ?`,
      [eventId]
    );

    const valuesMap = {};
    for (const v of values) {
      if (!valuesMap[v.registration_id]) valuesMap[v.registration_id] = {};
      valuesMap[v.registration_id][v.field_id] = v.field_value;
    }

    // Build CSV Headers
    const headers = [
      'Sl No',
      'Registration ID',
      'Full Name',
      'Register Number',
      'Department',
      'Semester',
      'Email',
      'Phone',
      ...fields.map(f => `"${f.field_label.replace(/"/g, '""')}"`),
      'Payment Status',
      'Transaction ID / UTR',
      'Attendance',
      'Certificate ID',
      'Registration Date'
    ];

    const rows = [headers.join(',')];

    registrations.forEach((reg, index) => {
      const customCols = fields.map(f => {
        const val = (valuesMap[reg.id] && valuesMap[reg.id][f.id]) || '';
        return `"${String(val).replace(/"/g, '""')}"`;
      });

      const row = [
        index + 1,
        `"${reg.registration_code}"`,
        `"${reg.full_name.replace(/"/g, '""')}"`,
        `"${reg.register_number}"`,
        `"${reg.department.replace(/"/g, '""')}"`,
        `"${reg.semester}"`,
        `"${reg.email}"`,
        `"${reg.phone}"`,
        ...customCols,
        `"${(reg.payment_status || 'N/A').toUpperCase()}"`,
        `"${reg.transaction_id || 'N/A'}"`,
        `"${reg.attendance.toUpperCase()}"`,
        `"${reg.certificate_code || 'N/A'}"`,
        `"${new Date(reg.created_at).toLocaleString()}"`
      ];

      rows.push(row.join(','));
    });

    const csvContent = rows.join('\r\n');
    const filename = `${event.code}_registrations_${Date.now()}.csv`;

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(csvContent);
  } catch (err) {
    console.error('[CSV Export Error]', err);
    return res.status(500).send('Error generating CSV export');
  }
}

async function deleteRegistration(req, res) {
  const { id } = req.params;
  try {
    await query('DELETE FROM event_registrations WHERE id = ?', [id]);
    return res.json({ success: true, message: 'Registration deleted successfully' });
  } catch (err) {
    console.error('[DeleteRegistration Error]', err);
    return res.status(500).json({ success: false, message: 'Failed to delete registration' });
  }
}

async function updatePaymentStatus(req, res) {
  const { id } = req.params;
  const { payment_status } = req.body;
  const validStatuses = ['pending', 'verified', 'rejected', 'unpaid'];
  if (!validStatuses.includes(payment_status)) {
    return res.status(400).json({ success: false, message: 'Invalid payment status' });
  }

  try {
    await query('UPDATE event_registrations SET payment_status = ? WHERE id = ?', [payment_status, id]);
    return res.json({ success: true, message: 'Payment status updated successfully' });
  } catch (err) {
    console.error('[UpdatePaymentStatus Error]', err);
    return res.status(500).json({ success: false, message: 'Failed to update payment status' });
  }
}

module.exports = {
  register,
  getRegistrationsByEvent,
  exportRegistrationsCSV,
  deleteRegistration,
  updatePaymentStatus
};
