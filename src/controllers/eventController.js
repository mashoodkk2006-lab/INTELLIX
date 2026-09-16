const { query } = require('../config/db');

// Helper to create URL-friendly slug
function slugify(text) {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w\-]+/g, '')
    .replace(/\-\-+/g, '-');
}

async function getAllEvents(req, res) {
  try {
    const { status, type, search } = req.query;
    let sql = `
      SELECT 
        e.*,
        COUNT(er.id) as registered_count
      FROM events e
      LEFT JOIN event_registrations er ON e.id = er.event_id
    `;
    const whereClauses = [];
    const params = [];

    if (status) {
      whereClauses.push('e.status = ?');
      params.push(status);
    }
    if (type) {
      whereClauses.push('e.event_type = ?');
      params.push(type);
    }
    if (search) {
      whereClauses.push('(e.title LIKE ? OR e.description LIKE ? OR e.venue LIKE ?)');
      const pattern = `%${search}%`;
      params.push(pattern, pattern, pattern);
    }

    if (whereClauses.length > 0) {
      sql += ' WHERE ' + whereClauses.join(' AND ');
    }

    sql += ' GROUP BY e.id ORDER BY e.start_datetime ASC';

    const [events] = await query(sql, params);

    // Compute live attributes
    const now = new Date();
    const enrichedEvents = events.map(evt => {
      const start = new Date(evt.start_datetime);
      const end = new Date(evt.end_datetime);
      const deadline = new Date(evt.registration_deadline);
      const registered = parseInt(evt.registered_count || 0, 10);
      const max = parseInt(evt.max_participants || 100, 10);
      const seatsAvailable = Math.max(0, max - registered);

      let timingState = 'upcoming';
      if (now > end || evt.status === 'completed') {
        timingState = 'past';
      } else if (now >= start && now <= end) {
        timingState = 'ongoing';
      }

      const isDeadlinePassed = now > deadline;
      const isFull = registered >= max;
      const canRegister = evt.registration_open === 1 && !isDeadlinePassed && !isFull && evt.status === 'published';

      return {
        ...evt,
        timing_state: timingState,
        seats_available: seatsAvailable,
        is_deadline_passed: isDeadlinePassed,
        is_full: isFull,
        can_register: canRegister
      };
    });

    return res.json({ success: true, events: enrichedEvents });
  } catch (err) {
    console.error('[EventController getAllEvents Error]', err);
    return res.status(500).json({ success: false, message: 'Failed to retrieve events' });
  }
}

async function getEventBySlugOrId(req, res) {
  const { identifier } = req.params;
  try {
    let sql = `
      SELECT e.*, COUNT(er.id) as registered_count
      FROM events e
      LEFT JOIN event_registrations er ON e.id = er.event_id
      WHERE (e.slug = ? OR e.id = ?)
      GROUP BY e.id
      LIMIT 1
    `;
    const [rows] = await query(sql, [identifier, identifier]);
    if (!rows || rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Event not found' });
    }

    const event = rows[0];

    // Fetch custom form fields configured for this event
    const [fields] = await query(
      `SELECT * FROM event_form_fields 
       WHERE event_id = ? 
       ORDER BY display_order ASC, id ASC`,
      [event.id]
    );

    const parsedFields = fields.map(f => ({
      ...f,
      options: f.options_json ? JSON.parse(f.options_json) : null
    }));

    const now = new Date();
    const registered = parseInt(event.registered_count || 0, 10);
    const max = parseInt(event.max_participants || 100, 10);
    const deadline = new Date(event.registration_deadline);
    const start = new Date(event.start_datetime);
    const end = new Date(event.end_datetime);

    const isDeadlinePassed = now > deadline;
    const isFull = registered >= max;
    const canRegister = event.registration_open === 1 && !isDeadlinePassed && !isFull && event.status === 'published';

    let timingState = 'upcoming';
    if (now > end || event.status === 'completed') {
      timingState = 'past';
    } else if (now >= start && now <= end) {
      timingState = 'ongoing';
    }

    return res.json({
      success: true,
      event: {
        ...event,
        timing_state: timingState,
        seats_available: Math.max(0, max - registered),
        is_deadline_passed: isDeadlinePassed,
        is_full: isFull,
        can_register: canRegister,
        custom_fields: parsedFields
      }
    });
  } catch (err) {
    console.error('[EventController getEventBySlugOrId Error]', err);
    return res.status(500).json({ success: false, message: 'Failed to retrieve event' });
  }
}

