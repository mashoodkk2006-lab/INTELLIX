const { query } = require('../config/db');

async function getAllGallery(req, res) {
  try {
    const { event_id } = req.query;
    let sql = `
      SELECT g.*, e.title as event_title 
      FROM event_gallery g
      LEFT JOIN events e ON g.event_id = e.id
    `;
    const params = [];
    if (event_id) {
      sql += ' WHERE g.event_id = ?';
      params.push(event_id);
    }
    sql += ' ORDER BY g.id DESC';

    const [photos] = await query(sql, params);
    return res.json({ success: true, photos });
  } catch (err) {
    console.error('[Gallery Error]', err);
    return res.status(500).json({ success: false, message: 'Failed to load gallery' });
  }
}

async function uploadGalleryPhoto(req, res) {
  try {
    const { event_id, caption } = req.body;
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Photo file is required' });
    }

    const imageUrl = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;

    const [result] = await query(
      'INSERT INTO event_gallery (event_id, caption, image_url) VALUES (?, ?, ?)',
      [event_id || null, caption || null, imageUrl]
    );

    return res.status(201).json({
      success: true,
      message: 'Photo added to gallery',
      id: result.insertId,
      image_url: imageUrl
    });
  } catch (err) {
    console.error('[UploadGallery Error]', err);
    return res.status(500).json({ success: false, message: 'Failed to upload photo' });
  }
}

async function deleteGalleryPhoto(req, res) {
  const { id } = req.params;
  try {
    await query('DELETE FROM event_gallery WHERE id = ?', [id]);
    return res.json({ success: true, message: 'Photo deleted from gallery' });
  } catch (err) {
    console.error('[DeleteGalleryPhoto Error]', err);
    return res.status(500).json({ success: false, message: 'Failed to delete photo' });
  }
}

module.exports = {
  getAllGallery,
  uploadGalleryPhoto,
  deleteGalleryPhoto
};
