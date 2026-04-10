// sanity-studio/schemaTypes/siteSettings.js
// Global site settings — singleton document

export default {
  name: 'siteSettings',
  title: 'Site Settings',
  type: 'document',
  groups: [
    { name: 'general', title: 'General', default: true },
    { name: 'contact', title: 'Contact Info' },
    { name: 'social', title: 'Social Links' },
    { name: 'seo', title: 'Default SEO' },
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
  ],
  preview: {
    prepare() {
      return { title: 'Site Settings' }
    },
  },
}
