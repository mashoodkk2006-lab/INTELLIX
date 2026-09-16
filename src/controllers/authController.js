const bcrypt = require('bcryptjs');
const { query } = require('../config/db');

async function login(req, res) {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ success: false, message: 'Username and password are required' });
  }

  try {
    const [users] = await query(
      'SELECT * FROM admins WHERE username = ? OR email = ? LIMIT 1',
      [username.trim(), username.trim()]
    );

    if (!users || users.length === 0) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const admin = users[0];
    if (admin.is_active === 0 || admin.is_active === false) {
      return res.status(403).json({ success: false, message: 'Account is deactivated. Contact Student Coordinator.' });
    }

    const isMatch = await bcrypt.compare(password, admin.password_hash);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    // Fetch permissions
    const [permRows] = await query('SELECT * FROM admin_permissions WHERE admin_id = ?', [admin.id]);
    const permissions = permRows.length > 0 ? permRows[0] : {};

    // Fetch assigned events if role is registration_admin
    const [assignedEvents] = await query(
      `SELECT e.id, e.title, e.code 
       FROM admin_assigned_events aae
       JOIN events e ON aae.event_id = e.id
       WHERE aae.admin_id = ?`,
      [admin.id]
    );

    // Save session
    req.session.admin = {
      id: admin.id,
      username: admin.username,
      full_name: admin.full_name,
      email: admin.email,
      role: admin.role,
      permissions,
      assignedEvents
    };

    return res.json({
      success: true,
      message: 'Login successful',
      admin: {
        id: admin.id,
        username: admin.username,
        full_name: admin.full_name,
        email: admin.email,
        role: admin.role,
        permissions,
        assignedEvents
      }
    });
  } catch (err) {
    console.error('[Auth Login Error]', err);
    return res.status(500).json({ success: false, message: 'Server error during login' });
  }
}

function logout(req, res) {
  req.session.destroy(err => {
    if (err) {
      return res.status(500).json({ success: false, message: 'Logout error' });
    }
    res.clearCookie('connect.sid');
    return res.json({ success: true, message: 'Logged out successfully' });
  });
}

async function me(req, res) {
  if (!req.session || !req.session.admin) {
    return res.status(401).json({ success: false, message: 'Not authenticated' });
  }

  try {
    const adminId = req.session.admin.id;
    const [users] = await query('SELECT id, username, full_name, email, role, is_active FROM admins WHERE id = ?', [adminId]);
    if (!users || users.length === 0) {
      req.session.destroy();
      return res.status(401).json({ success: false, message: 'User not found' });
    }

    const admin = users[0];
    const [permRows] = await query('SELECT * FROM admin_permissions WHERE admin_id = ?', [admin.id]);
    const permissions = permRows.length > 0 ? permRows[0] : {};

    const [assignedEvents] = await query(
      `SELECT e.id, e.title, e.code 
       FROM admin_assigned_events aae
       JOIN events e ON aae.event_id = e.id
       WHERE aae.admin_id = ?`,
      [admin.id]
    );

    req.session.admin = {
      ...admin,
      permissions,
      assignedEvents
    };

    return res.json({
      success: true,
      admin: req.session.admin
    });
  } catch (err) {
    console.error('[Auth Me Error]', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
}

module.exports = {
  login,
  logout,
  me
};
