// sanity-studio/schemaTypes/product.js
// Product schema — maps to your existing product cards

export default {
  name: 'product',
  title: 'Product',
  type: 'document',
  fields: [
    {
      name: 'name',
      title: 'Name (GE)',
      type: 'string',
      validation: (Rule) => Rule.required(),
    },
    {
      name: 'nameEn',
      title: 'Name (EN)',
      type: 'string',
      validation: (Rule) => Rule.required(),
    },
    {
      name: 'slug',
      title: 'Slug',
      type: 'slug',
      options: { source: 'nameEn', maxLength: 80 },
      validation: (Rule) => Rule.required(),
    },
    {
      name: 'image',
      title: 'Product Image',
      type: 'image',
      options: { hotspot: true },
      validation: (Rule) => Rule.required(),
    },
    {
      name: 'category',
      title: 'Category',
      type: 'reference',
      to: [{ type: 'category' }],
      validation: (Rule) => Rule.required(),
    },
    {
      name: 'price',
      title: 'Price (₾)',
      type: 'number',
      validation: (Rule) => Rule.required().positive(),
    },
    {
      name: 'originalPrice',
      title: 'Original Price (₾) — for sale items',
      type: 'number',
      description: 'Leave empty if not on sale',
    },
    {
      name: 'badge',
      title: 'Badge',
      type: 'string',
      options: {
        list: [
          { title: 'None', value: '' },
          { title: 'New', value: 'new' },
          { title: 'Sale', value: 'sale' },
        ],
        layout: 'radio',
      },
      initialValue: '',
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
      name: 'inStock',
      title: 'In Stock',
      type: 'boolean',
      initialValue: true,
    },
    {
      name: 'order',
      title: 'Display Order',
      type: 'number',
      description: 'Lower numbers appear first',
    },
  ],
  orderings: [
    { title: 'Display Order', name: 'orderAsc', by: [{ field: 'order', direction: 'asc' }] },
    { title: 'Price ↑', name: 'priceAsc', by: [{ field: 'price', direction: 'asc' }] },
    { title: 'Price ↓', name: 'priceDesc', by: [{ field: 'price', direction: 'desc' }] },
  ],
  preview: {
    select: {
      title: 'name',
      subtitle: 'category.title',
      media: 'image',
      price: 'price',
    },
    prepare({ title, subtitle, media, price }) {
      return {
        title,
        subtitle: `${subtitle || ''} — ₾${price || ''}`,
        media,
      }
    },
  },
}
