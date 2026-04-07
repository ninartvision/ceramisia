// sanity-studio/schemaTypes/blogPost.js
// Blog post schema — maps to your blog cards and blog page articles

export default {
  name: 'blogPost',
  title: 'Blog Post',
  type: 'document',
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
      name: 'slug',
      title: 'Slug',
      type: 'slug',
      options: { source: 'titleEn', maxLength: 100 },
      validation: (Rule) => Rule.required(),
    },
    {
      name: 'publishedAt',
      title: 'Published Date',
      type: 'date',
      validation: (Rule) => Rule.required(),
    },
    {
      name: 'image',
      title: 'Cover Image',
      type: 'image',
      options: { hotspot: true },
      validation: (Rule) => Rule.required(),
    },
    {
      name: 'excerpt',
      title: 'Excerpt (GE)',
      type: 'text',
      rows: 3,
      description: 'Short summary shown on blog cards',
      validation: (Rule) => Rule.required().max(200),
    },
    {
      name: 'excerptEn',
      title: 'Excerpt (EN)',
      type: 'text',
      rows: 3,
      validation: (Rule) => Rule.required().max(200),
    },
    {
      name: 'body',
      title: 'Body (GE)',
      type: 'array',
      of: [
        { type: 'block' },
        {
          type: 'image',
          options: { hotspot: true },
          fields: [
            {
              name: 'alt',
              title: 'Alt Text',
              type: 'string',
            },
          ],
        },
      ],
    },
    {
      name: 'bodyEn',
      title: 'Body (EN)',
      type: 'array',
      of: [
        { type: 'block' },
        {
          type: 'image',
          options: { hotspot: true },
          fields: [
            {
              name: 'alt',
              title: 'Alt Text',
              type: 'string',
            },
          ],
        },
      ],
    },
    {
      name: 'tags',
      title: 'Tags',
      type: 'array',
      of: [{ type: 'string' }],
      options: { layout: 'tags' },
    },
  ],
  orderings: [
    {
      title: 'Newest First',
      name: 'publishedDesc',
      by: [{ field: 'publishedAt', direction: 'desc' }],
    },
  ],
  preview: {
    select: {
      title: 'title',
      date: 'publishedAt',
      media: 'image',
    },
    prepare({ title, date, media }) {
      return {
        title,
        subtitle: date,
        media,
      }
    },
  },
}
