// sanity-studio/schemaTypes/navigation.js
// Navigation & footer menus — singleton document

export default {
  name: 'navigation',
  title: 'Navigation',
  type: 'document',
  fields: [
    {
      name: 'mainMenu',
      title: 'Main Menu',
      type: 'array',
      of: [
        {
          type: 'object',
          name: 'menuItem',
          fields: [
            {
              name: 'title',
              title: 'Title (GE)',
              type: 'string',
              validation: (Rule) => Rule.required(),
            },
            {
              name: 'titleEn',
              title: 'Title (EN)',
              type: 'string',
              validation: (Rule) => Rule.required(),
            },
            {
              name: 'link',
              title: 'Link',
              type: 'string',
              description: 'Relative path (e.g. "/products.html") or external URL',
              validation: (Rule) => Rule.required(),
            },
            {
              name: 'openInNewTab',
              title: 'Open in new tab',
              type: 'boolean',
              initialValue: false,
            },
          ],
          preview: {
            select: { title: 'title', link: 'link' },
            prepare({ title, link }) {
              return { title, subtitle: link }
            },
          },
        },
      ],
    },
    {
      name: 'footerLinks',
      title: 'Footer Links',
      type: 'array',
      of: [
        {
          type: 'object',
          name: 'footerItem',
          fields: [
            {
              name: 'title',
              title: 'Title (GE)',
              type: 'string',
              validation: (Rule) => Rule.required(),
            },
            {
              name: 'titleEn',
              title: 'Title (EN)',
              type: 'string',
              validation: (Rule) => Rule.required(),
            },
            {
              name: 'link',
              title: 'Link',
              type: 'string',
              validation: (Rule) => Rule.required(),
            },
            {
              name: 'openInNewTab',
              title: 'Open in new tab',
              type: 'boolean',
              initialValue: false,
            },
          ],
          preview: {
            select: { title: 'title', link: 'link' },
            prepare({ title, link }) {
              return { title, subtitle: link }
            },
          },
        },
      ],
    },
    {
      name: 'footerText',
      title: 'Footer Text (GE)',
      type: 'text',
      rows: 2,
      description: 'Copyright / tagline shown in the footer',
    },
    {
      name: 'footerTextEn',
      title: 'Footer Text (EN)',
      type: 'text',
      rows: 2,
    },
  ],
  preview: {
    prepare() {
      return { title: 'Navigation & Menus' }
    },
  },
}
