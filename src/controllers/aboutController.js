const { query } = require('../config/db');

const DEFAULT_ABOUT = {
  title: 'INTELLIX Association',
  subtitle: 'Department of Artificial Intelligence & Machine Learning • AL-AZHAR College of Engineering & Technology',
  badge_text: 'ABOUT OUR ASSOCIATION',
  description: 'INTELLIX is the premier student-led technical association of the Department of Artificial Intelligence & Machine Learning at AL-AZHAR College of Engineering and Technology. Established to bridge classroom theory with state-of-the-art technological reality, INTELLIX cultivates a high-energy ecosystem where aspiring engineers, researchers, and creators turn bold ideas into impactful reality.',
  purpose: 'To empower students through experiential engineering, analytical mastery, and collaborative building. We guide undergraduates from fundamental programming to advanced deep learning architectures, fostering professional ethics and real-world competence.',
  vision: 'To emerge as a regional and national benchmark for student technical innovation, shaping future-ready AI leaders, ethical technologists, and startup pioneers capable of solving complex societal and industrial problems.',
  activities: 'Throughout the academic year, INTELLIX drives flagship 24-hour hackathons, algorithmic code hunts, applied machine learning workshops, paper presentation symposiums, and tech expos. Each event is curated to challenge limits and stimulate technical mastery.',
  student_engagement: 'Students are at the very core of INTELLIX. Through dedicated peer learning circles, open-source incubation cohorts, hands-on lab sprints, and inter-college symposium delegations, we ensure every student gains tangible engineering exposure and leadership acumen.',
  quote_text: 'Igniting Ideas, Inspiring Innovation, Building Intelligence.',
  updated_by: 'Student Coordinator'
};

/**
 * Public endpoint: Retrieve current About Us section details
 */
async function getAbout(req, res) {
  try {
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    const [rows] = await query('SELECT * FROM about_us ORDER BY id ASC LIMIT 1');
    if (!rows || rows.length === 0) {
      // Auto-insert default if not existing
      await query(
        `INSERT INTO about_us 
         (title, subtitle, badge_text, description, purpose, vision, activities, student_engagement, quote_text, updated_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          DEFAULT_ABOUT.title,
          DEFAULT_ABOUT.subtitle,
          DEFAULT_ABOUT.badge_text,
          DEFAULT_ABOUT.description,
          DEFAULT_ABOUT.purpose,
          DEFAULT_ABOUT.vision,
          DEFAULT_ABOUT.activities,
          DEFAULT_ABOUT.student_engagement,
          DEFAULT_ABOUT.quote_text,
          DEFAULT_ABOUT.updated_by
        ]
      );
      const [newRows] = await query('SELECT * FROM about_us ORDER BY id ASC LIMIT 1');
      return res.json({
        success: true,
        about: newRows[0] || DEFAULT_ABOUT
      });
    }

    return res.json({
      success: true,
      about: rows[0]
    });
  } catch (err) {
    console.error('[AboutController] Error fetching about info:', err);
    // Return default fallback to ensure frontend never breaks
    return res.json({
      success: true,
      about: DEFAULT_ABOUT,
      fallback: true
    });
  }
}

/**
 * Protected endpoint: Update About Us content (Coordinator & HOD)
 */
async function updateAbout(req, res) {
  try {
    const {
      title,
      subtitle,
      badge_text,
      description,
      purpose,
      vision,
      activities,
      student_engagement,
      quote_text
    } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({ success: false, message: 'Association title is required.' });
    }
    if (!description || !description.trim()) {
      return res.status(400).json({ success: false, message: 'Description/Introduction is required.' });
    }

    const updater = (req.session && req.session.admin && req.session.admin.full_name) || (req.admin && req.admin.full_name) || 'Coordinator';

    const [rows] = await query('SELECT id FROM about_us ORDER BY id ASC LIMIT 1');
    if (!rows || rows.length === 0) {
      // Insert new
      await query(
        `INSERT INTO about_us 
         (title, subtitle, badge_text, description, purpose, vision, activities, student_engagement, quote_text, updated_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          title.trim(),
          (subtitle || '').trim(),
          (badge_text || 'ABOUT OUR ASSOCIATION').trim(),
          description.trim(),
          (purpose || '').trim(),
          (vision || '').trim(),
          (activities || '').trim(),
          (student_engagement || '').trim(),
          (quote_text || '').trim(),
          updater
        ]
      );
    } else {
      const recordId = rows[0].id;
      await query(
        `UPDATE about_us SET 
          title = ?, 
          subtitle = ?, 
          badge_text = ?, 
          description = ?, 
          purpose = ?, 
          vision = ?, 
          activities = ?, 
          student_engagement = ?, 
          quote_text = ?, 
          updated_by = ?,
          updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [
          title.trim(),
          (subtitle || '').trim(),
          (badge_text || 'ABOUT OUR ASSOCIATION').trim(),
          description.trim(),
          (purpose || '').trim(),
          (vision || '').trim(),
          (activities || '').trim(),
          (student_engagement || '').trim(),
          (quote_text || '').trim(),
          updater,
          recordId
        ]
      );
    }

    const [updated] = await query('SELECT * FROM about_us ORDER BY id ASC LIMIT 1');

    return res.json({
      success: true,
      message: 'About Us section updated successfully!',
      about: updated[0]
    });
  } catch (err) {
    console.error('[AboutController] Error updating about info:', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to update About Us content: ' + err.message
    });
  }
}

module.exports = {
  getAbout,
  updateAbout
};