async function createEvent(req, res) {
  try {
    const {
      title,
      code,
      event_type,
      start_datetime,
      end_datetime,
      venue,
      description,
      rules,
      status,
      registration_open,
      registration_start,
      registration_deadline,
      max_participants,
      confirmation_message,
      cert_enabled,
      cert_title,
      cert_description,
      cert_signatory_name,
      cert_signatory_designation,
      cert_winner_enabled,
      participation_type,
      max_team_members,
      custom_fields // JSON string or array of custom fields from the dynamic form builder
    } = req.body;

    if (!title || !start_datetime || !end_datetime || !venue || !description || !registration_deadline) {
      return res.status(400).json({ success: false, message: 'Please fill in all mandatory event details' });
    }

    const eventCode = (code || title.substring(0, 4)).toUpperCase().replace(/[^A-Z0-9]/g, '');
    let slug = slugify(title);

    // Ensure unique slug
    const [existingSlug] = await query('SELECT id FROM events WHERE slug = ?', [slug]);
    if (existingSlug.length > 0) {
      slug = `${slug}-${Date.now().toString().slice(-4)}`;
    }

    let posterUrl = null;
    if (req.file) {
      posterUrl = `/uploads/posters/${req.file.filename}`;
    }

    const createdBy = req.session && req.session.admin ? req.session.admin.id : null;

    const [result] = await query(
      `INSERT INTO events (
        code, title, slug, event_type, start_datetime, end_datetime, venue, description, rules, poster_url,
        status, registration_open, registration_start, registration_deadline, max_participants,
        participation_type, max_team_members,
        confirmation_message, cert_enabled, cert_title, cert_description,
        cert_signatory_name, cert_signatory_designation, cert_winner_enabled, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        eventCode,
        title,
        slug,
        event_type || 'Technical',
        start_datetime,
        end_datetime,
        venue,
        description,
        rules || null,
        posterUrl,
        status || 'published',
        registration_open !== undefined ? (registration_open === 'true' || registration_open === true || registration_open === 1 ? 1 : 0) : 1,
        registration_start || null,
        registration_deadline,
        parseInt(max_participants || 100, 10),
        participation_type === 'team' ? 'team' : 'individual',
        participation_type === 'team' ? (parseInt(max_team_members, 10) || null) : null,
        confirmation_message || 'Thank you for registering! Please save your registration details.',
        cert_enabled !== undefined ? (cert_enabled === 'true' || cert_enabled === true || cert_enabled === 1 ? 1 : 0) : 1,
        cert_title || 'Certificate of Participation',
        cert_description || null,
        cert_signatory_name || 'Head of Department',
        cert_signatory_designation || 'HOD & Professor, INTELLIX',
        cert_winner_enabled !== undefined ? (cert_winner_enabled === 'true' || cert_winner_enabled === true || cert_winner_enabled === 1 ? 1 : 0) : 1,
        createdBy
      ]
    );

    const eventId = result.insertId;

    // Process Dynamic Registration Form Builder fields
    let fieldsArray = [];
    if (custom_fields) {
      try {
        fieldsArray = typeof custom_fields === 'string' ? JSON.parse(custom_fields) : custom_fields;
      } catch (e) {
        console.warn('Could not parse custom_fields JSON:', e.message);
      }
    }

    if (Array.isArray(fieldsArray) && fieldsArray.length > 0) {
      for (let i = 0; i < fieldsArray.length; i++) {
        const field = fieldsArray[i];
        if (field.label) {
          const fieldName = (field.name || field.label).toLowerCase().replace(/[^a-z0-9_]/g, '_');
          const optionsJson = field.options && Array.isArray(field.options) ? JSON.stringify(field.options) : 
                              (typeof field.options === 'string' ? JSON.stringify(field.options.split(',').map(s => s.trim()).filter(Boolean)) : null);

          await query(
            `INSERT INTO event_form_fields 
             (event_id, field_label, field_name, field_type, is_required, options_json, display_order)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
              eventId,
              field.label,
              fieldName,
              field.type || 'text',
              field.required ? 1 : 0,
              optionsJson,
              i + 1
            ]
          );
        }
      }
    }

    return res.status(201).json({
      success: true,
      message: 'Event and dynamic registration form created successfully',
      event: {
        id: eventId,
        slug,
        title,
        code: eventCode
      }
    });
  } catch (err) {
    console.error('[EventController createEvent Error]', err);
    return res.status(500).json({ success: false, message: 'Failed to create event: ' + err.message });
  }
}

