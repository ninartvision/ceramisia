/**
 * Ceramisia – About Page Renderer (ES Module)
 * Populates the about page hero, values, and team from Sanity CMS.
 * Static HTML remains as fallback.
 */

import { sanityImageUrl, getPage } from './sanity.js';

const LANG_KEY = 'ceramisia_lang';
function getLang() { return localStorage.getItem(LANG_KEY) || 'ge'; }
function esc(str) { if (!str) return ''; var el = document.createElement('span'); el.textContent = str; return el.innerHTML; }

export async function renderAboutPage() {
  // Only run on about page
  if (!document.querySelector('.about-hero')) return;

  try {
    var page = await getPage('about');
    if (!page) return;

    var lang = getLang();

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

    // Hero image
    var imageWrap = document.querySelector('.about-hero-image');
    if (imageWrap) {
      if (page.heroImage) {
        var imgUrl = sanityImageUrl(page.heroImage, 800);
        if (imgUrl) {
          imageWrap.innerHTML = '<img src="' + esc(imgUrl) + '" alt="' + esc(heading || 'Ceramisia') + '" loading="lazy">';
        } else {
          imageWrap.classList.add('section--hidden');
        }
      } else {
        imageWrap.classList.add('section--hidden');
      }
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
