/**
 * Ceramisia – About Page Renderer (ES Module)
 * Populates the about page hero, values, and team from Sanity CMS.
 * Static HTML remains as fallback.
 */

import { imageUrlBuilder, urlFor, sanityImageUrl, getPage, getSiteSettings, getHomepage } from './sanity.js';
import { updatePageSeo, injectBreadcrumbJsonLd } from './render-home.js';
import { t } from './ui.js';

const LANG_KEY = 'ceramisia_lang';
function getLang() { return localStorage.getItem(LANG_KEY) || 'ge'; }
function esc(str) { if (!str) return ''; var el = document.createElement('span'); el.textContent = str; return el.innerHTML; }

export async function renderAboutPage() {
  // Only run on about page
  if (!document.querySelector('.about-hero')) return;

  try {
    var lang = getLang();
    // Try slug 'about' first (recommended by schema), fallback to 'about-us'
    // Root cause: if your Sanity document slug is 'about' but code queries 'about-us',
    // page returns null and all image rendering is silently skipped.
    var page = await getPage('about').catch(function () { return null; });
    if (!page) {
      console.warn('[About] getPage("about") returned null — trying "about-us" fallback');
      page = await getPage('about-us').catch(function () { return null; });
    }
    if (!page) {
      console.error('[About] ✗ No page document found for slugs "about" or "about-us".\n' +
        '  → Open Sanity Studio → Pages → check that your about page exists and is PUBLISHED.\n' +
        '  → Check its Slug field — it must be exactly "about" (all lowercase, no spaces).');
    } else {
      console.log('[About] ✓ Page doc loaded (slug: "' + page.slug + '")');
      console.log('[About] heroImage:', page.heroImage || '(null — upload an image in Sanity Studio → Pages → About → Hero Image)');
    }

    var settings = await getSiteSettings().catch(function () { return null; });

    // ── Always attempt founder card — even without a page doc.
    // renderFounderCard() has its own fallback chain:
    //   teamMembers[0].photo → homepage.founderImage → static /images/tea.png
    await renderFounderCard(page ? (page.teamMembers || []) : [], lang);

    // ── Rest of page rendering requires the page doc ─────────
    if (!page) return;

    // ── Per-page SEO ─────────────────────────────────
    updatePageSeo(page, settings, lang);
    injectBreadcrumbJsonLd([
      { name: t('pageHome'), url: 'https://ceramisia.com/' },
      { name: t('pageAbout'), url: 'https://ceramisia.com/about/' },
    ]);

    // ── Hero section ─────────────────────────────
    var heading = lang === 'ge' ? (page.heroHeading || '') : (page.heroHeadingEn || page.heroHeading || '');
    var subtext = lang === 'ge' ? (page.heroSubtext || '') : (page.heroSubtextEn || page.heroSubtext || '');

    var h1 = document.querySelector('.about-hero-text h1');
    if (h1 && heading) {
      h1.dataset.ge = page.heroHeading || '';
      h1.dataset.en = page.heroHeadingEn || '';
      h1.textContent = heading;
    }

    var p = document.querySelector('.about-hero-text > p');
    if (p && subtext) {
      p.dataset.ge = page.heroSubtext || '';
      p.dataset.en = page.heroSubtextEn || '';
      p.textContent = subtext;
    }

    // Hero image — Sanity CDN with local fallback when image is missing or invalid
    var imageWrap = document.querySelector('.about-hero-image');
    if (imageWrap) {
      var HERO_FALLBACK = '/images/tea.png'; // local file, always available
      var imgUrl        = '';
      var imgSrcset     = '';
      var imgAlt        = esc(heading || 'Ceramisia');
      var usingFallback = false;

      if (page.heroImage && page.heroImage.asset && page.heroImage.asset._ref) {
        var _sanityUrl = sanityImageUrl(page.heroImage, 900);
        if (_sanityUrl) {
          imgUrl    = _sanityUrl;
          imgSrcset = [480, 700, 900].map(function (w) {
            return sanityImageUrl(page.heroImage, w) + ' ' + w + 'w';
          }).join(', ');
          imgAlt = page.heroImage.alt || imgAlt;
          console.log('[About] ✓ Hero image URL (Sanity):', imgUrl);
        } else {
          usingFallback = true;
          console.warn('[About] ✗ sanityImageUrl() returned empty — using local fallback.',
            '\n  heroImage received:', page.heroImage);
        }
      } else {
        usingFallback = true;
        console.warn('[About] ✗ page.heroImage missing or has no asset._ref — using local fallback.',
          '\n  → Upload a Hero Image in Sanity Studio → Pages → About → Hero Image and PUBLISH.');
      }

      if (usingFallback) {
        imgUrl = HERO_FALLBACK;
      }

      console.log('[About] Using image:', imgUrl);

      imageWrap.innerHTML =
        '<img src="' + esc(imgUrl) + '"' +
        (imgSrcset ? ' srcset="' + esc(imgSrcset) + '" sizes="(max-width:768px) 100vw, 50vw"' : '') +
        ' alt="' + esc(imgAlt) + '"' +
        ' class="about-img"' +
        ' loading="eager" decoding="async">';
    }

    // ── Content Sections (values, team, etc.) ────
    if (page.sections && page.sections.length) {
      renderAboutSections(page.sections, lang);
    }

    // ── Team grid ────────────────────────────────
    renderTeamGrid(page.teamMembers || [], lang);

  } catch (err) {
    console.warn('About page fetch failed, keeping static HTML:', err);
  }
}

