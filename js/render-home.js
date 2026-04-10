/**
 * Ceramisia – Homepage Renderer (ES Module)
 * Renders hero slider, about strip, and footer from Sanity CMS.
 * Static HTML remains as fallback if Sanity data is empty.
 */

import { sanityImageUrl, getPage, getHomepage, getSiteSettings, getNavigation, getCategoriesFromProducts } from './sanity.js';
import { loadStrings, tge, ten } from './ui.js';

const LANG_KEY = 'ceramisia_lang';
function getLang() { return localStorage.getItem(LANG_KEY) || 'ge'; }
function esc(str) { if (!str) return ''; var el = document.createElement('span'); el.textContent = str; return el.innerHTML; }

// SVG path data for brand strip icons (keyed by icon id from siteSettings)
var BRAND_ICONS = {
  shield:  '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
  clock:   '<circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/>',
  heart:   '<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>',
  gift:    '<polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><path d="M12 22V7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/>',
  truck:   '<rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>',
  star:    '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
};

// ── Hero Slider ──────────────────────────────────────
/**
/**
 * Brand-coloured fallback slides — shown when no heroSlides are yet
 * configured in Sanity Studio. Replace these gradient backgrounds with
 * real images by adding slides to the Home page doc in Studio.
 * The `_bg` property is used only for fallback slides; Sanity-sourced
 * slides always use their uploaded image instead.
 */
var FALLBACK_SLIDES = [
  {
    heading:      'Ceramisia – კერამიკის ხელოვნება',
    headingEn:    'Ceramisia – The Art of Ceramics',
    subtitle:     'ხელნაკეთი კერამიკა',
    subtitleEn:   'Handmade Ceramics',
    buttonText:   'კოლექციის ნახვა',
    buttonTextEn: 'Shop Collection',
    buttonLink:   '/products/',
    _bg:          'linear-gradient(135deg, #2a1a16 0%, #4d2c1d 40%, #3d2314 100%)',
  },
  {
    heading:      'ტრადიცია და თანამედროვე დიზაინი',
    headingEn:    'Tradition Meets Modern Design',
    subtitle:     'ავტენტური ქართული',
    subtitleEn:   'Authentic Georgian',
    buttonText:   'ჩვენ შესახებ',
    buttonTextEn: 'Our Story',
    buttonLink:   '/about/',
    _bg:          'linear-gradient(135deg, #1e1612 0%, #3d2c20 40%, #2d1e14 100%)',
  },
  {
    heading:      'შექმენი შენი უნიკალური კოლექცია',
    headingEn:    'Create Your Unique Collection',
    subtitle:     'ინდივიდუალური შეკვეთა',
    subtitleEn:   'Custom Orders',
    buttonText:   'დაგვიკავშირდი',
    buttonTextEn: 'Get in Touch',
    buttonLink:   '/contact/',
    _bg:          'linear-gradient(135deg, #24181a 0%, #451c2a 40%, #321620 100%)',
  },
];

/**
 * Build slide + dot DOM from a slides array and inject into the container.
 * Shared by both the Sanity path and the fallback path so both produce
 * identical markup.
 *
 * Slide fields used (all optional except image OR _bg):
 *   image       — Sanity image reference (has .asset._ref)
 *   _bg         — CSS background value for fallback slides without an image
 *   heading / headingEn      — main h1 text
 *   subtitle / subtitleEn    — small label above the heading
 *   buttonText / buttonTextEn + buttonLink — CTA button (hidden if empty)
 */
