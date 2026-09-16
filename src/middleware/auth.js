function requireAuth(req, res, next) {
  if (req.session && req.session.admin) {
    req.admin = req.session.admin;
    return next();
  }
  if (req.xhr || (req.headers.accept && req.headers.accept.includes('application/json')) || req.path.startsWith('/api/')) {
    return res.status(401).json({ success: false, message: 'Authentication required. Please log in.' });
  }
  return res.redirect('/login.html?redirect=' + encodeURIComponent(req.originalUrl));
}

function requireRole(allowedRoles = []) {
  return (req, res, next) => {
    if (!req.session || !req.session.admin) {
      if (req.xhr || req.path.startsWith('/api/')) {
        return res.status(401).json({ success: false, message: 'Authentication required' });
      }
      return res.redirect('/login.html');
    }

    const userRole = req.session.admin.role;
    if (allowedRoles.includes(userRole) || userRole === 'coordinator') {
      return next();
    }

    if (req.xhr || req.path.startsWith('/api/')) {
      return res.status(403).json({ success: false, message: 'Access forbidden: Insufficient permissions for this action' });
    }
    return res.status(403).send('Forbidden: Insufficient privileges.');
  };
}

module.exports = {
  requireAuth,
  requireRole
};
