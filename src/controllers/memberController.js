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

async function ensureMemberColumns() {
  try {
    await query('ALTER TABLE association_members MODIFY COLUMN short_bio TEXT');
  } catch (e) {}
  try {
    await query('ALTER TABLE association_members MODIFY COLUMN photo_url LONGTEXT');
  } catch (e) {}
}

async function createMember(req, res) {
  try {
    const { name, role, department, short_bio, display_order } = req.body;
    if (!name || !role || !department) {
      return res.status(400).json({ success: false, message: 'Name, role, and department are required' });
    }

    let photoUrl = null;
    if (req.file) {
      photoUrl = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
    }

    const orderVal = parseInt(display_order || 0, 10) || 0;
    const bioVal = short_bio && typeof short_bio === 'string' ? short_bio.trim() : null;

    let result;
    try {
      const [resInsert] = await query(
        `INSERT INTO association_members (name, role, department, short_bio, photo_url, display_order, is_active)
         VALUES (?, ?, ?, ?, ?, ?, 1)`,
        [name.trim(), role.trim(), department.trim(), bioVal, photoUrl, orderVal]
      );
      result = resInsert;
    } catch (insertErr) {
      // If error is caused by column length in MySQL (e.g., short_bio VARCHAR(255) too long), expand column and retry
      const errMsg = (insertErr.message || '').toLowerCase();
      if (insertErr.code === 'ER_DATA_TOO_LONG' || errMsg.includes('data too long') || errMsg.includes('column too long')) {
        console.warn('[CreateMember] Column length exceeded, attempting schema auto-migration...');
        await ensureMemberColumns();
        try {
          const [retryRes] = await query(
            `INSERT INTO association_members (name, role, department, short_bio, photo_url, display_order, is_active)
             VALUES (?, ?, ?, ?, ?, ?, 1)`,
            [name.trim(), role.trim(), department.trim(), bioVal, photoUrl, orderVal]
          );
          result = retryRes;
        } catch (retryErr) {
          // If DDL fails due to cloud user permissions, gracefully truncate bio to 250 characters as final safety net
          console.warn('[CreateMember] Alter failed, falling back to trimmed bio...');
          const trimmedBio = bioVal ? bioVal.substring(0, 250) : null;
          const [fallbackRes] = await query(
            `INSERT INTO association_members (name, role, department, short_bio, photo_url, display_order, is_active)
             VALUES (?, ?, ?, ?, ?, ?, 1)`,
            [name.trim(), role.trim(), department.trim(), trimmedBio, photoUrl, orderVal]
          );
          result = fallbackRes;
        }
      } else {
        throw insertErr;
      }
    }

    return res.status(201).json({
      success: true,
      message: 'Member added successfully',
      id: result.insertId
    });
  } catch (err) {
    console.error('[CreateMember Error]', err);
    return res.status(500).json({ success: false, message: err.message || 'Failed to create member' });
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
      photoUrl = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
    }

    const targetName = name !== undefined ? name.trim() : existing[0].name;
    const targetRole = role !== undefined ? role.trim() : existing[0].role;
    const targetDept = department !== undefined ? department.trim() : existing[0].department;
    const targetBio = short_bio !== undefined ? (typeof short_bio === 'string' ? short_bio.trim() : short_bio) : existing[0].short_bio;
    const targetOrder = display_order !== undefined ? (parseInt(display_order, 10) || 0) : existing[0].display_order;
    const targetActive = is_active !== undefined ? (is_active ? 1 : 0) : existing[0].is_active;

    try {
      await query(
        `UPDATE association_members SET 
          name = ?, role = ?, department = ?, short_bio = ?, photo_url = ?, display_order = ?, is_active = ?
         WHERE id = ?`,
        [targetName, targetRole, targetDept, targetBio, photoUrl, targetOrder, targetActive, id]
      );
    } catch (updateErr) {
      const errMsg = (updateErr.message || '').toLowerCase();
      if (updateErr.code === 'ER_DATA_TOO_LONG' || errMsg.includes('data too long')) {
        await ensureMemberColumns();
        try {
          await query(
            `UPDATE association_members SET 
              name = ?, role = ?, department = ?, short_bio = ?, photo_url = ?, display_order = ?, is_active = ?
             WHERE id = ?`,
            [targetName, targetRole, targetDept, targetBio, photoUrl, targetOrder, targetActive, id]
          );
        } catch (retryErr) {
          const trimmedBio = targetBio ? targetBio.substring(0, 250) : null;
          await query(
            `UPDATE association_members SET 
              name = ?, role = ?, department = ?, short_bio = ?, photo_url = ?, display_order = ?, is_active = ?
             WHERE id = ?`,
            [targetName, targetRole, targetDept, trimmedBio, photoUrl, targetOrder, targetActive, id]
          );
        }
      } else {
        throw updateErr;
      }
    }

    return res.json({ success: true, message: 'Member updated successfully' });
  } catch (err) {
    console.error('[UpdateMember Error]', err);
    return res.status(500).json({ success: false, message: err.message || 'Failed to update member' });
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