function buildSlides(container, dotsWrap, slides) {
  var lang = getLang();

  // LCP preload: inject <link rel="preload" as="image"> for the first slide that
  // has an image. The hero uses CSS background-image, not <img>, so a preload
  // hint is the only way to signal urgency to the browser before JS renders.
  var firstImgUrl = slides[0] && slides[0].image ? sanityImageUrl(slides[0].image, 1920) : '';
  if (firstImgUrl) {
    var preloadLink = document.createElement('link');
    preloadLink.rel  = 'preload';
    preloadLink.as   = 'image';
    preloadLink.href = firstImgUrl;
    preloadLink.setAttribute('fetchpriority', 'high');
    document.head.appendChild(preloadLink);
  }

  container.innerHTML = '';
  if (dotsWrap) dotsWrap.innerHTML = '';

  slides.forEach(function (s, i) {
    var imgUrl   = s.image ? sanityImageUrl(s.image, 1920) : '';
    var subtitle = lang === 'ge' ? (s.subtitle   || '') : (s.subtitleEn   || s.subtitle   || '');
    var heading  = lang === 'ge' ? (s.heading    || '') : (s.headingEn    || s.heading    || '');
    var btnText  = lang === 'ge' ? (s.buttonText || '') : (s.buttonTextEn || s.buttonText || '');
    var btnLink  = s.buttonLink || '/products/';
    // Allow only safe link targets
    var safeBtnLink = /^(https?:\/\/|\/|[a-zA-Z0-9_-]+\.[a-zA-Z])/.test(btnLink)
      ? btnLink : '/products/';

    var slide = document.createElement('div');
    slide.className = 'slide' + (i === 0 ? ' active' : '');

    if (imgUrl) {
      slide.style.backgroundImage = "url('" + esc(imgUrl) + "')";
    } else if (s._bg) {
      // Fallback slide — brand-coloured gradient (no Sanity image assigned yet)
      slide.style.background = s._bg;
    }

    var imgAlt = (s.image && s.image.alt) ? s.image.alt : (heading || '');

    slide.innerHTML =
      '<div class="slide-overlay"></div>' +
      (imgAlt ? '<span class="sr-only">' + esc(imgAlt) + '</span>' : '') +
      '<div class="slide-content">' +
        (subtitle
          ? '<p class="slide-subtitle" data-ge="' + esc(s.subtitle || '') + '" data-en="' + esc(s.subtitleEn || '') + '">' + esc(subtitle) + '</p>'
          : '') +
        '<h1 class="slide-title" data-ge="' + esc(s.heading || '') + '" data-en="' + esc(s.headingEn || '') + '">' + esc(heading) + '</h1>' +
        (btnText
          ? '<a href="' + esc(safeBtnLink) + '" class="btn btn-light" data-ge="' + esc(s.buttonText || '') + '" data-en="' + esc(s.buttonTextEn || '') + '">' + esc(btnText) + '</a>'
          : '') +
      '</div>';

    container.appendChild(slide);

    if (dotsWrap) {
      var dot = document.createElement('button');
      dot.className   = 'dot' + (i === 0 ? ' active' : '');
      dot.dataset.index = i;
      dot.setAttribute('aria-label', 'Slide ' + (i + 1));
      dotsWrap.appendChild(dot);
    }
  });
}

// ── Hero Slider ──────────────────────────────────────
/**
 * Render the homepage hero carousel from Sanity data.
 *
 * Priority order (first match wins):
 *  1. slidesOverride   — array passed directly by the caller (homepage sections)
 *  2. page.heroSlides  — slides on the "home" Page document in Studio
 *  3. homepage.sections slider — first "slider" section in the Homepage layout doc
 *  4. siteSettings.heroImage  — single-image fallback from Site Settings
 *  5. FALLBACK_SLIDES  — built-in brand-coloured slides (never hides the hero)
 *
 * The hero section is NEVER hidden — if Sanity has no data, the brand-coloured
 * fallback slides are shown so the layout stays intact.
 *
 * All checks are logged to the browser console — open DevTools → Console and
 * look for "[Hero]" lines to diagnose which source is being used.
 */
