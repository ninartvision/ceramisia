// sanity-studio/schemaTypes/siteSettings.js
// Global site settings — singleton document

export default {
  icon: () => '⚙️',
  name: 'siteSettings',
  title: 'Site Settings',
  type: 'document',
  groups: [
    { name: 'general', title: 'General', default: true },
    { name: 'contact', title: 'Contact Info' },
    { name: 'social', title: 'Social Links' },
    { name: 'seo', title: 'Default SEO' },
    { name: 'ui', title: 'UI Text' },
  ],
  fields: [
    // ── General ────────────────────────────────────────
    {
      name: 'siteTitle',
      title: 'Site Title',
      type: 'string',
      group: 'general',
      validation: (Rule) => Rule.required(),
    },
    {
      name: 'logo',
      title: 'Logo',
      type: 'image',
      group: 'general',
      options: { hotspot: true },
    },
    {
      name: 'logoDark',
      title: 'Logo (Dark Version)',
      type: 'image',
      group: 'general',
      description: 'Optional dark/inverted logo for light backgrounds',
      options: { hotspot: true },
    },
    {
      name: 'favicon',
      title: 'Favicon',
      type: 'image',
      group: 'general',
    },
    {
      name: 'homepageTitle',
      title: 'Homepage Title (GE)',
      type: 'string',
      group: 'general',
    },
    {
      name: 'homepageTitleEn',
      title: 'Homepage Title (EN)',
      type: 'string',
      group: 'general',
    },
    {
      name: 'homepageDescription',
      title: 'Homepage Description (GE)',
      type: 'text',
      rows: 3,
      group: 'general',
    },
    {
      name: 'homepageDescriptionEn',
      title: 'Homepage Description (EN)',
      type: 'text',
      rows: 3,
      group: 'general',
    },
    {
      name: 'heroImage',
      title: 'Hero Image',
      type: 'image',
      group: 'general',
      options: { hotspot: true },
      description: 'Main hero/banner image for the homepage',
    },

    // ── Contact ────────────────────────────────────────
    {
      name: 'contactEmail',
      title: 'Contact Email',
      type: 'string',
      group: 'contact',
      validation: (Rule) => Rule.email(),
    },
    {
      name: 'phoneNumber',
      title: 'Phone Number (Primary)',
      type: 'string',
      group: 'contact',
    },
    {
      name: 'phoneNumber2',
      title: 'Phone Number (Secondary)',
      type: 'string',
      group: 'contact',
    },
    {
      name: 'address',
      title: 'Address (GE)',
      type: 'text',
      rows: 2,
      group: 'contact',
    },
    {
      name: 'addressEn',
      title: 'Address (EN)',
      type: 'text',
      rows: 2,
      group: 'contact',
    },
    {
      name: 'mapEmbedUrl',
      title: 'Google Maps Link URL',
      type: 'url',
      group: 'contact',
      description: 'Link to Google Maps location',
    },
    {
      name: 'workingHours',
      title: 'Working Hours (GE)',
      type: 'string',
      group: 'contact',
    },
    {
      name: 'workingHoursEn',
      title: 'Working Hours (EN)',
      type: 'string',
      group: 'contact',
    },
    {
      name: 'footerText',
      title: 'Footer Tagline (GE)',
      type: 'string',
      group: 'general',
    },
    {
      name: 'footerTextEn',
      title: 'Footer Tagline (EN)',
      type: 'string',
      group: 'general',
    },
    {
      name: 'copyrightText',
      title: 'Copyright Line (GE)',
      type: 'string',
      group: 'general',
      description: 'Shown at the very bottom of the footer, e.g. "© 2026 Ceramisia. ყველა უფლება დაცულია."',
    },
    {
      name: 'copyrightTextEn',
      title: 'Copyright Line (EN)',
      type: 'string',
      group: 'general',
    },

    // ── Brand Strip ────────────────────────────────────
    {
      name: 'brandFeatures',
      title: '✨ Brand Strip Features',
      type: 'array',
      group: 'general',
      description: 'Trust badges shown below the hero slider on the homepage. Drag to reorder.',
      of: [
        {
          type: 'object',
          name: 'brandFeature',
          title: 'Feature Badge',
          fields: [
            {
              name: 'icon',
              title: 'Icon',
              type: 'string',
              options: {
                list: [
                  { title: '🛡 Shield – Quality / Security', value: 'shield' },
                  { title: '⏱ Clock – Speed / Delivery', value: 'clock' },
                  { title: '❤️ Heart – Handmade / Custom', value: 'heart' },
                  { title: '🎁 Gift – Packaging', value: 'gift' },
                  { title: '🚚 Truck – Shipping', value: 'truck' },
                  { title: '⭐ Star – Premium Quality', value: 'star' },
                ],
                layout: 'dropdown',
              },
            },
            {
              name: 'text',
              title: 'Text (Georgian)',
              type: 'string',
              validation: (Rule) => Rule.required(),
            },
            {
              name: 'textEn',
              title: 'Text (English)',
              type: 'string',
              validation: (Rule) => Rule.required(),
            },
          ],
          preview: {
            select: { title: 'text', subtitle: 'textEn' },
          },
        },
      ],
    },

    {
      name: 'featuredProductCount',
      title: 'Featured Products Count',
      type: 'number',
      group: 'general',
      description: 'How many products to show in the homepage featured section (default: 4)',
      initialValue: 4,
      validation: (Rule) => Rule.min(1).max(12),
    },

    // ── Social Links ───────────────────────────────────
    {
      name: 'socialLinks',
      title: 'Social Media Links',
      type: 'object',
      group: 'social',
      fields: [
        { name: 'instagram', title: 'Instagram URL', type: 'url' },
        { name: 'facebook', title: 'Facebook URL', type: 'url' },
        { name: 'whatsapp', title: 'WhatsApp URL (wa.me link)', type: 'url', description: 'e.g. https://wa.me/995597224407 — used for the floating contact button' },
        { name: 'tiktok', title: 'TikTok URL', type: 'url' },
        { name: 'pinterest', title: 'Pinterest URL', type: 'url' },
        { name: 'etsy', title: 'Etsy Shop URL', type: 'url' },
        { name: 'youtube', title: 'YouTube URL', type: 'url' },
      ],
    },

    // ── Default SEO ────────────────────────────────────
    {
      name: 'seo',
      title: 'Default SEO',
      type: 'seo',
      group: 'seo',
      description: 'Fallback meta tags used when pages don\'t define their own',
    },

    // ── UI Text / Strings ──────────────────────────────
    {
      name: 'uiStrings',
      title: 'UI Text & Labels',
      description: 'Edit any button, badge, message or section heading here — no code changes needed.',
      type: 'object',
      group: 'ui',
      fields: [
        // Product actions
        { name: 'addToCart',             title: 'Add to Cart (GE)',                    type: 'string', initialValue: 'კალათაში' },
        { name: 'addToCartEn',           title: 'Add to Cart (EN)',                    type: 'string', initialValue: 'Add to Cart' },
        { name: 'filterAll',             title: 'Filter — All (GE)',                   type: 'string', initialValue: 'ყველა' },
        { name: 'filterAllEn',           title: 'Filter — All (EN)',                   type: 'string', initialValue: 'All' },
        // Badges
        { name: 'badgeNew',              title: 'Badge — New (GE)',                    type: 'string', initialValue: 'ახალი' },
        { name: 'badgeNewEn',            title: 'Badge — New (EN)',                    type: 'string', initialValue: 'New' },
        { name: 'badgeSale',             title: 'Badge — Sale (GE)',                   type: 'string', initialValue: 'ფასდაკლება' },
        { name: 'badgeSaleEn',           title: 'Badge — Sale (EN)',                   type: 'string', initialValue: 'Sale' },
        { name: 'badgeBestseller',       title: 'Badge — Bestseller (GE)',             type: 'string', initialValue: 'ბესტსელერი' },
        { name: 'badgeBestsellerEn',     title: 'Badge — Bestseller (EN)',             type: 'string', initialValue: 'Bestseller' },
        // Status messages
        { name: 'loading',               title: 'Message — Loading (GE)',              type: 'string', initialValue: 'იტვირთება...' },
        { name: 'loadingEn',             title: 'Message — Loading (EN)',              type: 'string', initialValue: 'Loading...' },
        { name: 'noProducts',            title: 'Message — No products found (GE)',   type: 'string', initialValue: 'პროდუქტები ვერ მოიძებნა' },
        { name: 'noProductsEn',          title: 'Message — No products found (EN)',   type: 'string', initialValue: 'No products found' },
        { name: 'loadFailed',            title: 'Message — Load failed (GE)',          type: 'string', initialValue: 'პროდუქტები ვერ ჩაიტვირთა. გთხოვთ სცადოთ მოგვიანებით.' },
        { name: 'loadFailedEn',          title: 'Message — Load failed (EN)',          type: 'string', initialValue: 'Failed to load products. Please try again later.' },
        // Buttons
        { name: 'viewAll',               title: 'Button — View All (short, GE)',       type: 'string', initialValue: 'ყველა პროდუქტი' },
        { name: 'viewAllEn',             title: 'Button — View All (short, EN)',       type: 'string', initialValue: 'View All Products' },
        { name: 'viewAllProducts',       title: 'Button — View All Products (GE)',     type: 'string', initialValue: 'ყველა პროდუქტის ნახვა' },
        { name: 'viewAllProductsEn',     title: 'Button — View All Products (EN)',     type: 'string', initialValue: 'View All Products' },
        { name: 'viewProducts',          title: 'Button — View Products (GE)',         type: 'string', initialValue: 'პროდუქტების ნახვა' },
        { name: 'viewProductsEn',        title: 'Button — View Products (EN)',         type: 'string', initialValue: 'View Products' },
        { name: 'readMore',              title: 'Button — Read More (GE)',             type: 'string', initialValue: 'სრულად წაკითხვა' },
        { name: 'readMoreEn',            title: 'Button — Read More (EN)',             type: 'string', initialValue: 'Read More' },
        { name: 'learnMore',             title: 'Button — Learn More (GE)',            type: 'string', initialValue: 'გაიგე მეტი' },
        { name: 'learnMoreEn',           title: 'Button — Learn More (EN)',            type: 'string', initialValue: 'Learn More' },
        // Section fallback headings & labels
        { name: 'categoriesHeading',     title: 'Categories section — heading (GE)',   type: 'string', initialValue: 'აღმოაჩინე კოლექცია' },
        { name: 'categoriesHeadingEn',   title: 'Categories section — heading (EN)',   type: 'string', initialValue: 'Browse by Collection' },
        { name: 'categoriesLabel',       title: 'Categories section — label (GE)',     type: 'string', initialValue: 'კატეგორიები' },
        { name: 'categoriesLabelEn',     title: 'Categories section — label (EN)',     type: 'string', initialValue: 'Categories' },
        { name: 'featuredHeading',       title: 'Featured section — heading (GE)',     type: 'string', initialValue: 'რჩეული პროდუქტები' },
        { name: 'featuredHeadingEn',     title: 'Featured section — heading (EN)',     type: 'string', initialValue: 'Top Picks' },
        { name: 'featuredLabel',         title: 'Featured section — label (GE)',       type: 'string', initialValue: 'პოპულარული' },
        { name: 'featuredLabelEn',       title: 'Featured section — label (EN)',       type: 'string', initialValue: 'Popular' },
        { name: 'aboutLabel',            title: 'About section — label (GE)',          type: 'string', initialValue: 'ჩვენ შესახებ' },
        { name: 'aboutLabelEn',          title: 'About section — label (EN)',          type: 'string', initialValue: 'About Us' },
        { name: 'blogHeading',           title: 'Blog section — heading (GE)',         type: 'string', initialValue: 'ბლოგი' },
        { name: 'blogHeadingEn',         title: 'Blog section — heading (EN)',         type: 'string', initialValue: 'Blog' },
        { name: 'blogLabel',             title: 'Blog section — label (GE)',           type: 'string', initialValue: 'სტატიები' },
        { name: 'blogLabelEn',           title: 'Blog section — label (EN)',           type: 'string', initialValue: 'Articles' },
        // Page names (used in breadcrumbs & JSON-LD)
        { name: 'pageHome',              title: 'Page name — Home (GE)',               type: 'string', initialValue: 'მთავარი' },
        { name: 'pageHomeEn',            title: 'Page name — Home (EN)',               type: 'string', initialValue: 'Home' },
        { name: 'pageProducts',          title: 'Page name — Products (GE)',           type: 'string', initialValue: 'პროდუქტები' },
        { name: 'pageProductsEn',        title: 'Page name — Products (EN)',           type: 'string', initialValue: 'Products' },
        { name: 'pageAbout',             title: 'Page name — About (GE)',              type: 'string', initialValue: 'ჩვენ შესახებ' },
        { name: 'pageAboutEn',           title: 'Page name — About (EN)',              type: 'string', initialValue: 'About' },
        { name: 'pageContact',           title: 'Page name — Contact (GE)',            type: 'string', initialValue: 'კონტაქტი' },
        { name: 'pageContactEn',         title: 'Page name — Contact (EN)',            type: 'string', initialValue: 'Contact' },
      ],
    },
  ],
  preview: {
    prepare() {
      return { title: 'Site Settings' }
    },
  },
}
