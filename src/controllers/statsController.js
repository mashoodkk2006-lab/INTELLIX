const { query } = require('../config/db');

async function getStats(req, res) {
  try {
    const now = new Date().toISOString();

    // 1. Events Conducted
    const [conductedRows] = await query(
      `SELECT COUNT(*) as count FROM events 
       WHERE status = 'completed' OR end_datetime < ?`,
      [now]
    );
    const eventsConducted = conductedRows[0].count || conductedRows[0]['COUNT(*)'] || 0;

    // 2. Upcoming Events
    const [upcomingRows] = await query(
      `SELECT COUNT(*) as count FROM events 
       WHERE status = 'published' AND start_datetime >= ?`,
      [now]
    );
    const upcomingEvents = upcomingRows[0].count || upcomingRows[0]['COUNT(*)'] || 0;

    // 3. Total Registrations / Participants
    const [regRows] = await query('SELECT COUNT(*) as count FROM event_registrations');
    const totalRegistrations = regRows[0].count || regRows[0]['COUNT(*)'] || 0;

    // 4. Certificates Issued
    const [certRows] = await query('SELECT COUNT(*) as count FROM certificates');
    const certificatesIssued = certRows[0].count || certRows[0]['COUNT(*)'] || 0;

    // 5. Total Achievements
    const [achRows] = await query('SELECT COUNT(*) as count FROM achievements');
    const totalAchievements = achRows[0].count || achRows[0]['COUNT(*)'] || 0;

    // 6. Attendance Stats
    const [attRows] = await query(
      `SELECT 
        SUM(CASE WHEN status = 'present' THEN 1 ELSE 0 END) as present_count,
        COUNT(*) as total_att
       FROM attendance`
    );
    const presentCount = attRows[0].present_count || 0;
    const totalAttendanceMarked = attRows[0].total_att || 0;
    const attendanceRate = totalAttendanceMarked > 0 ? Math.round((presentCount / totalAttendanceMarked) * 100) : 0;

    return res.json({
      success: true,
      stats: {
        events_conducted: parseInt(eventsConducted, 10),
        upcoming_events: parseInt(upcomingEvents, 10),
        total_registrations: parseInt(totalRegistrations, 10),
        certificates_issued: parseInt(certificatesIssued, 10),
        total_achievements: parseInt(totalAchievements, 10),
        attendance_rate: attendanceRate
      }
    });
  } catch (err) {
    console.error('[Stats Error]', err);
    return res.status(500).json({ success: false, message: 'Failed to load statistics' });
  }
}

module.exports = {
  getStats
};
