const bcrypt = require('bcryptjs');
const { query } = require('../config/db');

async function getAllAdmins(req, res) {
  try {
    const [admins] = await query(
      `SELECT id, username, full_name, email, role, is_active, created_at 
       FROM admins 
       ORDER BY id ASC`
    );

    const [permissions] = await query('SELECT * FROM admin_permissions');
    const [assignments] = await query(
      `SELECT aae.admin_id, aae.event_id, e.title as event_title, e.code as event_code 
       FROM admin_assigned_events aae
       JOIN events e ON aae.event_id = e.id`
    );

    const permsMap = {};
    permissions.forEach(p => { permsMap[p.admin_id] = p; });

    const assignedMap = {};
    assignments.forEach(a => {
      if (!assignedMap[a.admin_id]) assignedMap[a.admin_id] = [];
      assignedMap[a.admin_id].push({ id: a.event_id, title: a.event_title, code: a.event_code });
    });

    const enriched = admins.map(a => ({
      ...a,
      permissions: permsMap[a.id] || {},
      assignedEvents: assignedMap[a.id] || []
    }));

    return res.json({ success: true, admins: enriched });
  } catch (err) {
    console.error('[AdminUserController getAllAdmins Error]', err);
    return res.status(500).json({ success: false, message: 'Failed to retrieve admin accounts' });
  }
}

async function createAdmin(req, res) {
  try {
    const {
      username,
      password,
      full_name,
      email,
      role,
      assigned_events, // array of event IDs
      permissions // object of booleans
    } = req.body;

    if (!username || !password || !full_name || !email || !role) {
      return res.status(400).json({ success: false, message: 'Please provide all mandatory admin details' });
    }

    if (!['coordinator', 'hod', 'registration_admin'].includes(role)) {
      return res.status(400).json({ success: false, message: 'Invalid role specified' });
    }

    // Check duplicate username or email
    const [existing] = await query('SELECT id FROM admins WHERE username = ? OR email = ?', [username.trim(), email.trim()]);
    if (existing.length > 0) {
      return res.status(409).json({ success: false, message: 'An admin with this username or email already exists' });
    }

    const hash = await bcrypt.hash(password, 10);

    const [adminRes] = await query(
      `INSERT INTO admins (username, password_hash, full_name, email, role, is_active)
       VALUES (?, ?, ?, ?, ?, 1)`,
      [username.trim(), hash, full_name.trim(), email.trim(), role]
    );

    const adminId = adminRes.insertId;

    // Permissions defaults
    const p = permissions || {};
    const canView = p.can_view_registrations !== undefined ? (p.can_view_registrations ? 1 : 0) : 1;
    const canManage = p.can_manage_registrations ? 1 : 0;
    const canAttendance = p.can_mark_attendance ? 1 : 0;
    const canCreateEvents = p.can_create_events ? 1 : 0;
    const canDeleteEvents = p.can_delete_events ? 1 : 0;
    const canCert = p.can_generate_certificates ? 1 : 0;
    const canManageAdmins = p.can_manage_admins ? 1 : 0;

    await query(
      `INSERT INTO admin_permissions 
       (admin_id, can_view_registrations, can_manage_registrations, can_mark_attendance, can_create_events, can_delete_events, can_generate_certificates, can_manage_admins)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [adminId, canView, canManage, canAttendance, canCreateEvents, canDeleteEvents, canCert, canManageAdmins]
    );

    // Assigned events
    if (Array.isArray(assigned_events) && assigned_events.length > 0) {
      for (const eventId of assigned_events) {
        await query('INSERT INTO admin_assigned_events (admin_id, event_id) VALUES (?, ?)', [adminId, eventId]);
      }
    }

    return res.status(201).json({
      success: true,
      message: `Admin account "${username}" (${role}) created successfully`,
      adminId
    });
  } catch (err) {
    console.error('[AdminUserController createAdmin Error]', err);
    return res.status(500).json({ success: false, message: 'Failed to create admin: ' + err.message });
  }
}

async function updateAdmin(req, res) {
  const { id } = req.params;
  try {
    const {
      full_name,
      email,
      password,
      is_active,
      assigned_events,
      permissions
    } = req.body;

    const [existing] = await query('SELECT * FROM admins WHERE id = ?', [id]);
    if (!existing || existing.length === 0) {
      return res.status(404).json({ success: false, message: 'Admin not found' });
    }

    let passHash = existing[0].password_hash;
    if (password && password.trim().length > 0) {
      passHash = await bcrypt.hash(password.trim(), 10);
    }

    await query(
      `UPDATE admins SET 
        full_name = ?, email = ?, password_hash = ?, is_active = ?
       WHERE id = ?`,
      [
        full_name || existing[0].full_name,
        email || existing[0].email,
        passHash,
        is_active !== undefined ? (is_active ? 1 : 0) : existing[0].is_active,
        id
      ]
    );

    if (permissions) {
      await query(
        `UPDATE admin_permissions SET
          can_view_registrations = ?,
          can_manage_registrations = ?,
          can_mark_attendance = ?,
          can_create_events = ?,
          can_delete_events = ?,
          can_generate_certificates = ?,
          can_manage_admins = ?
         WHERE admin_id = ?`,
        [
          permissions.can_view_registrations ? 1 : 0,
          permissions.can_manage_registrations ? 1 : 0,
          permissions.can_mark_attendance ? 1 : 0,
          permissions.can_create_events ? 1 : 0,
          permissions.can_delete_events ? 1 : 0,
          permissions.can_generate_certificates ? 1 : 0,
          permissions.can_manage_admins ? 1 : 0,
          id
        ]
      );
    }

    if (Array.isArray(assigned_events)) {
      await query('DELETE FROM admin_assigned_events WHERE admin_id = ?', [id]);
      for (const eventId of assigned_events) {
        await query('INSERT INTO admin_assigned_events (admin_id, event_id) VALUES (?, ?)', [id, eventId]);
      }
    }

    return res.json({ success: true, message: 'Admin account updated successfully' });
  } catch (err) {
    console.error('[AdminUserController updateAdmin Error]', err);
    return res.status(500).json({ success: false, message: 'Failed to update admin' });
  }
}

async function deleteAdmin(req, res) {
  const { id } = req.params;
  try {
    if (req.session.admin && req.session.admin.id === parseInt(id, 10)) {
      return res.status(400).json({ success: false, message: 'You cannot delete your own logged-in account' });
    }

    const [admin] = await query('SELECT role FROM admins WHERE id = ?', [id]);
    if (!admin || admin.length === 0) {
      return res.status(404).json({ success: false, message: 'Admin not found' });
    }

    await query('DELETE FROM admins WHERE id = ?', [id]);
    return res.json({ success: true, message: 'Admin account deleted successfully' });
  } catch (err) {
    console.error('[AdminUserController deleteAdmin Error]', err);
    return res.status(500).json({ success: false, message: 'Failed to delete admin' });
  }
}

module.exports = {
  getAllAdmins,
  createAdmin,
  updateAdmin,
  deleteAdmin
};
