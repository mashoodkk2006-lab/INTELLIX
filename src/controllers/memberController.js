const { query } = require('../config/db');

async function getAllMembers(req, res) {
  try {
    const [members] = await query(
      `SELECT * FROM association_members 
       WHERE is_active = 1 
       ORDER BY display_order ASC, id ASC`
    );
    return res.json({ success: true, members });
  } catch (err) {
    console.error('[Member Error]', err);
    return res.status(500).json({ success: false, message: 'Failed to load association members' });
  }
}

async function createMember(req, res) {
  try {
    const { name, role, department, short_bio, display_order } = req.body;
    if (!name || !role || !department) {
      return res.status(400).json({ success: false, message: 'Name, role, and department are required' });
    }

    let photoUrl = null;
    if (req.file) {
      photoUrl = `/uploads/members/${req.file.filename}`;
    }

    const [result] = await query(
      `INSERT INTO association_members (name, role, department, short_bio, photo_url, display_order, is_active)
       VALUES (?, ?, ?, ?, ?, ?, 1)`,
      [name, role, department, short_bio || null, photoUrl, parseInt(display_order || 0, 10)]
    );

    return res.status(201).json({
      success: true,
      message: 'Member added successfully',
      id: result.insertId
    });
  } catch (err) {
    console.error('[CreateMember Error]', err);
    return res.status(500).json({ success: false, message: 'Failed to create member' });
  }
}

async function updateMember(req, res) {
  const { id } = req.params;
  try {
    const { name, role, department, short_bio, display_order, is_active } = req.body;
    const [existing] = await query('SELECT * FROM association_members WHERE id = ?', [id]);
    if (!existing || existing.length === 0) {
      return res.status(404).json({ success: false, message: 'Member not found' });
    }

    let photoUrl = existing[0].photo_url;
    if (req.file) {
      photoUrl = `/uploads/members/${req.file.filename}`;
    }

    await query(
      `UPDATE association_members SET 
        name = ?, role = ?, department = ?, short_bio = ?, photo_url = ?, display_order = ?, is_active = ?
       WHERE id = ?`,
      [
        name || existing[0].name,
        role || existing[0].role,
        department || existing[0].department,
        short_bio !== undefined ? short_bio : existing[0].short_bio,
        photoUrl,
        display_order !== undefined ? parseInt(display_order, 10) : existing[0].display_order,
        is_active !== undefined ? (is_active ? 1 : 0) : existing[0].is_active,
        id
      ]
    );

    return res.json({ success: true, message: 'Member updated successfully' });
  } catch (err) {
    console.error('[UpdateMember Error]', err);
    return res.status(500).json({ success: false, message: 'Failed to update member' });
  }
}

async function deleteMember(req, res) {
  const { id } = req.params;
  try {
    await query('DELETE FROM association_members WHERE id = ?', [id]);
    return res.json({ success: true, message: 'Member deleted successfully' });
  } catch (err) {
    console.error('[DeleteMember Error]', err);
    return res.status(500).json({ success: false, message: 'Failed to delete member' });
  }
}

module.exports = {
  getAllMembers,
  createMember,
  updateMember,
  deleteMember
};
