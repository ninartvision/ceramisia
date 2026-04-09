// sanity-studio/schemaTypes/page.js
// Editable page content (Home, About, Contact, etc.)

export default {
  name: 'page',
  title: 'Page',
  type: 'document',
  groups: [
    { name: 'content', title: 'Content', default: true },
    { name: 'seo', title: 'SEO' },
  ],
  fields: [
    {
      name: 'title',
      title: 'Page Title (GE)',
      type: 'string',
      group: 'content',
      validation: (Rule) => Rule.required(),
    },
    {
      name: 'titleEn',
      title: 'Page Title (EN)',
      type: 'string',
      group: 'content',
      validation: (Rule) => Rule.required(),
    },
    {
      name: 'slug',
      title: 'Slug',
      type: 'slug',
      group: 'content',
      options: { source: 'titleEn', maxLength: 60 },
      validation: (Rule) => Rule.required(),
      description: 'Use "home", "about", or "contact" for built-in pages',
    },
    {
      name: 'heroImage',
      title: 'Hero Image',
      type: 'image',
      group: 'content',
      options: { hotspot: true },
      fields: [
        { name: 'alt', title: 'Alt Text', type: 'string' },
      ],
    },
    {
      name: 'heroHeading',
      title: 'Hero Heading (GE)',
      type: 'string',
      group: 'content',
    },
    {
      name: 'heroHeadingEn',
      title: 'Hero Heading (EN)',
      type: 'string',
      group: 'content',
    },
    {
      name: 'heroSubtext',
      title: 'Hero Subtext (GE)',
      type: 'text',
      rows: 2,
      group: 'content',
    },
    {
      name: 'heroSubtextEn',
      title: 'Hero Subtext (EN)',
      type: 'text',
      rows: 2,
      group: 'content',
    },
    {
      name: 'heroSlides',
      title: 'Hero Slides (Homepage)',
      type: 'array',
      group: 'content',
      description: 'For homepage hero slider only. Leave empty on other pages.',
      of: [
        {
          type: 'object',
          name: 'heroSlide',
          title: 'Slide',
          fields: [
            { name: 'image', title: 'Background Image', type: 'image', options: { hotspot: true }, validation: (Rule) => Rule.required() },
            { name: 'subtitle', title: 'Subtitle (GE)', type: 'string' },
            { name: 'subtitleEn', title: 'Subtitle (EN)', type: 'string' },
            { name: 'heading', title: 'Heading (GE)', type: 'string', validation: (Rule) => Rule.required() },
            { name: 'headingEn', title: 'Heading (EN)', type: 'string' },
            { name: 'buttonText', title: 'Button Text (GE)', type: 'string' },
            { name: 'buttonTextEn', title: 'Button Text (EN)', type: 'string' },
            { name: 'buttonLink', title: 'Button Link', type: 'string', initialValue: 'products.html' },
          ],
          preview: {
            select: { title: 'heading', media: 'image' },
          },
        },
      ],
    },
    {
      name: 'sections',
      title: 'Content Sections',
      type: 'array',
      group: 'content',
      of: [{ type: 'pageSection' }],
      description: 'Add as many content blocks as needed',
    },
    {
      name: 'seo',
      title: 'SEO',
      type: 'seo',
      group: 'seo',
    },
  ],
  preview: {
    select: { title: 'title', slug: 'slug.current', media: 'heroImage' },
    prepare({ title, slug, media }) {
      return {
        title: title || 'Untitled Page',
        subtitle: `/${slug || ''}`,
        media,
      }
    },
  },
}
