// sanity-studio/schemaTypes/category.js
// Category schema for product classification

export default {
  name: 'category',
  title: 'Category',
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
      options: { source: 'titleEn', maxLength: 60 },
      validation: (Rule) => Rule.required(),
    },
    {
      name: 'description',
      title: 'Description (GE)',
      type: 'text',
      rows: 3,
    },
    {
      name: 'descriptionEn',
      title: 'Description (EN)',
      type: 'text',
      rows: 3,
    },
    {
      name: 'image',
      title: 'Category Image',
      type: 'image',
      options: { hotspot: true },
    },
    {
      name: 'order',
      title: 'Display Order',
      type: 'number',
    },
  ],
  orderings: [
    { title: 'Display Order', name: 'orderAsc', by: [{ field: 'order', direction: 'asc' }] },
  ],
  preview: {
    select: { title: 'title', media: 'image' },
  },
}