async function updateEvent(req, res) {
  const { id } = req.params;
  try {
    const {
      title,
      code,
      event_type,
      start_datetime,
      end_datetime,
      venue,
      description,
      rules,
      status,
      registration_open,
      registration_start,
      registration_deadline,
      max_participants,
      confirmation_message,
      cert_enabled,
      cert_title,
      cert_description,
      cert_signatory_name,
      cert_signatory_designation,
      cert_winner_enabled,
      participation_type,
      max_team_members,
      custom_fields
    } = req.body;

    const [existing] = await query('SELECT * FROM events WHERE id = ?', [id]);
    if (!existing || existing.length === 0) {
      return res.status(404).json({ success: false, message: 'Event not found' });
    }

    let posterUrl = existing[0].poster_url;
    if (req.file) {
      posterUrl = `/uploads/posters/${req.file.filename}`;
    }

    await query(
      `UPDATE events SET 
        title = ?, code = ?, event_type = ?, start_datetime = ?, end_datetime = ?, venue = ?,
        description = ?, rules = ?, poster_url = ?, status = ?, registration_open = ?,
        registration_start = ?, registration_deadline = ?, max_participants = ?, confirmation_message = ?,
        participation_type = ?, max_team_members = ?,
        cert_enabled = ?, cert_title = ?, cert_description = ?, cert_signatory_name = ?,
        cert_signatory_designation = ?, cert_winner_enabled = ?
       WHERE id = ?`,
      [
        title || existing[0].title,
        code || existing[0].code,
        event_type || existing[0].event_type,
        start_datetime || existing[0].start_datetime,
        end_datetime || existing[0].end_datetime,
        venue || existing[0].venue,
        description || existing[0].description,
        rules !== undefined ? rules : existing[0].rules,
        posterUrl,
        status || existing[0].status,
        registration_open !== undefined ? (registration_open === 'true' || registration_open === true || registration_open === 1 ? 1 : 0) : existing[0].registration_open,
        registration_start || existing[0].registration_start,
        registration_deadline || existing[0].registration_deadline,
        max_participants ? parseInt(max_participants, 10) : existing[0].max_participants,
        confirmation_message || existing[0].confirmation_message,
        participation_type !== undefined ? (participation_type === 'team' ? 'team' : 'individual') : existing[0].participation_type,
        participation_type === 'team' ? (parseInt(max_team_members, 10) || existing[0].max_team_members) : null,
        cert_enabled !== undefined ? (cert_enabled === 'true' || cert_enabled === true || cert_enabled === 1 ? 1 : 0) : existing[0].cert_enabled,
        cert_title || existing[0].cert_title,
        cert_description || existing[0].cert_description,
        cert_signatory_name || existing[0].cert_signatory_name,
        cert_signatory_designation || existing[0].cert_signatory_designation,
        cert_winner_enabled !== undefined ? (cert_winner_enabled === 'true' || cert_winner_enabled === true || cert_winner_enabled === 1 ? 1 : 0) : existing[0].cert_winner_enabled,
        id
      ]
    );

    // Update dynamic fields if provided
    if (custom_fields !== undefined) {
      let fieldsArray = [];
      try {
        fieldsArray = typeof custom_fields === 'string' ? JSON.parse(custom_fields) : custom_fields;
      } catch (e) {
        console.warn('Failed to parse custom_fields in update:', e.message);
      }

      if (Array.isArray(fieldsArray)) {
        // Remove old fields and insert updated structure
        await query('DELETE FROM event_form_fields WHERE event_id = ?', [id]);
        for (let i = 0; i < fieldsArray.length; i++) {
          const field = fieldsArray[i];
          if (field.label) {
            const fieldName = (field.name || field.label).toLowerCase().replace(/[^a-z0-9_]/g, '_');
            const optionsJson = field.options && Array.isArray(field.options) ? JSON.stringify(field.options) : 
                                (typeof field.options === 'string' ? JSON.stringify(field.options.split(',').map(s => s.trim()).filter(Boolean)) : null);

            await query(
              `INSERT INTO event_form_fields 
               (event_id, field_label, field_name, field_type, is_required, options_json, display_order)
               VALUES (?, ?, ?, ?, ?, ?, ?)`,
              [
                id,
                field.label,
                fieldName,
                field.type || 'text',
                field.required ? 1 : 0,
                optionsJson,
                i + 1
              ]
            );
          }
        }
      }
    }

    return res.json({ success: true, message: 'Event updated successfully' });
  } catch (err) {
    console.error('[EventController updateEvent Error]', err);
    return res.status(500).json({ success: false, message: 'Failed to update event' });
  }
}

async function toggleRegistration(req, res) {
  const { id } = req.params;
  try {
    const [rows] = await query('SELECT registration_open FROM events WHERE id = ?', [id]);
    if (!rows || rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Event not found' });
    }

    const currentStatus = rows[0].registration_open;
    const newStatus = currentStatus === 1 ? 0 : 1;

    await query('UPDATE events SET registration_open = ? WHERE id = ?', [newStatus, id]);
    return res.json({
      success: true,
      message: `Registration ${newStatus === 1 ? 'opened' : 'closed'} successfully`,
      registration_open: newStatus
    });
  } catch (err) {
    console.error('[EventController toggleRegistration Error]', err);
    return res.status(500).json({ success: false, message: 'Failed to update registration status' });
  }
}

async function deleteEvent(req, res) {
  const { id } = req.params;
  try {
    await query('DELETE FROM events WHERE id = ?', [id]);
    return res.json({ success: true, message: 'Event deleted successfully' });
  } catch (err) {
    console.error('[EventController deleteEvent Error]', err);
    return res.status(500).json({ success: false, message: 'Failed to delete event' });
  }
}

module.exports = {
  getAllEvents,
  getEventBySlugOrId,
  createEvent,
  updateEvent,
  toggleRegistration,
  deleteEvent
};
