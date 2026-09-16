// Common API and Notification Utilities

function showToast(message, type = 'success') {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <span>${message}</span>
    <button style="background:transparent;border:none;color:inherit;cursor:pointer;font-size:1.1rem;" onclick="this.parentElement.remove()">&times;</button>
  `;

  container.appendChild(toast);
  setTimeout(() => {
    toast.style.transition = 'opacity 0.3s, transform 0.3s';
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

async function fetchJson(url, options = {}) {
  try {
    const headers = {
      'Accept': 'application/json',
      ...(options.headers || {})
    };

    if (options.body && typeof options.body === 'string' && !headers['Content-Type'] && !headers['content-type']) {
      headers['Content-Type'] = 'application/json';
    }

    const res = await fetch(url, {
      ...options,
      headers
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.message || `Request failed with status ${res.status}`);
    }
    return data;
  } catch (err) {
    console.error(`Fetch error on ${url}:`, err);
    throw err;
  }
}

function formatDate(dateStr, includeTime = false) {
  if (!dateStr) return 'N/A';
  try {
    const d = new Date(dateStr);
    const options = {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    };
    if (includeTime) {
      options.hour = '2-digit';
      options.minute = '2-digit';
    }
    return d.toLocaleDateString('en-US', options);
  } catch (e) {
    return dateStr;
  }
}

// Scroll animations observer
function initScrollReveals() {
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('visible');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.1 }
    );

    document.querySelectorAll('.fade-in-up').forEach((el) => {
      observer.observe(el);
    });
  } else {
    document.querySelectorAll('.fade-in-up').forEach((el) => {
      el.classList.add('visible');
    });
  }
}

document.addEventListener('DOMContentLoaded', initScrollReveals);
