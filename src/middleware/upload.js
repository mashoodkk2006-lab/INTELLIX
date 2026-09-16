const multer = require('multer');
const path = require('path');
const fs = require('fs');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    let subfolder = 'general';
    if (req.baseUrl.includes('events') || req.path.includes('event')) {
      subfolder = 'posters';
    } else if (req.baseUrl.includes('achievements') || req.path.includes('achievement')) {
      subfolder = 'achievements';
    } else if (req.baseUrl.includes('gallery') || req.path.includes('gallery')) {
      subfolder = 'gallery';
    } else if (req.baseUrl.includes('members') || req.path.includes('member')) {
      subfolder = 'members';
    }

    const baseUploadDir = process.env.UPLOADS_DIR || path.join(__dirname, '../../uploads');
    const uploadPath = path.join(baseUploadDir, subfolder);
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname).toLowerCase();
    const safeName = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, '_');
    cb(null, `${safeName}-${uniqueSuffix}${ext}`);
  }
});

const fileFilter = (req, file, cb) => {
  const allowedExts = ['.jpg', '.jpeg', '.png', '.webp', '.svg', '.gif'];
  const ext = path.extname(file.originalname).toLowerCase();
  if (allowedExts.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error('Only image files (.jpg, .jpeg, .png, .webp, .svg, .gif) are allowed'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 6 * 1024 * 1024 // 6MB
  }
});

module.exports = upload;
