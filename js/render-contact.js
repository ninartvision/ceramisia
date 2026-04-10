/**
 * Ceramisia – Contact Page Renderer (ES Module)
 * Populates contact info from Sanity siteSettings.
 * Static HTML remains as fallback.
 */

import { sanityImageUrl, getPage, getSiteSettings } from './sanity.js';

const LANG_KEY = 'ceramisia_lang';
function getLang() { return localStorage.getItem(LANG_KEY) || 'ge'; }

export async function renderContactPage() {
  // Only run on contact page
  var contactLayout = document.querySelector('.contact-layout');
  if (!contactLayout) return;

  try {
    var results = await Promise.all([getSiteSettings(), getPage('contact')]);
    var settings = results[0];
    var page     = results[1];

    var lang = getLang();

    // ── Page header ──────────────────────────────
    if (page) {
      var sectionHeader = document.querySelector('.contact-layout').closest('.section').querySelector('.section-header');
      if (sectionHeader) {
        var h2 = sectionHeader.querySelector('h2');
        var p  = sectionHeader.querySelector('p');
        if (h2 && page.heroHeading) {
          h2.dataset.ge = page.heroHeading || '';
          h2.dataset.en = page.heroHeadingEn || '';
          h2.textContent = lang === 'ge' ? page.heroHeading : (page.heroHeadingEn || page.heroHeading);
        }
        if (p && page.heroSubtext) {
          p.dataset.ge = page.heroSubtext || '';
          p.dataset.en = page.heroSubtextEn || '';
          p.textContent = lang === 'ge' ? page.heroSubtext : (page.heroSubtextEn || page.heroSubtext);
        }
      }

      // Banner image
      if (page.heroImage) {
        var banner = document.querySelector('.page-banner');
        if (banner) {
          var imgUrl = sanityImageUrl(page.heroImage, 1920);
          if (imgUrl) banner.style.backgroundImage = "url('" + imgUrl + "')";
        }
      }
    }

    if (!settings) return;

    // ── Address ──────────────────────────────────
    var addressItem = contactLayout.querySelector('.contact-info-text a[data-ge]');
    if (addressItem && settings.address) {
      addressItem.dataset.ge = settings.address || '';
      addressItem.dataset.en = settings.addressEn || '';
      addressItem.textContent = lang === 'ge' ? settings.address : (settings.addressEn || settings.address);
      if (settings.mapEmbedUrl) addressItem.href = settings.mapEmbedUrl;
    }

    // ── Phone numbers ────────────────────────────
    var phonesWrap = contactLayout.querySelector('.contact-phones');
    if (phonesWrap) {
      var phones = [];
      if (settings.phoneNumber) phones.push(settings.phoneNumber);
      if (settings.phoneNumber2) phones.push(settings.phoneNumber2);
      if (phones.length) {
        phonesWrap.innerHTML = phones.map(function (num) {
          var cleaned = num.replace(/\D/g, '');
          return '<a href="tel:+' + cleaned + '">' + num + '</a>';
        }).join('\n');
      }
    }

    // ── Email ────────────────────────────────────
    var emailLink = contactLayout.querySelector('a[href^="mailto:"]');
    if (emailLink && settings.contactEmail) {
      emailLink.href = 'mailto:' + settings.contactEmail;
      emailLink.textContent = settings.contactEmail;
    }

    // ── Working hours ────────────────────────────
    var hoursItems = contactLayout.querySelectorAll('.contact-info-item');
    hoursItems.forEach(function (item) {
      var h4 = item.querySelector('h4');
      if (h4 && (h4.dataset.ge === 'სამუშაო საათები' || h4.dataset.en === 'Working Hours')) {
        var pEl = item.querySelector('.contact-info-text p');
        if (pEl && (settings.workingHours || settings.workingHoursEn)) {
          pEl.dataset.ge = settings.workingHours || '';
          pEl.dataset.en = settings.workingHoursEn || '';
          pEl.textContent = lang === 'ge'
            ? (settings.workingHours || pEl.textContent)
            : (settings.workingHoursEn || pEl.textContent);
        }
      }
    });

    // ── Social links ─────────────────────────────
    if (settings.socialLinks) {
      var sl = settings.socialLinks;
      contactLayout.querySelectorAll('.social-links').forEach(function (wrap) {
        var fb = wrap.querySelector('a[aria-label="Facebook"]');
        var ig = wrap.querySelector('a[aria-label="Instagram"]');
        if (fb && sl.facebook) fb.href = sl.facebook;
        if (ig && sl.instagram) ig.href = sl.instagram;
      });
    }

  } catch (err) {
    console.warn('Contact page fetch failed, keeping static HTML:', err);
  }
}
