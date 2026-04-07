/* ================================================
   CERAMISIA – main.js
   Handles: Hero Slider · Language Toggle ·
            Mobile Menu · Sticky Header · Scroll Reveal
   ================================================ */

(function () {
  'use strict';

  /* ── LANGUAGE TOGGLE ─────────────────────────── */
  const LANG_KEY = 'ceramisia_lang';

  function applyLanguage(lang) {
    document.documentElement.lang = lang === 'ge' ? 'ka' : 'en';
    document.body.classList.toggle('lang-ge', lang === 'ge');
    document.body.classList.toggle('lang-en', lang === 'en');

    document.querySelectorAll('[data-ge]').forEach(function (el) {
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
        el.placeholder = lang === 'ge' ? el.dataset.ge : el.dataset.en;
      } else {
        el.textContent = lang === 'ge' ? el.dataset.ge : el.dataset.en;
      }
    });

    document.querySelectorAll('.lang-btn').forEach(function (btn) {
      btn.classList.toggle('active', btn.dataset.lang === lang);
    });

    // Update meta description if present
    var metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) {
      if (lang === 'en') {
        metaDesc.content = 'Ceramisia – Premium handmade ceramic studio from Georgia. Wine culture, ceramic tableware, decor & interior, lighting & atmosphere, symbolic collection.';
      } else {
        metaDesc.content = 'Ceramisia – ხელნაკეთი კერამიკის სტუდია, საქართველოდან. ღვინის კულტურა, კერამიკული ჭურჭელი, დეკორი & ინტერიერი და სიმბოლური კოლექცია.';
      }
    }
  }

  function initLanguage() {
    var saved = localStorage.getItem(LANG_KEY) || 'ge';
    applyLanguage(saved);

    document.querySelectorAll('.lang-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var lang = btn.dataset.lang;
        localStorage.setItem(LANG_KEY, lang);
        applyLanguage(lang);
      });
    });
  }

  /* ── MOBILE MENU ─────────────────────────────── */
  function initMobileMenu() {
    var toggle  = document.getElementById('menuToggle');
    var nav     = document.getElementById('mainNav');
    var closeBtn = document.getElementById('navClose');
    if (!toggle || !nav) return;

    // Inject overlay into body (once)
    var overlay = document.getElementById('navOverlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.className = 'nav-overlay';
      overlay.id = 'navOverlay';
      document.body.appendChild(overlay);
    }

    function openMenu() {
      nav.classList.add('open');
      toggle.classList.add('open');
      toggle.setAttribute('aria-expanded', 'true');
      overlay.classList.add('visible');
      document.body.style.overflow = 'hidden';
    }

    function closeMenu() {
      nav.classList.remove('open');
      toggle.classList.remove('open');
      toggle.setAttribute('aria-expanded', 'false');
      overlay.classList.remove('visible');
      document.body.style.overflow = '';
    }

    // Hamburger click: toggle open/close
    toggle.addEventListener('click', function () {
      if (nav.classList.contains('open')) {
        closeMenu();
      } else {
        openMenu();
      }
    });

    // × close button inside panel
    if (closeBtn) { closeBtn.addEventListener('click', closeMenu); }

    // Click outside (overlay) closes menu
    overlay.addEventListener('click', closeMenu);

    // Close on nav link click
    nav.querySelectorAll('a').forEach(function (link) {
      link.addEventListener('click', closeMenu);
    });

    // Close on Escape key
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && nav.classList.contains('open')) {
        closeMenu();
        toggle.focus();
      }
    });
  }

  /* ── STICKY HEADER ───────────────────────────── */
  function initStickyHeader() {
    var header = document.getElementById('siteHeader');
    if (!header) return;

    function onScroll() {
      header.classList.toggle('scrolled', window.scrollY > 40);
    }

    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  /* ── HERO SLIDER ─────────────────────────────── */
  function initHeroSlider() {
    var slides    = document.querySelectorAll('.slide');
    var dots      = document.querySelectorAll('.dot');
    var prevBtn   = document.getElementById('prevSlide');
    var nextBtn   = document.getElementById('nextSlide');
    if (!slides.length) return;

    var current  = 0;
    var total    = slides.length;
    var timer    = null;
    var interval = 5500;

    function goTo(index) {
      slides[current].classList.remove('active');
      slides[current].classList.add('prev');

      if (dots[current]) dots[current].classList.remove('active');

      current = (index + total) % total;

      slides[current].classList.add('active');
      slides[current].classList.remove('prev');

      if (dots[current]) dots[current].classList.add('active');

      // Reset the fade-out on previous after transition
      var prevIndex = (current - 1 + total) % total;
      setTimeout(function () {
        slides[prevIndex].classList.remove('prev');
      }, 1000);
    }

    function next() { goTo(current + 1); }
    function prev() { goTo(current - 1); }

    function startAuto() {
      clearInterval(timer);
      timer = setInterval(next, interval);
    }

    function resetAuto() {
      startAuto();
    }

    if (prevBtn) {
      prevBtn.addEventListener('click', function () { prev(); resetAuto(); });
    }
    if (nextBtn) {
      nextBtn.addEventListener('click', function () { next(); resetAuto(); });
    }

    dots.forEach(function (dot, i) {
      dot.addEventListener('click', function () { goTo(i); resetAuto(); });
    });

    // Touch/swipe support
    var sliderEl = document.querySelector('.hero-slider');
    if (sliderEl) {
      var touchStartX = 0;
      sliderEl.addEventListener('touchstart', function (e) {
        touchStartX = e.touches[0].clientX;
      }, { passive: true });
      sliderEl.addEventListener('touchend', function (e) {
        var diff = touchStartX - e.changedTouches[0].clientX;
        if (Math.abs(diff) > 50) {
          diff > 0 ? next() : prev();
          resetAuto();
        }
      }, { passive: true });
    }

    // Pause on hover
    var heroSection = document.querySelector('.hero-slider');
    if (heroSection) {
      heroSection.addEventListener('mouseenter', function () { clearInterval(timer); });
      heroSection.addEventListener('mouseleave', startAuto);
    }

    startAuto();
  }

  /* ── SCROLL REVEAL ───────────────────────────── */
  function initScrollReveal() {
    var elements = document.querySelectorAll('[data-reveal]');
    if (!elements.length) return;

    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            var delay = entry.target.dataset.revealDelay || 0;
            setTimeout(function () {
              entry.target.classList.add('revealed');
            }, Number(delay));
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
    );

    elements.forEach(function (el) { observer.observe(el); });
  }

  /* ── PRODUCT FILTER ──────────────────────────── */
  function initProductFilter() {
    var filterBtns = document.querySelectorAll('.filter-btn');
    var cards      = document.querySelectorAll('.product-card');
    if (!filterBtns.length) return;

    filterBtns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        filterBtns.forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');

        var cat = btn.dataset.filter;

        cards.forEach(function (card) {
          if (cat === 'all' || card.dataset.category === cat) {
            card.style.display = '';
            card.classList.add('revealed');
          } else {
            card.style.display = 'none';
          }
        });
      });
    });
  }

  /* ── CART ──────────────────────────────────────── */
  /* Cart logic has moved to cart.js.
     initCart is exposed by cart.js as window.initCart */
  function initCart() {
    // Backward compat: if cart.js already loaded, delegate
    if (window.CeramisiCart) {
      window.CeramisiCart.bindCardButtons();
    }
  }

  /* ── ACTIVE NAV LINK ─────────────────────────── */
  function initActiveNav() {
    var path  = window.location.pathname.split('/').pop() || 'index.html';
    document.querySelectorAll('.main-nav a').forEach(function (link) {
      var href = link.getAttribute('href');
      if (href && href.split('?')[0] === path) {
        link.classList.add('active');
      }
    });
  }

  /* ── CONTACT FORM ────────────────────────────── */
  function initContactForm() {
    var form = document.getElementById('contactForm');
    if (!form) return;

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var btn  = form.querySelector('button[type="submit"]');
      var lang = localStorage.getItem(LANG_KEY) || 'ge';

      // Gather form data
      var fname   = (form.querySelector('#fname') || {}).value || '';
      var lname   = (form.querySelector('#lname') || {}).value || '';
      var email   = (form.querySelector('#email') || {}).value || '';
      var phone   = (form.querySelector('#phone') || {}).value || '';
      var subject = (form.querySelector('#subject') || {}).value || '';
      var message = (form.querySelector('#message') || {}).value || '';

      // Basic validation
      if (!fname.trim() || !email.trim() || !message.trim()) {
        var msg = lang === 'ge' ? 'გთხოვთ შეავსეთ სავალდებულო ველები.' : 'Please fill in required fields.';
        alert(msg);
        return;
      }

      // Build mailto link
      var body = (lang === 'ge' ? 'სახელი' : 'Name') + ': ' + fname + ' ' + lname + '%0A' +
                 (lang === 'ge' ? 'ელ. ფოსტა' : 'Email') + ': ' + email + '%0A' +
                 (lang === 'ge' ? 'ტელეფონი' : 'Phone') + ': ' + phone + '%0A%0A' +
                 encodeURIComponent(message);

      var subjectLine = encodeURIComponent(subject || (lang === 'ge' ? 'შეკითხვა Ceramisia-დან' : 'Inquiry from Ceramisia'));
      var mailtoUrl = 'mailto:ceramisiageorgia@gmail.com?subject=' + subjectLine + '&body=' + body;

      // Open mail client
      window.location.href = mailtoUrl;

      if (btn) {
        btn.disabled    = true;
        btn.textContent = lang === 'ge' ? 'იგზავნება...' : 'Sending...';

        setTimeout(function () {
          btn.textContent = lang === 'ge' ? 'გაიგზავნა ✓' : 'Sent ✓';
          form.reset();
          setTimeout(function () {
            btn.disabled    = false;
            btn.textContent = lang === 'ge' ? 'გაგზავნა' : 'Send Message';
          }, 3000);
        }, 1200);
      }
    });
  }

  /* ── SMOOTH ANCHOR SCROLL ────────────────────── */
  function initSmoothScroll() {
    document.querySelectorAll('a[href^="#"]').forEach(function (anchor) {
      anchor.addEventListener('click', function (e) {
        var target = document.querySelector(anchor.getAttribute('href'));
        if (target) {
          e.preventDefault();
          var offset = 90;
          var top    = target.getBoundingClientRect().top + window.scrollY - offset;
          window.scrollTo({ top: top, behavior: 'smooth' });
        }
      });
    });
  }

  /* ── URL PARAM FILTER ────────────────────────── */
  function initURLFilter() {
    var params = new URLSearchParams(window.location.search);
    var cat    = params.get('cat');
    if (!cat) return;

    var btn = document.querySelector('.filter-btn[data-filter="' + cat + '"]');
    if (btn) btn.click();
  }

  /* ── POPULAR PRODUCTS SLIDER (mobile) ──────── */
  function initPopularSlider() {
    var grid = document.querySelector('.popular-grid');
    var prevBtn = document.getElementById('popularPrev');
    var nextBtn = document.getElementById('popularNext');
    if (!grid || !prevBtn || !nextBtn) return;

    function updateArrows() {
      prevBtn.disabled = grid.scrollLeft <= 4;
      nextBtn.disabled = grid.scrollLeft + grid.offsetWidth >= grid.scrollWidth - 4;
    }

    function scrollByCard(dir) {
      var card = grid.querySelector('.product-card');
      if (!card) return;
      var dist = card.offsetWidth + parseInt(getComputedStyle(grid).gap || '16', 10);
      grid.scrollBy({ left: dir * dist, behavior: 'smooth' });
    }

    prevBtn.addEventListener('click', function () { scrollByCard(-1); });
    nextBtn.addEventListener('click', function () { scrollByCard(1); });
    grid.addEventListener('scroll', updateArrows, { passive: true });

    // Initial state
    updateArrows();
    // Re-check after layout settles
    window.addEventListener('resize', updateArrows);
  }

  /* ── INIT ALL ────────────────────────────────── */
  document.addEventListener('DOMContentLoaded', function () {
    initLanguage();
    initMobileMenu();
    initStickyHeader();
    initHeroSlider();
    initScrollReveal();
    initProductFilter();
    initCart();
    initActiveNav();
    initContactForm();
    initSmoothScroll();
    initURLFilter();
    initPopularSlider();
  });

})();
