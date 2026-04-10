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
      title: '🖼 Hero Slider Slides',
      type: 'array',
      group: 'content',
      description: 'Add, remove and drag-to-reorder slides for the homepage hero carousel. ' +
        'Each slide has its own image, heading, subtitle and optional button. ' +
        'If this list is empty the site falls back to its built-in static slides.',
      of: [
        {
          type: 'object',
          name: 'heroSlide',
          title: 'Slide',
          fields: [
            {
              name: 'image',
              title: 'Background Image',
              type: 'image',
              options: { hotspot: true },
              validation: (Rule) => Rule.required(),
              fields: [
                { name: 'alt', title: 'Alt Text (for accessibility)', type: 'string' },
              ],
            },
            { name: 'subtitle', title: 'Subtitle / Label (GE)', type: 'string', description: 'Small text above the main heading' },
            { name: 'subtitleEn', title: 'Subtitle / Label (EN)', type: 'string' },
            { name: 'heading', title: 'Main Heading (GE)', type: 'string', validation: (Rule) => Rule.required() },
            { name: 'headingEn', title: 'Main Heading (EN)', type: 'string' },
            { name: 'buttonText', title: 'Button Text (GE)', type: 'string', description: 'Leave empty to hide the button' },
            { name: 'buttonTextEn', title: 'Button Text (EN)', type: 'string' },
            { name: 'buttonLink', title: 'Button Link / URL', type: 'string', initialValue: 'products.html', description: 'Relative path (e.g. products.html) or full URL' },
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
