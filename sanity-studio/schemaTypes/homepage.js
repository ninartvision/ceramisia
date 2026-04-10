// sanity-studio/schemaTypes/homepage.js
// Homepage layout — controls which sections appear and in what order.
// This is a singleton document (only one homepage document should exist).

export default {
  name: 'homepage',
  title: 'Homepage',
  type: 'document',

  // Prevent creating multiple homepage documents
  __experimental_actions: ['update', 'publish', 'discardDraft'],

  fields: [
    {
      name: 'sections',
      title: 'Homepage Sections',
      description:
        'Drag to reorder. Add or remove sections to control the homepage layout. ' +
        'If this list is empty, the site falls back to its default static layout.',
      type: 'array',
      of: [
        {
          type: 'object',
          name: 'homepageSection',
          title: 'Section',
          fields: [
            // ── Section Type ───────────────────────────────────────
            {
              name: 'type',
              title: 'Section Type',
              type: 'string',
              options: {
                list: [
                  { title: '🖼  Hero Slider', value: 'slider' },
                  { title: '🗂  Categories Grid', value: 'categories' },
                  { title: '⭐ Featured Products', value: 'featured' },
                  { title: 'ℹ️  About Strip', value: 'about' },
                  { title: '📝 Blog Cards', value: 'blog' },
                  { title: '📄 Text + Image', value: 'text_image' },
                ],
                layout: 'radio',
              },
              validation: (R) => R.required(),
            },

            // ── Optional Heading Override ──────────────────────────
            {
              name: 'heading',
              title: 'Heading (Georgian)',
              type: 'string',
              description: 'Optional: override the default section heading',
            },
            {
              name: 'headingEn',
              title: 'Heading (English)',
              type: 'string',
            },
            {
              name: 'label',
              title: 'Label / Subtitle (Georgian)',
              type: 'string',
              description: 'Small label displayed above the heading',
            },
            {
              name: 'labelEn',
              title: 'Label / Subtitle (English)',
              type: 'string',
            },

            // ── Text + Image section fields ────────────────────────
            // (also used for the "about" section override)
            {
              name: 'text',
              title: 'Body Text (Georgian)',
              type: 'text',
              rows: 4,
              description: 'Used for "Text + Image" and "About Strip" section types',
            },
            {
              name: 'textEn',
              title: 'Body Text (English)',
              type: 'text',
              rows: 4,
            },
            {
              name: 'image',
              title: 'Image',
              type: 'image',
              options: { hotspot: true },
              description: 'Used for "Text + Image" and "About Strip" section types',
            },
            {
              name: 'buttonText',
              title: 'Button Text (Georgian)',
              type: 'string',
            },
            {
              name: 'buttonTextEn',
              title: 'Button Text (English)',
              type: 'string',
            },
            {
              name: 'buttonLink',
              title: 'Button Link',
              type: 'string',
              description: 'e.g. products.html or https://example.com',
            },
          ],

          preview: {
            select: {
              stype: 'type',
              heading: 'heading',
              headingEn: 'headingEn',
            },
            prepare({ stype, heading, headingEn }) {
              const icons = {
                slider:     '🖼',
                categories: '🗂',
                featured:   '⭐',
                about:      'ℹ️',
                blog:       '📝',
                text_image: '📄',
              };
              const names = {
                slider:     'Hero Slider',
                categories: 'Categories Grid',
                featured:   'Featured Products',
                about:      'About Strip',
                blog:       'Blog Cards',
                text_image: 'Text + Image',
              };
              return {
                title:    (icons[stype] || '▪️') + '  ' + (names[stype] || stype || 'Section'),
                subtitle: heading || headingEn || '',
              };
            },
          },
        },
      ],
    },
  ],

  preview: {
    prepare() {
      return { title: 'Homepage Layout' };
    },
  },
};
