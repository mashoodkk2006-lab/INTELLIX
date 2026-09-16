/**
 * INTELLIX Association Portal - Animated Welcome / Loading Screen Controller
 * Orchestrates high-fidelity FLIP branding transition from viewport center into top navbar.
 * Features:
 *  - Subtle animated background with slow ambient gradient drift
 *  - Glass glossy reflective light sweep across INTELLIX text
 *  - 3-second minimum duration
 *  - Zero size jump, zero duplicate visibility, and exact subpixel scale matching
 */
(function () {
  'use strict';

  const STORAGE_KEY = 'intellix_welcome_shown';
  const urlParams = new URLSearchParams(window.location.search);
  const isForceWelcome = urlParams.get('welcome') === 'true';
  const hasShown = sessionStorage.getItem(STORAGE_KEY);

  // If already shown in current session and not forced, bypass immediately
  if (hasShown && !isForceWelcome) {
    document.documentElement.classList.add('welcome-bypassed');
    return;
  }

  // Mark shown for current session
  try {
    sessionStorage.setItem(STORAGE_KEY, 'true');
  } catch (e) {
    // Ignore storage errors in private browsing modes
  }

  // Pre-hide navbar brand while welcome screen is pending to avoid any flash of duplicate branding
  function prepareNavbarBrand() {
    const brand = document.getElementById('nav-brand-link') || document.querySelector('.nav-brand');
    if (brand) {
      brand.classList.add('navbar-brand-pending');
    }
    document.body.classList.add('welcome-active');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', prepareNavbarBrand, { once: true });
  } else {
    prepareNavbarBrand();
  }

  // Main animation orchestrator
  function startWelcomeAnimation() {
    const loader = document.getElementById('welcome-loader');
    if (!loader) return;

    // Check prefers-reduced-motion
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const logoWrap = document.getElementById('welcome-logo-wrap');
    const logoImg = document.getElementById('welcome-logo-img') || (logoWrap ? logoWrap.querySelector('img') : null);
    const textWrap = document.getElementById('welcome-text-wrap');
    const welcomeTitle = document.getElementById('welcome-title');
    const welcomeSubtitle = document.getElementById('welcome-subtitle');
    const backdrop = loader.querySelector('.welcome-loader-backdrop');
    const targetBrand = document.getElementById('nav-brand-link') || document.querySelector('.nav-brand');

    if (!targetBrand) {
      // Fallback if no target navbar is present
      setTimeout(() => {
        loader.style.transition = 'opacity 0.4s ease';
        loader.style.opacity = '0';
        setTimeout(() => {
          document.body.classList.remove('welcome-active');
          loader.remove();
        }, 400);
      }, 1000);
      return;
    }

    targetBrand.classList.add('navbar-brand-pending');
    document.body.classList.add('welcome-active');

    if (prefersReducedMotion) {
      if (logoWrap) logoWrap.classList.add('revealed');
      if (textWrap) textWrap.classList.add('revealed');
      setTimeout(() => {
        targetBrand.classList.remove('navbar-brand-pending');
        document.body.classList.remove('welcome-active');
        loader.style.transition = 'opacity 0.3s ease';
        loader.style.opacity = '0';
        setTimeout(() => loader.remove(), 300);
      }, 800);
      return;
    }

    // Sequence Breakdown:
    // 0.0s – 0.8s: Logo fades in smoothly
    setTimeout(() => {
      if (logoWrap) logoWrap.classList.add('revealed');
    }, 20);

    // 0.6s – 1.2s: INTELLIX name and subtitle fade in underneath
    setTimeout(() => {
      if (textWrap) textWrap.classList.add('revealed');
      // Trigger glass glossy reflective sweep across letters from left to right
      if (welcomeTitle) {
        welcomeTitle.classList.add('glass-glossy');
      }
    }, 600);

    // 1.2s – 2.0s: Logo and name remain centered and clearly visible (glossy reflection glides across)

    // 2.0s – 3.0s: Logo + INTELLIX smoothly move toward their final navbar position (1000ms duration)
    setTimeout(() => {
      performFlightToNavbar({
        loader,
        backdrop,
        logoImg: logoImg || logoWrap,
        welcomeTitle,
        welcomeSubtitle,
        targetBrand
      });
    }, 2000);
  }

  function performFlightToNavbar({ loader, backdrop, logoImg, welcomeTitle, welcomeSubtitle, targetBrand }) {
    // Settle glass gloss to solid resting state prior to flight
    if (welcomeTitle) {
      welcomeTitle.classList.remove('glass-glossy');
      welcomeTitle.style.backgroundPosition = '0% 0';
      welcomeTitle.style.filter = 'none';
      welcomeTitle.style.transition = 'none';
    }

    // Target elements in the navigation bar
    const targetLogoImg = targetBrand.querySelector('.nav-brand-logo img') || targetBrand.querySelector('.nav-brand-logo');
    const targetTitle = document.getElementById('target-brand-title') || targetBrand.querySelector('div:last-child > div:first-child');
    const targetSubtitle = document.getElementById('target-brand-subtitle') || targetBrand.querySelector('div:last-child > div:last-child');

    if (!targetLogoImg || !logoImg) {
      completeHandover(loader, targetBrand);
      return;
    }

    // Clear CSS transitions so Web Animations API has uninterrupted control
    logoImg.style.transition = 'none';
    if (welcomeSubtitle) welcomeSubtitle.style.transition = 'none';

    // Capture bounding client rects (navbar elements have opacity 0 but full physical layout)
    const targetLogoRect = targetLogoImg.getBoundingClientRect();
    const startLogoRect = logoImg.getBoundingClientRect();

    const targetTitleRect = targetTitle ? targetTitle.getBoundingClientRect() : null;
    const startTitleRect = welcomeTitle ? welcomeTitle.getBoundingClientRect() : null;

    const targetSubtitleRect = targetSubtitle ? targetSubtitle.getBoundingClientRect() : null;
    const startSubtitleRect = welcomeSubtitle ? welcomeSubtitle.getBoundingClientRect() : null;

    // Flight parameters: 2.0s to 3.0s (1000ms duration)
    const FLIGHT_DURATION = 1000;
    const FLIGHT_EASING = 'cubic-bezier(0.25, 1, 0.5, 1)';

    const animations = [];

    // 1. Animate Logo Image: scale down proportionally to exact navbar image dimensions
    const scaleLogo = targetLogoRect.width / startLogoRect.width;
    const dxLogo = targetLogoRect.left - startLogoRect.left;
    const dyLogo = targetLogoRect.top - startLogoRect.top;

    logoImg.style.transformOrigin = 'top left';
    const logoAnim = logoImg.animate([
      { transform: 'translate(0px, 0px) scale(1)' },
      { transform: `translate(${dxLogo}px, ${dyLogo}px) scale(${scaleLogo})` }
    ], {
      duration: FLIGHT_DURATION,
      easing: FLIGHT_EASING,
      fill: 'forwards'
    });
    animations.push(logoAnim);

    // 2. Animate Main Title ("INTELLIX"): uniform scale down to exact navbar font size and baseline
    if (welcomeTitle && startTitleRect && targetTitleRect) {
      const scaleTitle = targetTitleRect.height / startTitleRect.height;
      const dxTitle = targetTitleRect.left - startTitleRect.left;
      const dyTitle = targetTitleRect.top - startTitleRect.top;

      welcomeTitle.style.transformOrigin = 'top left';
      const titleAnim = welcomeTitle.animate([
        { transform: 'translate(0px, 0px) scale(1)' },
        { transform: `translate(${dxTitle}px, ${dyTitle}px) scale(${scaleTitle})` }
      ], {
        duration: FLIGHT_DURATION,
        easing: FLIGHT_EASING,
        fill: 'forwards'
      });
      animations.push(titleAnim);
    }

    // 3. Animate College Department Subtitle: uniform scale down to exact navbar subtitle dimensions
    if (welcomeSubtitle && startSubtitleRect && targetSubtitleRect) {
      const scaleSub = targetSubtitleRect.height / startSubtitleRect.height;
      const dxSub = targetSubtitleRect.left - startSubtitleRect.left;
      const dySub = targetSubtitleRect.top - startSubtitleRect.top;

      welcomeSubtitle.style.transformOrigin = 'top left';
      const subAnim = welcomeSubtitle.animate([
        { transform: 'translate(0px, 0px) scale(1)' },
        { transform: `translate(${dxSub}px, ${dySub}px) scale(${scaleSub})` }
      ], {
        duration: FLIGHT_DURATION,
        easing: FLIGHT_EASING,
        fill: 'forwards'
      });
      animations.push(subAnim);
    }

    // 4. Fade out backdrop layer during flight so main page reveals smoothly beneath
    if (backdrop) {
      backdrop.style.transition = 'opacity 0.75s cubic-bezier(0.25, 1, 0.5, 1)';
      setTimeout(() => {
        backdrop.style.opacity = '0';
      }, 200);
    }

    // 5. Seamless handover at exactly 3.0s (1000ms after flight started)
    let handedOver = false;
    function finalize() {
      if (handedOver) return;
      handedOver = true;
      completeHandover(loader, targetBrand);
    }

    if (animations.length > 0) {
      Promise.all(animations.map(a => a.finished)).then(finalize).catch(finalize);
    }
    setTimeout(finalize, FLIGHT_DURATION);
  }

  function completeHandover(loader, targetBrand) {
    // Reveal real navbar elements at exact matching coordinates and sizes
    if (targetBrand) {
      targetBrand.classList.remove('navbar-brand-pending');
    }
    document.body.classList.remove('welcome-active');

    // Remove welcome loader from DOM in the same render frame
    if (loader) {
      loader.style.display = 'none';
      loader.remove();
    }

    // Dispatch completion event
    window.dispatchEvent(new CustomEvent('intellix:welcomeComplete'));
  }

  // Expose replay utility for development and verification
  window.replayWelcomeAnimation = function () {
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch (e) {}
    const cleanUrl = window.location.pathname + '?welcome=true';
    window.location.href = cleanUrl;
  };

  // Run when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startWelcomeAnimation);
  } else {
    startWelcomeAnimation();
  }
})();