/**
 * Populates the static .team-founder card from Sanity data.
 *
 * Priority:
 *  1. page.teamMembers[0].photo  (from the "about-us" page doc in Studio)
 *  2. homepage.founderImage      (from the Homepage Layout singleton in Studio)
 *  3. /images/tea.png            (static fallback — always works)
 *
 * Text (name, role, secondary) follows the same priority:
 *  page.teamMembers[0] → homepage.founder* → existing static HTML
 */
async function renderFounderCard(teamMembers, lang) {
  var imgEl       = document.getElementById('founderImg');
  var nameEl      = document.getElementById('founderName');
  var roleEl      = document.getElementById('founderRole');
  var secondaryEl = document.getElementById('founderSecondary');

  if (!imgEl) return; // not on about page

  // ── Resolve image source ─────────────────────
  var photoRef = null;
  var altText  = '';

  // Priority 1 — first team member's photo
  var m0 = Array.isArray(teamMembers) && teamMembers[0];
  if (m0 && m0.photo && m0.photo.asset && m0.photo.asset._ref) {
    photoRef = m0.photo;
    altText  = (m0.photo.alt) || (lang === 'ge' ? (m0.name || '') : (m0.nameEn || m0.name || ''));
    console.log('[Founder] ✓ Priority 1 — using teamMembers[0].photo, _ref:', photoRef.asset._ref);
  } else {
    console.log('[Founder] Priority 1 skipped — no teamMembers[0].photo._ref in page doc',
      m0 ? '(member exists but photo missing)' : '(no team members)');
  }

  // Priority 2 — homepage.founderImage
  if (!photoRef) {
    try {
      var homepage = await getHomepage();
      console.log('[Founder] Priority 2 — homepage raw:', homepage);

      if (!homepage) {
        console.warn('[Founder] ✗ getHomepage() returned null — check that a homepage document is published in Sanity Studio');
      } else if (!homepage.founderImage) {
        console.warn('[Founder] ✗ homepage.founderImage is null/undefined — upload an image to the Homepage Layout document in Sanity Studio (Founder Image field)');
      } else if (!homepage.founderImage.asset || !homepage.founderImage.asset._ref) {
        console.warn('[Founder] ✗ homepage.founderImage exists but asset._ref is missing — GROQ projection may be wrong. Received:', homepage.founderImage);
      } else {
        photoRef = homepage.founderImage;
        altText  = homepage.founderImage.alt || altText;
        console.log('[Founder] ✓ Priority 2 — using homepage.founderImage, _ref:', photoRef.asset._ref);

        // Also populate text from homepage fields if not overridden by teamMembers
        if (!m0) {
          var founderName = lang === 'ge'
            ? (homepage.founderName || '')
            : (homepage.founderNameEn || homepage.founderName || '');
          var founderRole = lang === 'ge'
            ? (homepage.founderRole || '')
            : (homepage.founderRoleEn || homepage.founderRole || '');
          var founderSec = lang === 'ge'
            ? (homepage.founderSecondary || '')
            : (homepage.founderSecondaryEn || homepage.founderSecondary || '');

          if (nameEl && founderName) nameEl.textContent = founderName;
          if (roleEl && founderRole) {
            roleEl.dataset.ge = homepage.founderRole || '';
            roleEl.dataset.en = homepage.founderRoleEn || '';
            roleEl.textContent = founderRole;
          }
          if (secondaryEl && founderSec) {
            secondaryEl.dataset.ge = homepage.founderSecondary || '';
            secondaryEl.dataset.en = homepage.founderSecondaryEn || '';
            secondaryEl.textContent = founderSec;
          }
        }
      }
    } catch (err) {
      console.error('[Founder] ✗ getHomepage() threw an error (likely CORS or network):', err.message || err,
        '\n  → Fix: add', window.location.origin, 'to CORS origins at https://sanity.io/manage');
    }
  }

  // ── Set image src ────────────────────────────
  if (photoRef) {
    var imgUrl = urlFor(photoRef).width(600).url();
    console.log('[Founder] ✓ Generated CDN URL:', imgUrl);
    if (imgUrl) {
      imgEl.src = imgUrl;
      if (altText) imgEl.alt = altText;
    } else {
      console.warn('[Founder] urlFor() returned empty string — check sanityImageUrl() builder for asset._ref format');
    }
  } else {
    console.log('[Founder] ℹ Priority 3 — no Sanity image found, keeping static fallback:', imgEl.src);
  }

  // ── Populate text from page.teamMembers[0] ───
  if (m0) {
    var name = lang === 'ge' ? (m0.name || '') : (m0.nameEn || m0.name || '');
    var role = lang === 'ge' ? (m0.role || '') : (m0.roleEn || m0.role || '');

    if (nameEl && name) nameEl.textContent = name;
    if (roleEl && role) {
      roleEl.dataset.ge = m0.role || '';
      roleEl.dataset.en = m0.roleEn || '';
      roleEl.textContent = role;
    }
  }
}

