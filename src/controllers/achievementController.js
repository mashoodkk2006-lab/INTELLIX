const { query } = require('../config/db');

async function getAllAchievements(req, res) {
  try {
    const [achievements] = await query(
      `SELECT a.*, e.title as event_title 
       FROM achievements a
       LEFT JOIN events e ON a.event_id = e.id
       ORDER BY a.event_date DESC, a.id DESC`
    );
    return res.json({ success: true, achievements });
  } catch (err) {
    console.error('[Achievement Error]', err);
    return res.status(500).json({ success: false, message: 'Failed to load achievements' });
  }
}

async function ensureAchievementColumns() {
  try {
    await query('ALTER TABLE achievements MODIFY COLUMN image_url LONGTEXT');
  } catch (e) {}
}

async function createAchievement(req, res) {
  try {
    const { title, student_team_name, event_id, position, event_date, description } = req.body;
    if (!title || !student_team_name || !position || !event_date) {
      return res.status(400).json({ success: false, message: 'Please provide all required achievement details' });
    }

    let imageUrl = null;
    if (req.file) {
      imageUrl = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
    }

    let result;
    try {
      const [resInsert] = await query(
        `INSERT INTO achievements (title, student_team_name, event_id, position, event_date, description, image_url)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [title.trim(), student_team_name.trim(), event_id || null, position.trim(), event_date, description || null, imageUrl]
      );
      result = resInsert;
    } catch (insertErr) {
      const errMsg = (insertErr.message || '').toLowerCase();
      if (insertErr.code === 'ER_DATA_TOO_LONG' || errMsg.includes('data too long') || errMsg.includes('column too long')) {
        console.warn('[CreateAchievement] image_url column length exceeded, attempting schema auto-migration...');
        await ensureAchievementColumns();
        const [retryRes] = await query(
          `INSERT INTO achievements (title, student_team_name, event_id, position, event_date, description, image_url)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [title.trim(), student_team_name.trim(), event_id || null, position.trim(), event_date, description || null, imageUrl]
        );
        result = retryRes;
      } else {
        throw insertErr;
      }
    }

    return res.status(201).json({
      success: true,
      message: 'Achievement added successfully',
      id: result.insertId
    });
  } catch (err) {
    console.error('[CreateAchievement Error]', err);
    return res.status(500).json({ success: false, message: err.message || 'Failed to create achievement' });
  }
}

async function updateAchievement(req, res) {
  const { id } = req.params;
  try {
    const { title, student_team_name, event_id, position, event_date, description } = req.body;
    const [existing] = await query('SELECT * FROM achievements WHERE id = ?', [id]);
    if (!existing || existing.length === 0) {
      return res.status(404).json({ success: false, message: 'Achievement not found' });
    }

    let imageUrl = existing[0].image_url;
    if (req.file) {
      imageUrl = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
    }

    await query(
      `UPDATE achievements SET 
        title = ?, student_team_name = ?, event_id = ?, position = ?, event_date = ?, description = ?, image_url = ?
       WHERE id = ?`,
      [
        title || existing[0].title,
        student_team_name || existing[0].student_team_name,
        event_id !== undefined ? event_id : existing[0].event_id,
        position || existing[0].position,
        event_date || existing[0].event_date,
        description !== undefined ? description : existing[0].description,
        imageUrl,
        id
      ]
    );

    return res.json({ success: true, message: 'Achievement updated successfully' });
  } catch (err) {
    console.error('[UpdateAchievement Error]', err);
    return res.status(500).json({ success: false, message: 'Failed to update achievement' });
  }
}

async function deleteAchievement(req, res) {
  const { id } = req.params;
  try {
    await query('DELETE FROM achievements WHERE id = ?', [id]);
    return res.json({ success: true, message: 'Achievement deleted successfully' });
  } catch (err) {
    console.error('[DeleteAchievement Error]', err);
    return res.status(500).json({ success: false, message: 'Failed to delete achievement' });
  }
}

module.exports = {
  getAllAchievements,
  createAchievement,
  updateAchievement,
  deleteAchievement
};
