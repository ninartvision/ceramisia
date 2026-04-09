// sanity-studio/schemaTypes/objects/pageSection.js
// Reusable content section block for pages

export default {
  name: 'pageSection',
  title: 'Page Section',
  type: 'object',
  fields: [
    {
      name: 'heading',
      title: 'Heading (GE)',
      type: 'string',
    },
    {
      name: 'headingEn',
      title: 'Heading (EN)',
      type: 'string',
    },
    {
      name: 'text',
      title: 'Text (GE)',
      type: 'array',
      of: [
        { type: 'block' },
        {
          type: 'image',
          options: { hotspot: true },
          fields: [
            { name: 'alt', title: 'Alt Text', type: 'string' },
          ],
        },
      ],
    },
    {
      name: 'textEn',
      title: 'Text (EN)',
      type: 'array',
      of: [
        { type: 'block' },
        {
          type: 'image',
          options: { hotspot: true },
          fields: [
            { name: 'alt', title: 'Alt Text', type: 'string' },
          ],
        },
      ],
    },
    {
      name: 'image',
      title: 'Section Image',
      type: 'image',
      options: { hotspot: true },
      fields: [
        { name: 'alt', title: 'Alt Text', type: 'string' },
      ],
    },
  ],
  preview: {
    select: { title: 'heading', media: 'image' },
    prepare({ title, media }) {
      return {
        title: title || 'Untitled Section',
        media,
      }
    },
  },
}