export async function renderHeroSlider(slidesOverride) {
  var container = document.getElementById('slidesContainer');
  var dotsWrap  = document.getElementById('sliderDots');
  if (!container) return;

  // Helper: build + re-init, then exit
  function render(slides, source) {
    console.log('[Hero] ✅ Rendering from:', source, '| slide count:', slides.length);
    console.log('[Hero] slides data:', slides);
    buildSlides(container, dotsWrap, slides);
    if (typeof window.initHeroSlider === 'function') window.initHeroSlider();
  }

  try {
    // ── 1. Direct override from caller ──────────────
    if (Array.isArray(slidesOverride) && slidesOverride.length) {
      return render(slidesOverride, 'slidesOverride (from renderHomepageSections)');
    }
    console.log('[Hero] Priority 1 (slidesOverride): skipped — no override passed');

    // ── 2. Page document heroSlides ──────────────────
    var page = await getPage('home');
    console.log('[Hero] Priority 2 — getPage("home") result:', page);
    console.log('[Hero] Priority 2 — page.heroSlides:', page && page.heroSlides);
    if (page && Array.isArray(page.heroSlides) && page.heroSlides.length) {
      return render(page.heroSlides, 'page.heroSlides (Home page document in Studio)');
    }
    if (!page) {
      console.warn('[Hero] Priority 2 FAILED: getPage("home") returned null.' +
        ' ▶ Fix: make sure a Page document with slug exactly "home" exists and is PUBLISHED in Studio.');
    } else if (!page.heroSlides || !page.heroSlides.length) {
      console.warn('[Hero] Priority 2 FAILED: page exists but heroSlides is empty or null.' +
        ' ▶ Fix: add slides to the "🖼 Hero Slider Slides" field on the Home page in Studio and PUBLISH.');
    }

    // ── 3. Homepage layout document slider section ───
    var homepage = await getHomepage();
    console.log('[Hero] Priority 3 — getHomepage() result:', homepage);
    var homepageSections = (homepage && Array.isArray(homepage.sections)) ? homepage.sections : [];
    console.log('[Hero] Priority 3 — sections count:', homepageSections.length);
    var sliderSection = homepageSections.find(function (s) {
      // GROQ returns null (not []) for empty arrays — treat both as "no slides"
      var hasSlides = Array.isArray(s.slides) && s.slides.length > 0;
      console.log('[Hero] Section type:', s.type, '| slides:', s.slides, '| valid:', hasSlides);
      return s.type === 'slider' && hasSlides;
    });
    if (sliderSection) {
      return render(sliderSection.slides, 'homepage.sections slider (Homepage document in Studio)');
    }
    if (!homepageSections.length) {
      console.warn('[Hero] Priority 3 FAILED: Homepage document has no sections or does not exist.');
    } else if (!sliderSection) {
      console.warn('[Hero] Priority 3 FAILED: no slider section with slides found.' +
        ' ▶ Fix: in the Homepage document, add a "Hero Slider" section and add slides inside it. PUBLISH.');
    }

    // ── 4. siteSettings.heroImage as single-slide ───
    var settings = await getSiteSettings().catch(function () { return null; });
    console.log('[Hero] Priority 4 — siteSettings.heroImage:', settings && settings.heroImage);
    if (settings && settings.heroImage) {
      return render([{
        image:        settings.heroImage,
        heading:      settings.homepageTitle   || 'Ceramisia',
        headingEn:    settings.homepageTitleEn || 'Ceramisia',
        subtitle:     '',
        subtitleEn:   '',
        buttonText:   tge('viewProducts'),
        buttonTextEn: ten('viewProducts'),
        buttonLink:   '/products/',
      }], 'siteSettings.heroImage (Site Settings in Studio)');
    }
    console.warn('[Hero] Priority 4 FAILED: no heroImage in Site Settings.');

    // ── 5. Brand-coloured fallback — always shows the slider ──
    console.info('[Hero] ⚠️  All 4 Sanity sources returned no slides.' +
      ' Showing built-in brand-coloured fallback slides.' +
      ' To show real images, go to Studio → Pages → Home → Hero Slider Slides → add slides → Publish.');
    render(FALLBACK_SLIDES, 'FALLBACK_SLIDES (no Sanity data found)');

  } catch (err) {
    // Network/parse error — still show fallback rather than hiding the hero
    console.error('[Hero] ❌ Fetch error — showing fallback slides. Error:', err);
    render(FALLBACK_SLIDES, 'FALLBACK_SLIDES (fetch error)');
  }
}

// ── Navigation Menu ───────────────────────────────────
/**
 * Renders the main navigation <ul> from the Sanity navigation document.
 * Maintains data-ge / data-en attributes so the language switcher works.
 * Falls back to the hardcoded HTML if Sanity returns no items.
 */
