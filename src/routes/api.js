const express = require('express');
const router = express.Router();

const { requireAuth, requireRole } = require('../middleware/auth');
const { requirePermission, requireEventAccess } = require('../middleware/rbac');
const upload = require('../middleware/upload');

const authController = require('../controllers/authController');
const eventController = require('../controllers/eventController');
const registrationController = require('../controllers/registrationController');
const attendanceController = require('../controllers/attendanceController');
const certificateController = require('../controllers/certificateController');
const achievementController = require('../controllers/achievementController');
const galleryController = require('../controllers/galleryController');
const memberController = require('../controllers/memberController');
const adminUserController = require('../controllers/adminUserController');
const statsController = require('../controllers/statsController');
const aboutController = require('../controllers/aboutController');

// ==========================================
// 1. PUBLIC ROUTES
// ==========================================
router.get('/stats', statsController.getStats);
router.get('/about', aboutController.getAbout);
router.get('/events', eventController.getAllEvents);
router.get('/events/:identifier', eventController.getEventBySlugOrId);
router.post('/registrations', registrationController.register);
router.get('/achievements', achievementController.getAllAchievements);
router.get('/gallery', galleryController.getAllGallery);
router.get('/members', memberController.getAllMembers);

// Certificate Verification & Download
router.get('/certificates/verify', certificateController.verifyCertificate);
router.get('/certificates/download/:code', certificateController.downloadCertificate);

// ==========================================
// 2. AUTHENTICATION ROUTES
// ==========================================
router.post('/auth/login', authController.login);
router.post('/auth/logout', authController.logout);
router.get('/auth/me', authController.me);

// ==========================================
// 3. ADMIN PROTECTED ROUTES
// ==========================================
// Events Management
router.post(
  '/events',
  requireAuth,
  requirePermission('can_create_events'),
  upload.fields([{ name: 'poster', maxCount: 1 }, { name: 'payment_qr', maxCount: 1 }]),
  eventController.createEvent
);

router.put(
  '/events/:id',
  requireAuth,
  requirePermission('can_create_events'),
  requireEventAccess(),
  upload.fields([{ name: 'poster', maxCount: 1 }, { name: 'payment_qr', maxCount: 1 }]),
  eventController.updateEvent
);

router.patch(
  '/events/:id/toggle-registration',
  requireAuth,
  requirePermission('can_create_events'),
  requireEventAccess(),
  eventController.toggleRegistration
);

router.delete(
  '/events/:id',
  requireAuth,
  requirePermission('can_delete_events'),
  eventController.deleteEvent
);

// Registrations & Participants
router.get(
  '/events/:eventId/registrations',
  requireAuth,
  requirePermission('can_view_registrations'),
  requireEventAccess(),
  registrationController.getRegistrationsByEvent
);

router.get(
  '/events/:eventId/registrations/export',
  requireAuth,
  requirePermission('can_view_registrations'),
  requireEventAccess(),
  registrationController.exportRegistrationsCSV
);

router.delete(
  '/registrations/:id',
  requireAuth,
  requirePermission('can_manage_registrations'),
  registrationController.deleteRegistration
);

router.patch(
  '/registrations/:id/payment-status',
  requireAuth,
  requirePermission('can_manage_registrations'),
  registrationController.updatePaymentStatus
);

// Attendance
router.post(
  '/attendance',
  requireAuth,
  requirePermission('can_mark_attendance'),
  attendanceController.markAttendance
);

router.get(
  '/events/:eventId/attendance/stats',
  requireAuth,
  requirePermission('can_view_registrations'),
  requireEventAccess(),
  attendanceController.getAttendanceStats
);

// Certificate Management
router.post(
  '/certificates/generate',
  requireAuth,
  requirePermission('can_generate_certificates'),
  certificateController.generateSingleCertificate
);

router.post(
  '/events/:eventId/certificates/bulk-generate',
  requireAuth,
  requirePermission('can_generate_certificates'),
  requireEventAccess(),
  certificateController.bulkGenerateForEvent
);

router.get(
  '/events/:eventId/certificates',
  requireAuth,
  requirePermission('can_generate_certificates'),
  requireEventAccess(),
  certificateController.getCertificatesByEvent
);

// Admin Account Management (Student Coordinator Exclusive)
router.get(
  '/admins',
  requireAuth,
  requireRole(['coordinator']),
  adminUserController.getAllAdmins
);

router.post(
  '/admins',
  requireAuth,
  requireRole(['coordinator']),
  adminUserController.createAdmin
);

router.put(
  '/admins/:id',
  requireAuth,
  requireRole(['coordinator']),
  adminUserController.updateAdmin
);

router.delete(
  '/admins/:id',
  requireAuth,
  requireRole(['coordinator']),
  adminUserController.deleteAdmin
);

// Achievements Admin
router.post(
  '/achievements',
  requireAuth,
  requireRole(['coordinator', 'hod']),
  upload.single('image'),
  achievementController.createAchievement
);

router.put(
  '/achievements/:id',
  requireAuth,
  requireRole(['coordinator', 'hod']),
  upload.single('image'),
  achievementController.updateAchievement
);

router.delete(
  '/achievements/:id',
  requireAuth,
  requireRole(['coordinator', 'hod']),
  achievementController.deleteAchievement
);

// Gallery Admin
router.post(
  '/gallery',
  requireAuth,
  requireRole(['coordinator', 'hod']),
  upload.single('photo'),
  galleryController.uploadGalleryPhoto
);

router.delete(
  '/gallery/:id',
  requireAuth,
  requireRole(['coordinator', 'hod']),
  galleryController.deleteGalleryPhoto
);

// Members Admin
router.post(
  '/members',
  requireAuth,
  requireRole(['coordinator', 'hod']),
  upload.single('photo'),
  memberController.createMember
);

router.put(
  '/members/:id',
  requireAuth,
  requireRole(['coordinator', 'hod']),
  upload.single('photo'),
  memberController.updateMember
);

router.delete(
  '/members/:id',
  requireAuth,
  requireRole(['coordinator', 'hod']),
  memberController.deleteMember
);

// About Us Admin (Coordinator & HOD)
router.put(
  '/about',
  requireAuth,
  requireRole(['coordinator', 'hod']),
  aboutController.updateAbout
);

module.exports = router;
