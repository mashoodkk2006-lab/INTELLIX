// Shared Dashboard Common Logic: Auth check, Sidebar injection, Mobile Navigation, Logout
let currentAdmin = null;

async function checkAdminAuth() {
  try {
    const res = await fetchJson('/api/auth/me');
    if (!res.success || !res.admin) {
      window.location.href = '/login.html?redirect=' + encodeURIComponent(window.location.pathname);
      return null;
    }
    currentAdmin = res.admin;
    renderSidebar();
    return currentAdmin;
  } catch (err) {
    window.location.href = '/login.html?redirect=' + encodeURIComponent(window.location.pathname);
    return null;
  }
}

function renderSidebar() {
  const sidebarContainer = document.getElementById('dashboard-sidebar-container');
  if (!sidebarContainer) return;

  const role = currentAdmin.role;
  const perms = currentAdmin.permissions || {};
  const currentPath = window.location.pathname;

  const isCoord = role === 'coordinator';
  const isHod = role === 'hod';

  const canCreateEvents = isCoord || perms.can_create_events;
  const canViewRegs = isCoord || isHod || perms.can_view_registrations;
  const canAttendance = isCoord || perms.can_mark_attendance;
  const canCerts = isCoord || perms.can_generate_certificates;
  const canManageAdmins = isCoord || perms.can_manage_admins;

  const navItems = [
    { href: '/dashboard/index.html', label: 'Dashboard Overview', icon: '📊', show: true },
    { href: '/dashboard/events.html', label: 'Manage Events', icon: '📅', show: true },
    { href: '/dashboard/event-create.html', label: 'Create Event & Form', icon: '➕', show: canCreateEvents },
    { href: '/dashboard/registrations.html', label: 'Participants & Registrations', icon: '👥', show: canViewRegs },
    { href: '/dashboard/attendance.html', label: 'Attendance Sheet', icon: '✓', show: canAttendance },
    { href: '/dashboard/certificates.html', label: 'Digital Certificates', icon: '📜', show: canCerts },
    { href: '/dashboard/admins.html', label: 'Admin Accounts & RBAC', icon: '🛡️', show: canManageAdmins },
    { href: '/dashboard/about.html', label: 'About Us Section', icon: 'ℹ️', show: isCoord || isHod },
    { href: '/dashboard/achievements.html', label: 'Achievements', icon: '🏆', show: isCoord || isHod },
    { href: '/dashboard/gallery.html', label: 'Event Gallery', icon: '📷', show: isCoord || isHod },
    { href: '/dashboard/members.html', label: 'Association Members', icon: '🎖️', show: isCoord || isHod },
  ];

  const roleLabels = {
    'coordinator': 'Student Coordinator (Main Admin)',
    'hod': 'HOD (Supervisory Admin)',
    'registration_admin': 'Registration Admin'
  };

  sidebarContainer.innerHTML = `
    <div class="dashboard-sidebar" id="sidebar-drawer">
      <div class="sidebar-header">
        <div style="display: flex; align-items: center; gap: 0.6rem;">
          <div class="nav-brand-logo" style="width: 36px; height: 36px;"><img src="/assets/logo.png" alt="Intellix Logo"></div>
          <span style="font-weight: 700; font-size: 1.05rem;">INTELLIX PORTAL</span>
        </div>
        <button class="modal-close-btn" style="display: none;" id="sidebar-close-btn" onclick="toggleSidebar()">&times;</button>
      </div>

      <nav class="sidebar-nav">
        ${navItems.filter(item => item.show).map(item => {
          const isActive = currentPath.endsWith(item.href) || (item.href.endsWith('index.html') && (currentPath.endsWith('/dashboard/') || currentPath.endsWith('/dashboard')));
          return `
            <a href="${item.href}" class="sidebar-link ${isActive ? 'active' : ''}">
              <span>${item.icon}</span>
              <span>${item.label}</span>
            </a>
          `;
        }).join('')}
      </nav>

      <div class="sidebar-footer">
        <div class="user-badge">
          <div class="user-avatar">${currentAdmin.full_name.charAt(0)}</div>
          <div style="overflow: hidden;">
            <div style="font-weight: 700; white-space: nowrap; text-overflow: ellipsis; overflow: hidden;">${currentAdmin.full_name}</div>
            <div style="font-size: 0.725rem; color: var(--text-muted);">${roleLabels[role] || role}</div>
          </div>
        </div>
        <div style="display: flex; gap: 0.5rem;">
          <a href="/" target="_blank" class="btn btn-outline btn-sm" style="flex-grow: 1;">Public Site ↗</a>
          <button class="btn btn-secondary btn-sm" onclick="logoutAdmin()">Sign Out</button>
        </div>
      </div>
    </div>

    <!-- Mobile Bottom App Bar -->
    <nav class="mobile-bottom-bar">
      <a href="/dashboard/index.html" class="mobile-bottom-link ${currentPath.includes('index') ? 'active' : ''}">
        <span>📊</span>
        <span>Home</span>
      </a>
      <a href="/dashboard/events.html" class="mobile-bottom-link ${currentPath.includes('events') ? 'active' : ''}">
        <span>📅</span>
        <span>Events</span>
      </a>
      ${canViewRegs ? `
        <a href="/dashboard/registrations.html" class="mobile-bottom-link ${currentPath.includes('registrations') ? 'active' : ''}">
          <span>👥</span>
          <span>Registrations</span>
        </a>
      ` : ''}
      ${canAttendance ? `
        <a href="/dashboard/attendance.html" class="mobile-bottom-link ${currentPath.includes('attendance') ? 'active' : ''}">
          <span>✓</span>
          <span>Attendance</span>
        </a>
      ` : ''}
      <button class="mobile-bottom-link" style="background:transparent;border:none;cursor:pointer;" onclick="toggleSidebar()">
        <span>☰</span>
        <span>Menu</span>
      </button>
    </nav>
  `;
}

function toggleSidebar() {
  const sidebar = document.getElementById('sidebar-drawer');
  if (sidebar) {
    sidebar.classList.toggle('open');
  }
}

async function logoutAdmin() {
  try {
    await fetchJson('/api/auth/logout', { method: 'POST' });
  } catch (e) {}
  window.location.href = '/login.html';
}

document.addEventListener('DOMContentLoaded', () => {
  checkAdminAuth();
});