export async function renderNavigation() {
  var navUl = document.querySelector('.main-nav ul');
  if (!navUl) return;

  try {
    var nav = await getNavigation();
    if (!nav || !nav.mainMenu || !nav.mainMenu.length) return; // keep static HTML

    var lang = getLang();
    // Derive the current page from the pathname so active-state works with
    // both clean URLs (/products/) and direct file access (/products/index.html).
    // Normalise: strip trailing slash, then take the last non-empty segment.
    var rawPath   = window.location.pathname.replace(/\/index\.html$/, '').replace(/\/$/, '');
    var currentSegment = rawPath.split('/').pop() || ''; // '' for root /

    navUl.innerHTML = '';

    nav.mainMenu.forEach(function (item) {
      var label = lang === 'ge' ? (item.title || '') : (item.titleEn || item.title || '');
      var li = document.createElement('li');
      var a  = document.createElement('a');

      a.href      = esc(item.link || '#');
      a.dataset.ge = item.title   || '';
      a.dataset.en = item.titleEn || '';
      a.textContent = label;
      if (item.openInNewTab) { a.target = '_blank'; a.rel = 'noopener noreferrer'; }

      // Active state — compare last path segment against last segment of item link
      // Normalise item link: strip /index.html, trailing slash, then split
      var linkNorm    = (item.link || '').replace(/\/index\.html$/, '').replace(/\/$/, '');
      var linkSegment = linkNorm.split('/').pop() || '';
      if (linkSegment === currentSegment) {
        a.classList.add('active');
      }

      li.appendChild(a);
      navUl.appendChild(li);
    });

    // Re-attach close-on-click for mobile menu NAV links (main.js may not have seen these yet)
    navUl.querySelectorAll('a').forEach(function (link) {
      link.addEventListener('click', function () {
        var mainNav = document.getElementById('mainNav');
        var menuTgl = document.getElementById('menuToggle');
        var overlay = document.getElementById('navOverlay');
        if (mainNav) mainNav.classList.remove('open');
        if (menuTgl) { menuTgl.classList.remove('open'); menuTgl.setAttribute('aria-expanded', 'false'); }
        if (overlay) overlay.classList.remove('visible');
        document.body.style.overflow = '';
      });
    });

  } catch (err) {
    console.warn('Navigation fetch failed, keeping static HTML:', err);
  }
}

// ── About Strip (homepage) ──────────────────────────
export async function renderAboutStrip() {
  var section = document.querySelector('.about-strip');
  if (!section) return;

  try {
    var page = await getPage('home');
    var lang = getLang();
    console.log('[About Strip] page:', page ? 'ok' : 'null',
      '| sections:', page && page.sections ? page.sections.length : 'none');

    var s = (page && page.sections && page.sections.length) ? page.sections[0] : null;

    if (!s) {
      // No sections in the Home page document — keep static HTML text visible
      // but try to inject an image from siteSettings so the layout isn't bare.
      console.warn('[About Strip] No sections on Home page. ' +
        'Fix: add a Content Section to the Home page in Sanity Studio. ' +
        'Falling back to siteSettings.heroImage for the image slot.');
      var stSettings = await getSiteSettings().catch(function () { return null; });
      var imageWrapFb = section.querySelector('.about-strip-image');
      if (imageWrapFb && stSettings && stSettings.heroImage) {
        var fbImgUrl = sanityImageUrl(stSettings.heroImage, 800);
        if (fbImgUrl) {
          imageWrapFb.innerHTML = '<img src="' + esc(fbImgUrl) + '" alt="Ceramisia Studio" loading="lazy">';
          console.log('[About Strip] Image injected from siteSettings.heroImage');
        } else {
          console.warn('[About Strip] siteSettings.heroImage asset ref is invalid.');
          imageWrapFb.classList.add('section--hidden');
        }
      } else if (imageWrapFb) {
        console.warn('[About Strip] No image source. ' +
          'Fix: upload a heroImage in Site Settings or add a section image.');
        imageWrapFb.classList.add('section--hidden');
      }
      // Static text remains — do NOT add section--hidden
      return;
    }

    var heading = lang === 'ge' ? (s.heading || '') : (s.headingEn || s.heading || '');
    var imgUrl  = sanityImageUrl(s.image, 800);
    console.log('[About Strip] section heading:', heading || '(empty)', '| image:', imgUrl || '(none)');

    var textEl = section.querySelector('.about-strip-text');
    if (textEl) {
      var h2 = textEl.querySelector('h2');
      var p  = textEl.querySelector('p');
      if (h2 && heading) {
        h2.dataset.ge = s.heading || '';
        h2.dataset.en = s.headingEn || '';
        h2.textContent = heading;
      }
      // Portable text — just use the first block's text for plain rendering
      if (p && s.text) {
        var geText = blocksToText(s.text);
        var enText = blocksToText(s.textEn);
        p.dataset.ge = geText;
        p.dataset.en = enText || geText;
        p.textContent = lang === 'ge' ? geText : (enText || geText);
      }
    }

    var imageWrap = section.querySelector('.about-strip-image');
    if (imageWrap) {
      if (imgUrl) {
        imageWrap.innerHTML = '<img src="' + esc(imgUrl) + '" alt="Ceramisia Studio" loading="lazy">';
      } else {
        // Section has no image — try siteSettings.heroImage
        var stSettings2 = await getSiteSettings().catch(function () { return null; });
        var fbImg2 = stSettings2 && stSettings2.heroImage
          ? sanityImageUrl(stSettings2.heroImage, 800) : '';
        if (fbImg2) {
          imageWrap.innerHTML = '<img src="' + esc(fbImg2) + '" alt="Ceramisia Studio" loading="lazy">';
        } else {
          imageWrap.classList.add('section--hidden');
        }
      }
    }

  } catch (err) {
    // Keep static HTML visible — do not hide the section on error
    console.warn('[About Strip] Fetch failed, keeping static HTML:', err);
  }
}

