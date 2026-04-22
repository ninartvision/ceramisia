/**
 * Ceramisia – UI String Store (ES Module)
 *
 * Single source of truth for every visible UI string — button labels,
 * badge names, status messages, section headings, and breadcrumb names.
 *
 * Workflow:
 *  1. Page loads immediately — hardcoded DEFAULTS ensure text always shows.
 *  2. renderFooter() calls loadStrings(settings.uiStrings, lang) once Sanity
 *     data arrives, silently overriding any defaults the editor has customised.
 *  3. Language switch → setLang() updates _lang so t() returns the right text.
 *
 * Usage:
 *   import { t, tge, ten, loadStrings, setLang } from './ui.js';
 *
 *   t('addToCart')     → visible text in the current language
 *   tge('addToCart')   → Georgian string  (for data-ge="…" attributes)
 *   ten('addToCart')   → English string   (for data-en="…" attributes)
 */

// ── Hardcoded ultimate fallbacks ─────────────────────────────────────────────
// These match the values pre-filled as initialValue in the Sanity schema so
// the site looks correct even before siteSettings data has loaded.
var DEFAULTS = {
  // ── Product actions ──────────────────────────────
  addToCart:             'კალათაში',
  addToCartEn:           'Add to Cart',
  buyNow:                'ყიდვა',
  buyNowEn:              'Buy Now',

  // ── Filter bar ───────────────────────────────────
  filterAll:             'ყველა',
  filterAllEn:           'All',

  // ── Product badges ───────────────────────────────
  badgeNew:              'ახალი',
  badgeNewEn:            'New',
  badgeSale:             'ფასდაკლება',
  badgeSaleEn:           'Sale',
  badgeBestseller:       'ბესტსელერი',
  badgeBestsellerEn:     'Bestseller',

  // ── Status / feedback messages ───────────────────
  loading:               'იტვირთება...',
  loadingEn:             'Loading...',
  noProducts:            'პროდუქტები ვერ მოიძებნა',
  noProductsEn:          'No products found',
  loadFailed:            'პროდუქტები ვერ ჩაიტვირთა. გთხოვთ სცადოთ მოგვიანებით.',
  loadFailedEn:          'Failed to load products. Please try again later.',

  // ── Buttons ──────────────────────────────────────
  viewAll:               'ყველა პროდუქტი',
  viewAllEn:             'View All Products',
  viewAllProducts:       'ყველა პროდუქტის ნახვა',
  viewAllProductsEn:     'View All Products',
  viewProducts:          'პროდუქტების ნახვა',
  viewProductsEn:        'View Products',
  readMore:              'სრულად წაკითხვა',
  readMoreEn:            'Read More',
  learnMore:             'გაიგე მეტი',
  learnMoreEn:           'Learn More',

  // ── Section defaults ─────────────────────────────
  categoriesHeading:     'აღმოაჩინე კოლექცია',
  categoriesHeadingEn:   'Browse by Collection',
  categoriesLabel:       'კატეგორიები',
  categoriesLabelEn:     'Categories',
  featuredHeading:       'რჩეული პროდუქტები',
  featuredHeadingEn:     'Top Picks',
  featuredLabel:         'პოპულარული',
  featuredLabelEn:       'Popular',
  aboutLabel:            'ჩვენ შესახებ',
  aboutLabelEn:          'About Us',
  blogHeading:           'ბლოგი',
  blogHeadingEn:         'Blog',
  blogLabel:             'სტატიები',
  blogLabelEn:           'Articles',

  // ── Page / breadcrumb names ──────────────────────
  pageHome:              'მთავარი',
  pageHomeEn:            'Home',
  pageProducts:          'პროდუქტები',
  pageProductsEn:        'Products',
  pageAbout:             'ჩვენ შესახებ',
  pageAboutEn:           'About',
  pageContact:           'კონტაქტი',
  pageContactEn:         'Contact',
};

// Active store — starts as a copy of DEFAULTS, overridden by Sanity data.
var _store = Object.assign({}, DEFAULTS);
var _lang  = 'ge';

/**
 * Populate the string store from Sanity siteSettings.uiStrings.
 * Call once inside renderFooter() as soon as settings are available.
 * Non-empty string values from Sanity silently shadow the defaults.
 *
 * @param {object|null} uiStrings  siteSettings.uiStrings from Sanity
 * @param {string}      lang       'ge' | 'en'
 */
export function loadStrings(uiStrings, lang) {
  _lang = lang || 'ge';
  if (!uiStrings || typeof uiStrings !== 'object') return;
  Object.keys(uiStrings).forEach(function (k) {
    if (typeof uiStrings[k] === 'string' && uiStrings[k]) {
      _store[k] = uiStrings[k];
    }
  });
}

/**
 * Update the active language without re-fetching strings.
 * Mirror the LANG_KEY localStorage change here so t() stays in sync.
 * @param {string} lang  'ge' | 'en'
 */
export function setLang(lang) { _lang = lang || 'ge'; }

/**
 * Get the UI string for the current language.
 * Falls back to Georgian, then to the compiled DEFAULTS.
 * @param {string} key  e.g. 'addToCart'
 * @returns {string}
 */
export function t(key) {
  if (_lang !== 'ge') {
    var enVal = _store[key + 'En'];
    if (enVal) return enVal;
  }
  return _store[key] || DEFAULTS[key] || '';
}

/**
 * Always return the Georgian string (for data-ge="…" attributes).
 * @param {string} key
 * @returns {string}
 */
export function tge(key) {
  return _store[key] || DEFAULTS[key] || '';
}

/**
 * Always return the English string (for data-en="…" attributes).
 * @param {string} key
 * @returns {string}
 */
export function ten(key) {
  return _store[key + 'En'] || DEFAULTS[key + 'En'] || '';
}
