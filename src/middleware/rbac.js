const { query } = require('../config/db');

function requirePermission(permField) {
  return async (req, res, next) => {
    if (!req.session || !req.session.admin) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const admin = req.session.admin;
    // Student Coordinator is Super Admin
    if (admin.role === 'coordinator') {
      return next();
    }

    try {
      const [rows] = await query('SELECT * FROM admin_permissions WHERE admin_id = ?', [admin.id]);
      if (rows && rows.length > 0) {
        const perms = rows[0];
        if (perms[permField] === 1 || perms[permField] === true) {
          return next();
        }
      }
      return res.status(403).json({
        success: false,
        message: `Action denied: You lack the required permission (${permField})`
      });
    } catch (err) {
      console.error('[RBAC Error]', err);
      return res.status(500).json({ success: false, message: 'Server error checking permissions' });
    }
  };
}

function requireEventAccess() {
  return async (req, res, next) => {
    if (!req.session || !req.session.admin) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const admin = req.session.admin;
    if (admin.role === 'coordinator' || admin.role === 'hod') {
      return next();
    }

    const eventId = req.params.eventId || req.params.id || req.body.event_id || req.query.event_id;
    if (!eventId) {
      return next();
    }

    try {
      const [rows] = await query(
        'SELECT 1 FROM admin_assigned_events WHERE admin_id = ? AND event_id = ?',
        [admin.id, eventId]
      );
      if (rows && rows.length > 0) {
        return next();
      }
      return res.status(403).json({
        success: false,
        message: 'Access denied: You are not assigned to manage this specific event.'
      });
    } catch (err) {
      console.error('[RBAC Event Access Error]', err);
      return res.status(500).json({ success: false, message: 'Server error checking event assignment' });
    }
  };
}

module.exports = {
  requirePermission,
  requireEventAccess
};