// ── Render Footer + global CMS-driven content ──────
/**
 * Runs on every page. Fetches site settings, navigation, and active
 * categories in parallel, then applies them to:
 *   • Header / footer logos
 *   • Footer tagline, quick links, categories column, contact info
 *   • Copyright line
 *   • Brand strip (homepage only)
 *   • Social links and WhatsApp FAB button
 *   • Phone numbers
 *   • Default meta description from site settings
 */
export async function renderFooter() {
  try {
    var results = await Promise.all([
      getSiteSettings(),
      getNavigation().catch(function () { return null; }),
      getCategoriesFromProducts().catch(function () { return null; }),
    ]);
    var settings   = results[0];
    var nav        = results[1];
    var categories = results[2];

    if (!settings) return;
    var lang = getLang();
    loadStrings(settings.uiStrings, lang);

    // ── Logos ───────────────────────────────────────────
    if (settings.logo) {
      var logoUrl = sanityImageUrl(settings.logo, 200);
      if (logoUrl) {
        document.querySelectorAll('.logo-img, .footer-logo').forEach(function (img) { img.src = logoUrl; });
      }
    }

    // ── Footer tagline (under logo) ─────────────────────
    var tagline = document.querySelector('.footer-about p');
    if (tagline && (settings.footerText || settings.footerTextEn)) {
      tagline.dataset.ge = settings.footerText || '';
      tagline.dataset.en = settings.footerTextEn || '';
      tagline.textContent = lang === 'ge'
        ? (settings.footerText || tagline.textContent)
        : (settings.footerTextEn || tagline.textContent);
    }

    // ── Footer quick links (from navigation.footerLinks) ──────
    if (nav && nav.footerLinks && nav.footerLinks.length) {
      var quickUl = null;
      document.querySelectorAll('.footer-col').forEach(function (col) {
        var h4 = col.querySelector('h4');
        if (h4 && (h4.dataset.ge === 'სწრაფი ბმულები' || h4.dataset.en === 'Quick Links')) {
          quickUl = col.querySelector('ul');
        }
      });
      if (quickUl) {
        quickUl.innerHTML = '';
        nav.footerLinks.forEach(function (item) {
          var label = lang === 'ge' ? (item.title || '') : (item.titleEn || item.title || '');
          var li = document.createElement('li');
          var a  = document.createElement('a');
          a.href = esc(item.link || '#');
          a.dataset.ge  = item.title   || '';
          a.dataset.en  = item.titleEn || '';
          a.textContent = label;
          if (item.openInNewTab) { a.target = '_blank'; a.rel = 'noopener noreferrer'; }
          li.appendChild(a);
          quickUl.appendChild(li);
        });
      }
    }

    // ── Footer categories column (from Sanity categories) ───
    if (categories && categories.length) {
      var catsUl = null;
      document.querySelectorAll('.footer-col').forEach(function (col) {
        var h4 = col.querySelector('h4');
        if (h4 && (h4.dataset.ge === 'კატეგორიები' || h4.dataset.en === 'Categories')) {
          catsUl = col.querySelector('ul');
        }
      });
      if (catsUl) {
        catsUl.innerHTML = '';
        categories.forEach(function (cat) {
          var label = lang === 'ge' ? (cat.title || '') : (cat.titleEn || cat.title || '');
          var li = document.createElement('li');
          var a  = document.createElement('a');
          a.href = '/products/?cat=' + esc(cat.slug || '');
          a.dataset.ge  = cat.title   || '';
          a.dataset.en  = cat.titleEn || '';
          a.textContent = label;
          li.appendChild(a);
          catsUl.appendChild(li);
        });
      }
    }

    // ── Footer contact (address, phone, email) ────────────
    var footerContactUl = document.querySelector('.footer-contact ul');
    if (footerContactUl) {
      // Address
      var addressLink = footerContactUl.querySelector('a[data-ge]');
      if (addressLink && settings.address) {
        addressLink.dataset.ge = settings.address || '';
        addressLink.dataset.en = settings.addressEn || '';
        addressLink.textContent = lang === 'ge' ? settings.address : (settings.addressEn || settings.address);
        if (settings.mapEmbedUrl) addressLink.href = settings.mapEmbedUrl;
      }

      // Phone numbers
      var footerPhones = footerContactUl.querySelector('.footer-phones');
      if (footerPhones) {
        var phones = [];
        if (settings.phoneNumber)  phones.push(settings.phoneNumber);
        if (settings.phoneNumber2) phones.push(settings.phoneNumber2);
        if (phones.length) {
          footerPhones.innerHTML = phones.map(function (num) {
            var cleaned = num.replace(/\D/g, '');
            return '<a href="tel:+' + esc(cleaned) + '">' + esc(num) + '</a>';
          }).join('\n');
        }
      }

      // Email
      var emailLink = footerContactUl.querySelector('a[href^="mailto:"]');
      if (emailLink && settings.contactEmail) {
        emailLink.href = 'mailto:' + settings.contactEmail;
        emailLink.textContent = settings.contactEmail;
      }
    }

    // ── Social links — footer, contact page, header ──────
    if (settings.socialLinks) {
      var sl = settings.socialLinks;

      // All .social-links wrappers (footer, contact etc.)
      document.querySelectorAll('.social-links').forEach(function (wrap) {
        if (sl.facebook) { var fb = wrap.querySelector('a[aria-label="Facebook"]');  if (fb) fb.href = sl.facebook; }
        if (sl.instagram) { var ig = wrap.querySelector('a[aria-label="Instagram"]'); if (ig) ig.href = sl.instagram; }
      });

      // FAB floating buttons
      if (sl.whatsapp)  { var fabWa = document.querySelector('.fab-social__item--whatsapp');  if (fabWa) fabWa.href = sl.whatsapp; }
      if (sl.facebook)  { var fabFb = document.querySelector('.fab-social__item--facebook');  if (fabFb) fabFb.href = sl.facebook; }
      if (sl.instagram) { var fabIg = document.querySelector('.fab-social__item--instagram'); if (fabIg) fabIg.href = sl.instagram; }
    }

    // ── Copyright / footer bottom line ─────────────────
    var footerBottom = document.querySelector('.footer-bottom p');
    if (footerBottom && (settings.copyrightText || settings.copyrightTextEn)) {
      footerBottom.dataset.ge = settings.copyrightText   || '';
      footerBottom.dataset.en = settings.copyrightTextEn || '';
      footerBottom.textContent = lang === 'ge'
        ? (settings.copyrightText   || footerBottom.textContent)
        : (settings.copyrightTextEn || footerBottom.textContent);
    }

    // ── Brand strip (homepage only — benign no-op on other pages) ──
    if (settings.brandFeatures && settings.brandFeatures.length) {
      var brandInner = document.querySelector('.brand-strip-inner');
      if (brandInner) {
        brandInner.innerHTML = '';
        settings.brandFeatures.forEach(function (feat) {
          var text    = lang === 'ge' ? (feat.text || '') : (feat.textEn || feat.text || '');
          var iconSvg = BRAND_ICONS[feat.icon] || '';
          var div = document.createElement('div');
          div.className = 'brand-feature';
          div.innerHTML =
            (iconSvg
              ? '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">' + iconSvg + '</svg>'
              : '') +
            '<span data-ge="' + esc(feat.text || '') + '" data-en="' + esc(feat.textEn || '') + '">' + esc(text) + '</span>';
          brandInner.appendChild(div);
        });
      }
    }

    // ── Page SEO: title, meta description, OG, Twitter ────
    // updatePageSeo() handles homepage + any page without its own renderer.
    // Pass null for 'page' here — updatePageSeo falls back to siteSettings.
    updatePageSeo(null, settings, lang);

    // OG image from site-level SEO (also handled inside updatePageSeo,
    // but kept here for the favicon + JSON-LD logo that follow)
    var seoOgImage = (settings.seo && settings.seo.openGraphImage)
      ? sanityImageUrl(settings.seo.openGraphImage, 1200) : '';

    // Favicon from Sanity siteSettings
    if (settings.favicon) {
      var favUrl = sanityImageUrl(settings.favicon, 64);
      if (favUrl) {
        document.querySelectorAll('link[rel~="icon"], link[rel="apple-touch-icon"]').forEach(function (el) {
          el.href = favUrl;
          el.removeAttribute('type'); // Sanity auto=format may change the mime type
        });
      }
    }

    // ── JSON-LD: update all fields from Sanity settings ─────────────────
    {
      var ldScript = document.querySelector('script[type="application/ld+json"]');
      if (ldScript) {
        try {
          var ld = JSON.parse(ldScript.textContent);
          // Logo
          if (settings.logo) {
            var logoJsonUrl = sanityImageUrl(settings.logo, 400);
            if (logoJsonUrl && ld.logo !== undefined) ld.logo = logoJsonUrl;
          }
          // Organization name
          if (settings.siteTitle && ld.name !== undefined) ld.name = settings.siteTitle;
          // sameAs — build from social links
          if (settings.socialLinks && ld.sameAs !== undefined) {
            var sl = settings.socialLinks;
            var sameAs = [sl.facebook, sl.instagram, sl.youtube, sl.tiktok].filter(Boolean);
            if (sameAs.length) ld.sameAs = sameAs;
          }
          // contactPoint.telephone / .email (Organization schema)
          if (ld.contactPoint) {
            if (settings.phoneNumber)  ld.contactPoint.telephone = settings.phoneNumber;
            if (settings.contactEmail) ld.contactPoint.email     = settings.contactEmail;
          }
          // telephone / email top-level (LocalBusiness schema)
          if (ld.telephone !== undefined && settings.phoneNumber)  ld.telephone = settings.phoneNumber;
          if (ld.email     !== undefined && settings.contactEmail) ld.email     = settings.contactEmail;
          // address.streetAddress (LocalBusiness schema)
          if (ld.address && settings.address) ld.address.streetAddress = settings.address;
          ldScript.textContent = JSON.stringify(ld);
        } catch (_) {}
      }
    }

  } catch (err) {
    console.warn('Footer / global settings fetch failed, keeping static HTML:', err);
  }
}

