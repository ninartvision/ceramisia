// sanity-studio/schemaTypes/objects/variant.js
// Product variant (size, color, etc.)

export default {
  name: 'variant',
  title: 'Variant',
  type: 'object',
  fields: [
    {
      name: 'name',
      title: 'Variant Name (GE)',
      type: 'string',
      description: 'e.g. "დიდი", "ლურჯი"',
      validation: (Rule) => Rule.required(),
    },
    {
      name: 'nameEn',
      title: 'Variant Name (EN)',
      type: 'string',
      description: 'e.g. "Large", "Blue"',
    },
    {
      name: 'price',
      title: 'Variant Price (₾)',
      type: 'number',
      description: 'Price for this specific variant',
      validation: (Rule) => Rule.positive(),
    },
  ],
  preview: {
    select: { title: 'name', price: 'price' },
    prepare({ title, price }) {
      return {
        title: title || 'Unnamed Variant',
        subtitle: price ? `₾${price}` : '',
      }
    },
  },
}
