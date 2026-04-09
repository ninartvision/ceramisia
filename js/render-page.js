/**
 * Ceramisia – Dynamic Page Renderer (ES Module)
 * Renders arbitrary CMS pages (privacy, terms, etc.) from Sanity.
 * Includes a Portable Text → HTML converter for rich content.
 */

import { sanityImageUrl, getPage } from './sanity.js';

const LANG_KEY = 'ceramisia_lang';
function getLang() { return localStorage.getItem(LANG_KEY) || 'ge'; }
function esc(str) { if (!str) return ''; var el = document.createElement('span'); el.textContent = str; return el.innerHTML; }

// ── Portable Text → HTML ─────────────────────────────
function blocksToHtml(blocks) {
  if (!blocks || !blocks.length) return '';
  var html = '';
  var listType = null;

  for (var i = 0; i < blocks.length; i++) {
    var block = blocks[i];

    // Image block
    if (block._type === 'image') {
      if (listType) { html += listType === 'bullet' ? '</ul>' : '</ol>'; listType = null; }
      var src = sanityImageUrl(block, 800);
      var alt = esc((block.alt) || '');
      if (src) html += '<figure class="page-figure"><img src="' + src + '" alt="' + alt + '" loading="lazy"></figure>';
      continue;
    }

    // Only handle block type from here
    if (block._type !== 'block') continue;

    var style = block.style || 'normal';
    var text  = spansToHtml(block.children || [], block.markDefs || []);

    // Lists
    if (block.listItem) {
      var lt = block.listItem === 'number' ? 'ol' : 'ul';
      if (listType !== block.listItem) {
        if (listType) html += listType === 'bullet' ? '</ul>' : '</ol>';
        html += lt === 'ol' ? '<ol>' : '<ul>';
        listType = block.listItem;
      }
      html += '<li>' + text + '</li>';
      continue;
    }

    // Close any open list
    if (listType) { html += listType === 'bullet' ? '</ul>' : '</ol>'; listType = null; }

    // Block styles
    switch (style) {
      case 'h1': html += '<h1>' + text + '</h1>'; break;
      case 'h2': html += '<h2>' + text + '</h2>'; break;
      case 'h3': html += '<h3>' + text + '</h3>'; break;
      case 'h4': html += '<h4>' + text + '</h4>'; break;
      case 'blockquote': html += '<blockquote>' + text + '</blockquote>'; break;
      default: html += '<p>' + text + '</p>';
    }
  }

  // Close trailing list
  if (listType) html += listType === 'bullet' ? '</ul>' : '</ol>';
  return html;
}

function spansToHtml(children, markDefs) {
  var out = '';
  for (var i = 0; i < children.length; i++) {
    var span = children[i];
    var text = esc(span.text || '');
    if (!span.marks || !span.marks.length) { out += text; continue; }

    for (var m = 0; m < span.marks.length; m++) {
      var mark = span.marks[m];
      if (mark === 'strong')    { text = '<strong>' + text + '</strong>'; }
      else if (mark === 'em')   { text = '<em>' + text + '</em>'; }
      else if (mark === 'underline') { text = '<u>' + text + '</u>'; }
      else if (mark === 'code') { text = '<code>' + text + '</code>'; }
      else {
        // Annotation (link, etc.)
        var def = markDefs.filter(function (d) { return d._key === mark; })[0];
        if (def && def._type === 'link' && def.href) {
          text = '<a href="' + esc(def.href) + '" target="_blank" rel="noopener noreferrer">' + text + '</a>';
        }
      }
    }
    out += text;
  }
  return out;
}

// ── Page Renderer ────────────────────────────────────
export async function renderDynamicPage() {
  var container = document.getElementById('dynamicPageContent');
  if (!container) return;

  // Read slug from URL query param
  var params = new URLSearchParams(window.location.search);
  var slug   = params.get('slug');
  if (!slug) { showNotFound(container); return; }

  // Show loading
  container.innerHTML = '<div class="page-loading" style="text-align:center;padding:4rem 1rem"><p>იტვირთება...</p></div>';

  try {
    var page = await getPage(slug);
    if (!page) { showNotFound(container); return; }

    var lang = getLang();
    var title   = lang === 'en' && page.titleEn   ? page.titleEn   : page.title   || '';
    var heading = lang === 'en' && page.heroHeadingEn ? page.heroHeadingEn : page.heroHeading || '';
    var subtext = lang === 'en' && page.heroSubtextEn ? page.heroSubtextEn : page.heroSubtext || '';

    // Update document title
    document.title = esc(title) + ' – Ceramisia';

    // Update canonical URL
    var canonical = document.querySelector('link[rel="canonical"]');
    if (canonical) canonical.href = 'https://ninartvision.github.io/ceramisia/' + encodeURIComponent(slug);

    // Build page HTML
    var html = '';

    // Hero area (if hero heading exists)
    if (heading) {
      var heroImg = page.heroImage ? sanityImageUrl(page.heroImage, 1920) : '';
      html += '<section class="page-hero"' + (heroImg ? ' style="background-image:url(' + heroImg + ')"' : '') + '>';
      html += '<div class="container">';
      if (subtext) html += '<span class="section-label">' + esc(subtext) + '</span>';
      html += '<h1>' + esc(heading) + '</h1>';
      html += '</div></section>';
    } else {
      // Simple title header
      html += '<section class="page-header"><div class="container"><h1>' + esc(title) + '</h1></div></section>';
    }

    // Sections (Portable Text content)
    if (page.sections && page.sections.length) {
      html += '<div class="page-sections">';
      for (var i = 0; i < page.sections.length; i++) {
        var sec = page.sections[i];
        var secHeading = lang === 'en' && sec.headingEn ? sec.headingEn : sec.heading || '';
        var secText    = lang === 'en' && sec.textEn    ? sec.textEn    : sec.text    || [];
        var secImg     = sec.image ? sanityImageUrl(sec.image, 800) : '';

        html += '<section class="page-section section"><div class="container">';
        if (secHeading) html += '<h2>' + esc(secHeading) + '</h2>';
        if (Array.isArray(secText) && secText.length) {
          html += '<div class="page-section__body">' + blocksToHtml(secText) + '</div>';
        }
        if (secImg) {
          html += '<figure class="page-section__image"><img src="' + secImg + '" alt="' + esc(secHeading) + '" loading="lazy"></figure>';
        }
        html += '</div></section>';
      }
      html += '</div>';
    }

    container.innerHTML = html;

  } catch (err) {
    console.error('Ceramisia: page render error', err);
    showNotFound(container);
  }
}

function showNotFound(container) {
  var lang = getLang();
  document.title = (lang === 'en' ? 'Page Not Found' : 'გვერდი ვერ მოიძებნა') + ' – Ceramisia';
  container.innerHTML =
    '<section class="page-header" style="text-align:center;padding:6rem 1rem">' +
    '<div class="container">' +
    '<h1>' + (lang === 'en' ? 'Page Not Found' : 'გვერდი ვერ მოიძებნა') + '</h1>' +
    '<p style="margin-top:1rem">' + (lang === 'en' ? 'The page you are looking for does not exist.' : 'მოთხოვნილი გვერდი არ არსებობს.') + '</p>' +
    '<a href="index.html" class="btn btn-primary" style="margin-top:2rem">' + (lang === 'en' ? 'Back to Home' : 'მთავარზე დაბრუნება') + '</a>' +
    '</div></section>';
}
