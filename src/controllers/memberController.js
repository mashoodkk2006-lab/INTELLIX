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
    const {
      name,
      role,
      department,
      semester,
      short_bio,
      email,
      phone,
      instagram_url,
      linkedin_url,
      whatsapp_number,
      display_order
    } = req.body;

    if (!name || !role || !department) {
      return res.status(400).json({ success: false, message: 'Name, role, and department are required' });
    }

    let photoUrl = null;
    if (req.file) {
      photoUrl = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
    }

    // Auto calculate display_order at the end if not specified
    let finalOrder = (display_order !== undefined && display_order !== null && display_order !== '')
      ? parseInt(display_order, 10)
      : null;

    if (finalOrder === null || isNaN(finalOrder)) {
      const [maxRows] = await query('SELECT COALESCE(MAX(display_order), 0) as max_order FROM association_members');
      finalOrder = ((maxRows && maxRows[0] && (maxRows[0].max_order !== undefined ? maxRows[0].max_order : maxRows[0]['COALESCE(MAX(display_order), 0)'])) || 0) + 1;
    }

    const [resInsert] = await query(
      `INSERT INTO association_members 
       (name, role, department, semester, short_bio, photo_url, email, phone, instagram_url, linkedin_url, whatsapp_number, display_order, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      [
        name.trim(),
        role.trim(),
        department.trim(),
        semester ? semester.trim() : null,
        short_bio ? short_bio.trim() : null,
        photoUrl,
        email ? email.trim() : null,
        phone ? phone.trim() : null,
        instagram_url ? instagram_url.trim() : null,
        linkedin_url ? linkedin_url.trim() : null,
        whatsapp_number ? whatsapp_number.trim() : null,
        finalOrder
      ]
    );

    return res.status(201).json({
      success: true,
      message: 'Member added successfully',
      id: resInsert.insertId
    });
  } catch (err) {
    console.error('[CreateMember Error]', err);
    return res.status(500).json({ success: false, message: err.message || 'Failed to create member' });
  }
}

async function updateMember(req, res) {
  const { id } = req.params;
  try {
    const {
      name,
      role,
      department,
      semester,
      short_bio,
      email,
      phone,
      instagram_url,
      linkedin_url,
      whatsapp_number,
      display_order,
      is_active,
      remove_photo
    } = req.body;

    const [existing] = await query('SELECT * FROM association_members WHERE id = ?', [id]);
    if (!existing || existing.length === 0) {
      return res.status(404).json({ success: false, message: 'Member not found' });
    }

    const prev = existing[0];
    let photoUrl = prev.photo_url;
    if (req.file) {
      photoUrl = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
    } else if (remove_photo === 'true' || remove_photo === true || remove_photo === '1') {
      photoUrl = null;
    }

    const targetName = name !== undefined ? name.trim() : prev.name;
    const targetRole = role !== undefined ? role.trim() : prev.role;
    const targetDept = department !== undefined ? department.trim() : prev.department;
    const targetSem = semester !== undefined ? (semester ? semester.trim() : null) : prev.semester;
    const targetBio = short_bio !== undefined ? (short_bio ? short_bio.trim() : null) : prev.short_bio;
    const targetEmail = email !== undefined ? (email ? email.trim() : null) : prev.email;
    const targetPhone = phone !== undefined ? (phone ? phone.trim() : null) : prev.phone;
    const targetInsta = instagram_url !== undefined ? (instagram_url ? instagram_url.trim() : null) : prev.instagram_url;
    const targetLinkedin = linkedin_url !== undefined ? (linkedin_url ? linkedin_url.trim() : null) : prev.linkedin_url;
    const targetWhatsapp = whatsapp_number !== undefined ? (whatsapp_number ? whatsapp_number.trim() : null) : prev.whatsapp_number;
    const targetOrder = display_order !== undefined && display_order !== '' ? (parseInt(display_order, 10) || 0) : prev.display_order;
    const targetActive = is_active !== undefined ? (is_active ? 1 : 0) : prev.is_active;

    await query(
      `UPDATE association_members SET 
        name = ?, role = ?, department = ?, semester = ?, short_bio = ?, photo_url = ?, 
        email = ?, phone = ?, instagram_url = ?, linkedin_url = ?, whatsapp_number = ?, 
        display_order = ?, is_active = ?
       WHERE id = ?`,
      [
        targetName, targetRole, targetDept, targetSem, targetBio, photoUrl,
        targetEmail, targetPhone, targetInsta, targetLinkedin, targetWhatsapp,
        targetOrder, targetActive, id
      ]
    );

    return res.json({ success: true, message: 'Member updated successfully' });
  } catch (err) {
    console.error('[UpdateMember Error]', err);
    return res.status(500).json({ success: false, message: err.message || 'Failed to update member' });
  }
}

async function reorderMembers(req, res) {
  try {
    const { order } = req.body;
    if (!order || !Array.isArray(order)) {
      return res.status(400).json({ success: false, message: 'Invalid order data. Expected an array of member IDs or order objects.' });
    }

    for (let i = 0; i < order.length; i++) {
      const item = order[i];
      let memberId, displayOrder;
      if (typeof item === 'object' && item !== null && item.id !== undefined) {
        memberId = item.id;
        displayOrder = item.display_order !== undefined ? parseInt(item.display_order, 10) : (i + 1);
      } else {
        memberId = item;
        displayOrder = i + 1;
      }

      await query(
        'UPDATE association_members SET display_order = ? WHERE id = ?',
        [displayOrder, memberId]
      );
    }

    return res.json({ success: true, message: 'Member display order saved successfully' });
  } catch (err) {
    console.error('[ReorderMembers Error]', err);
    return res.status(500).json({ success: false, message: 'Failed to reorder members: ' + err.message });
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
  reorderMembers,
  deleteMember
};