function renderAboutSections(sections, lang) {
  // Map sections by index to known page areas
  // Section 0 → Values heading, Section 1+ → any additional content
  var valuesHeader = document.querySelector('.about-values')
    ? document.querySelector('.about-values').closest('.section').querySelector('.section-header')
    : null;

  sections.forEach(function (s, i) {
    // Try to update section headers that match
    var heading = lang === 'ge' ? (s.heading || '') : (s.headingEn || s.heading || '');

    if (i === 0 && valuesHeader) {
      var h2 = valuesHeader.querySelector('h2');
      if (h2 && heading) {
        h2.dataset.ge = s.heading || '';
        h2.dataset.en = s.headingEn || '';
        h2.textContent = heading;
      }
    }
  });
}

function renderTeamGrid(members, lang) {
  var grid = document.getElementById('teamGrid');
  if (!grid) return;

  var teamSection = grid.closest('.section');

  if (!members || !members.length) {
    // Hide the whole team section — no Sanity data to show
    if (teamSection) teamSection.classList.add('section--hidden');
    return;
  }

  var frag = document.createDocumentFragment();
  members.forEach(function (m, i) {
    var name    = lang === 'ge' ? (m.name || '') : (m.nameEn || m.name || '');
    var role    = lang === 'ge' ? (m.role || '') : (m.roleEn || m.role || '');
    var imgUrl  = sanityImageUrl(m.photo, 600);
    var altText = (m.photo && m.photo.alt) ? m.photo.alt : esc(name);

    var card = document.createElement('div');
    card.className = 'team-card';
    card.setAttribute('data-reveal', '');
    card.setAttribute('data-reveal-delay', String(i * 120));

    card.innerHTML =
      '<div class="team-card-img">' +
        (imgUrl
          ? '<img src="' + esc(imgUrl) + '" alt="' + esc(altText) + '" loading="lazy">'
          : '<div style="aspect-ratio:1;background:var(--clr-bg-alt,#f5f0eb)"></div>') +
      '</div>' +
      '<div class="team-card-info">' +
        '<h3 data-ge="' + esc(m.name || '') + '" data-en="' + esc(m.nameEn || '') + '">' + esc(name) + '</h3>' +
        '<span data-ge="' + esc(m.role || '') + '" data-en="' + esc(m.roleEn || '') + '">' + esc(role) + '</span>' +
      '</div>';

    frag.appendChild(card);
  });

  grid.innerHTML = '';       // single clear
  grid.appendChild(frag);   // single insert
  if (teamSection) teamSection.classList.remove('section--hidden');
}
