const { query } = require('../config/db');

async function markAttendance(req, res) {
  try {
    const { registration_id, status } = req.body;

    if (!registration_id || !status) {
      return res.status(400).json({ success: false, message: 'Registration ID and status are required' });
    }

    if (!['present', 'absent', 'unmarked'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Status must be present, absent, or unmarked' });
    }

    // Check registration exists
    const [regs] = await query('SELECT id, event_id FROM event_registrations WHERE id = ?', [registration_id]);
    if (!regs || regs.length === 0) {
      return res.status(404).json({ success: false, message: 'Registration not found' });
    }

    const eventId = regs[0].event_id;
    const adminId = req.session && req.session.admin ? req.session.admin.id : null;

    // Check if attendance row exists
    const [att] = await query('SELECT id FROM attendance WHERE registration_id = ?', [registration_id]);

    if (att.length > 0) {
      await query(
        `UPDATE attendance SET status = ?, marked_by = ?, marked_at = CURRENT_TIMESTAMP WHERE registration_id = ?`,
        [status, adminId, registration_id]
      );
    } else {
      await query(
        `INSERT INTO attendance (registration_id, event_id, status, marked_by, marked_at)
         VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [registration_id, eventId, status, adminId]
      );
    }

    return res.json({
      success: true,
      message: `Attendance marked as ${status}`,
      registration_id,
      status
    });
  } catch (err) {
    console.error('[Attendance Mark Error]', err);
    return res.status(500).json({ success: false, message: 'Failed to update attendance' });
  }
}

async function getAttendanceStats(req, res) {
  const { eventId } = req.params;
  try {
    const [counts] = await query(
      `SELECT 
        COUNT(er.id) as total_registered,
        SUM(CASE WHEN att.status = 'present' THEN 1 ELSE 0 END) as present_count,
        SUM(CASE WHEN att.status = 'absent' THEN 1 ELSE 0 END) as absent_count,
        SUM(CASE WHEN att.status IS NULL OR att.status = 'unmarked' THEN 1 ELSE 0 END) as unmarked_count
       FROM event_registrations er
       LEFT JOIN attendance att ON er.id = att.registration_id
       WHERE er.event_id = ?`,
      [eventId]
    );

    const stats = counts[0] || {};
    return res.json({
      success: true,
      stats: {
        total: parseInt(stats.total_registered || 0, 10),
        present: parseInt(stats.present_count || 0, 10),
        absent: parseInt(stats.absent_count || 0, 10),
        unmarked: parseInt(stats.unmarked_count || 0, 10)
      }
    });
  } catch (err) {
    console.error('[Attendance Stats Error]', err);
    return res.status(500).json({ success: false, message: 'Failed to load attendance stats' });
  }
}

module.exports = {
  markAttendance,
  getAttendanceStats
};
