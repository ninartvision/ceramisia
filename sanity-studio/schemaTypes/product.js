// sanity-studio/schemaTypes/product.js
// Product schema — full product management for Ceramisia

export default {
  name: 'product',
  title: 'Product',
  type: 'document',
  groups: [
    { name: 'main', title: 'Main Info', default: true },
    { name: 'media', title: 'Media' },
    { name: 'pricing', title: 'Pricing & Variants' },
    { name: 'details', title: 'Details' },
    { name: 'seo', title: 'SEO' },
  ],
  fields: [
    // ── Main Info ──────────────────────────────────────
    {
      name: 'name',
      title: 'Name (GE)',
      type: 'string',
      group: 'main',
      validation: (Rule) => Rule.required(),
    },
    {
      name: 'nameEn',
      title: 'Name (EN)',
      type: 'string',
      group: 'main',
      validation: (Rule) => Rule.required(),
    },
    {
      name: 'slug',
      title: 'Slug',
      type: 'slug',
      group: 'main',
      options: { source: 'nameEn', maxLength: 80 },
      validation: (Rule) => Rule.required(),
    },
    {
      name: 'sku',
      title: 'SKU',
      type: 'string',
      group: 'main',
      description: 'Unique product identifier / stock code',
    },
    {
      name: 'description',
      title: 'Description (GE)',
      type: 'array',
      group: 'main',
      of: [{ type: 'block' }],
    },
    {
      name: 'descriptionEn',
      title: 'Description (EN)',
      type: 'array',
      group: 'main',
      of: [{ type: 'block' }],
    },
    {
      name: 'category',
      title: 'Category',
      type: 'reference',
      group: 'main',
      to: [{ type: 'category' }],
      validation: (Rule) => Rule.required(),
    },

    // ── Media ──────────────────────────────────────────
    {
      name: 'mainImage',
      title: 'Main Image',
      type: 'image',
      group: 'media',
      options: { hotspot: true },
      fields: [
        { name: 'alt', title: 'Alt Text', type: 'string' },
      ],
      validation: (Rule) => Rule.required(),
    },
    {
      name: 'gallery',
      title: 'Gallery',
      type: 'array',
      group: 'media',
      of: [
        {
          type: 'image',
          options: { hotspot: true },
          fields: [
            { name: 'alt', title: 'Alt Text', type: 'string' },
          ],
        },
      ],
      description: 'Additional product images',
    },

    // ── Pricing & Variants ─────────────────────────────
    {
      name: 'price',
      title: 'Price (₾)',
      type: 'number',
      group: 'pricing',
      validation: (Rule) => Rule.required().positive(),
    },
    {
      name: 'salePrice',
      title: 'Sale Price (₾)',
      type: 'number',
      group: 'pricing',
      description: 'Leave empty if not on sale',
      validation: (Rule) => Rule.positive(),
    },
    {
      name: 'variants',
      title: 'Variants',
      type: 'array',
      group: 'pricing',
      of: [{ type: 'variant' }],
      description: 'Product variations (size, color, etc.)',
    },
    {
      name: 'additionalPackaging',
      title: 'Additional Packaging Available',
      type: 'boolean',
      group: 'pricing',
      initialValue: false,
      description: 'Can the customer request gift / special packaging?',
    },
    {
      name: 'packagingPrice',
      title: 'Packaging Price (₾)',
      type: 'number',
      group: 'pricing',
      description: 'Extra charge for additional packaging',
      hidden: ({ parent }) => !parent?.additionalPackaging,
      validation: (Rule) => Rule.positive(),
    },

    // ── Details ────────────────────────────────────────
    {
      name: 'badge',
      title: 'Badge',
      type: 'string',
      group: 'details',
      options: {
        list: [
          { title: 'None', value: '' },
          { title: 'New', value: 'new' },
          { title: 'Sale', value: 'sale' },
          { title: 'Bestseller', value: 'bestseller' },
        ],
        layout: 'radio',
      },
      initialValue: '',
    },
    {
      name: 'inStock',
      title: 'In Stock',
      type: 'boolean',
      group: 'details',
      initialValue: true,
    },
    {
      name: 'isFeatured',
      title: 'Featured on Homepage',
      type: 'boolean',
      group: 'details',
      initialValue: false,
      description: 'Show this product in the homepage featured section',
    },
    {
      name: 'order',
      title: 'Display Order',
      type: 'number',
      group: 'details',
      description: 'Lower numbers appear first',
    },

    // ── SEO ────────────────────────────────────────────
    {
      name: 'seo',
      title: 'SEO',
      type: 'seo',
      group: 'seo',
    },
  ],
  orderings: [
    { title: 'Display Order', name: 'orderAsc', by: [{ field: 'order', direction: 'asc' }] },
    { title: 'Price ↑', name: 'priceAsc', by: [{ field: 'price', direction: 'asc' }] },
    { title: 'Price ↓', name: 'priceDesc', by: [{ field: 'price', direction: 'desc' }] },
    { title: 'Name A–Z', name: 'nameAsc', by: [{ field: 'name', direction: 'asc' }] },
  ],
  preview: {
    select: {
      title: 'name',
      subtitle: 'category.title',
      media: 'mainImage',
      price: 'price',
      inStock: 'inStock',
    },
    prepare({ title, subtitle, media, price, inStock }) {
      const stock = inStock === false ? ' ❌' : ''
      return {
        title: `${title || ''}${stock}`,
        subtitle: `${subtitle || ''} — ₾${price || ''}`,
        media,
      }
    },
  },
}
