// sanity-studio/schemaTypes/objects/seo.js
// Reusable SEO fields object

export default {
  name: 'seo',
  title: 'SEO Settings',
  type: 'object',
  fields: [
    {
      name: 'metaTitle',
      title: 'Meta Title',
      type: 'string',
      description: 'Overrides the page title in search results (max 60 chars)',
      validation: (Rule) => Rule.max(60),
    },
    {
      name: 'metaDescription',
      title: 'Meta Description',
      type: 'text',
      rows: 3,
      description: 'Short description for search engines (max 160 chars)',
      validation: (Rule) => Rule.max(160),
    },
    {
      name: 'openGraphImage',
      title: 'Open Graph Image',
      type: 'image',
      description: 'Image shown when sharing on social media (1200×630 recommended)',
      options: { hotspot: true },
    },
  ],
}