// ── Portable Text → Plain Text helper ───────────────
function blocksToText(blocks) {
  if (!blocks || !Array.isArray(blocks)) return '';
  return blocks
    .filter(function (b) { return b._type === 'block'; })
    .map(function (b) {
      return (b.children || []).map(function (c) { return c.text || ''; }).join('');
    })
    .join('\n\n');
}

// ── Per-page SEO updater ─────────────────────────────
/**
 * Update <title>, meta description, and Open Graph / Twitter tags from
 * Sanity page or site-settings data. Safe to call from any page renderer.
 *
 * Priority for each field (first truthy value wins):
 *   page.seo.* → page.title / page.heroHeading → siteSettings.*
 *
 * @param {object|null} page     - Sanity page document (may be null)
 * @param {object|null} settings - Sanity siteSettings document (may be null)
 * @param {string}      lang     - 'ge' | 'en'
 */
export function updatePageSeo(page, settings, lang) {
  var siteTitle = (settings && settings.siteTitle) ? settings.siteTitle : 'Ceramisia';

  // ── Resolve title ──────────────────────────────────
  var pageTitle = '';
  if (page) {
    if (page.seo && page.seo.title) {
      pageTitle = page.seo.title;
    } else {
      var ge = page.heroHeading || page.title || '';
      var en = page.heroHeadingEn || page.titleEn || ge;
      pageTitle = lang === 'ge' ? ge : en;
    }
  }
  var fullTitle = pageTitle ? (pageTitle + ' – ' + siteTitle) : siteTitle;
  document.title = fullTitle;

  // ── Resolve description ────────────────────────────
  var desc = '';
  if (page && page.seo && page.seo.description) {
    desc = page.seo.description;
  } else if (settings) {
    desc = lang === 'ge'
      ? (settings.homepageDescription || '')
      : (settings.homepageDescriptionEn || settings.homepageDescription || '');
  }

  if (desc) {
    var metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) {
      // Persist ge/en so applyLanguage() can toggle without hardcoded strings
      if (!metaDesc.dataset.ge && settings) {
        metaDesc.dataset.ge = settings.homepageDescription || desc;
        metaDesc.dataset.en = settings.homepageDescriptionEn || desc;
      }
      metaDesc.content = desc;
    }
  }

  // ── Resolve OG image URL ───────────────────────────
  var ogImgUrl = '';
  if (page && page.seo && page.seo.openGraphImage) {
    ogImgUrl = sanityImageUrl(page.seo.openGraphImage, 1200);
  } else if (settings && settings.seo && settings.seo.openGraphImage) {
    ogImgUrl = sanityImageUrl(settings.seo.openGraphImage, 1200);
  }

  // ── Open Graph ─────────────────────────────────────
  var og = {
    'og:title':       fullTitle,
    'og:description': desc,
  };
  if (ogImgUrl) {
    og['og:image']        = ogImgUrl;
    og['og:image:width']  = '1200';
    og['og:image:height'] = '630';
    og['og:image:type']   = 'image/webp';
  }
  Object.keys(og).forEach(function (prop) {
    if (!og[prop]) return;
    var el = document.querySelector('meta[property="' + prop + '"]');
    if (el) el.setAttribute('content', og[prop]);
  });

  // ── Twitter Card ───────────────────────────────────
  var tw = {
    'twitter:title':       fullTitle,
    'twitter:description': desc,
  };
  if (ogImgUrl) tw['twitter:image'] = ogImgUrl;
  Object.keys(tw).forEach(function (name) {
    if (!tw[name]) return;
    var el = document.querySelector('meta[name="' + name + '"]');
    if (el) el.setAttribute('content', tw[name]);
  });
}

/**
 * Inject (or replace) a BreadcrumbList JSON-LD `<script>` in `<head>`.
 * Call from any page renderer to add structured breadcrumb data.
 *
 * @param {Array<{name: string, url: string}>} crumbs
 *   Ordered list of breadcrumb items, starting with home.
 *   Example: [{ name: 'მთავარი', url: 'https://ceramisia.com/' },
 *             { name: 'პროდუქტები', url: 'https://ceramisia.com/products/' }]
 */
export function injectBreadcrumbJsonLd(crumbs) {
  if (!crumbs || !crumbs.length) return;
  var ld = {
    '@context': 'https://schema.org',
    '@type':    'BreadcrumbList',
    'itemListElement': crumbs.map(function (c, i) {
      return { '@type': 'ListItem', 'position': i + 1, 'name': c.name, 'item': c.url };
    }),
  };
  var sc = document.getElementById('breadcrumbJsonLd');
  if (!sc) {
    sc = document.createElement('script');
    sc.type = 'application/ld+json';
    sc.id   = 'breadcrumbJsonLd';
    document.head.appendChild(sc);
  }
  sc.textContent = JSON.stringify(ld);
}
