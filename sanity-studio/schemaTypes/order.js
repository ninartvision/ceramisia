// sanity-studio/schemaTypes/order.js
// Order / Contact form submissions

export default {
  icon: () => '🛒',
  name: 'order',
  title: 'Order / Inquiry',
  type: 'document',
  fields: [
    {
      name: 'orderId',
      title: 'Order ID',
      type: 'string',
      description: 'Payment order_id (Flitt flt_… or BOG bank id)',
    },
    {
      name: 'customerName',
      title: 'Customer Name',
      type: 'string',
      validation: (Rule) => Rule.required(),
    },
    {
      name: 'phone',
      title: 'Phone Number',
      type: 'string',
    },
    {
      name: 'email',
      title: 'Email',
      type: 'string',
    },
    {
      name: 'message',
      title: 'Message',
      type: 'text',
      rows: 5,
    },
    {
      name: 'selectedProducts',
      title: 'Selected Products',
      type: 'array',
      of: [
        {
          type: 'object',
          fields: [
            {
              name: 'product',
              title: 'Product',
              type: 'reference',
              to: [{ type: 'product' }],
            },
            {
              name: 'quantity',
              title: 'Quantity',
              type: 'number',
              initialValue: 1,
              validation: (Rule) => Rule.min(1),
            },
            {
              name: 'variant',
              title: 'Variant Note',
              type: 'string',
              description: 'e.g. "Large, Blue"',
            },
          ],
          preview: {
            select: { title: 'product.name', qty: 'quantity' },
            prepare({ title, qty }) {
              return { title: `${title || 'Product'} × ${qty || 1}` }
            },
          },
        },
      ],
    },
    {
      name: 'amount',
      title: 'Amount (GEL)',
      type: 'number',
    },
    {
      name: 'paymentProvider',
      title: 'Payment Provider',
      type: 'string',
    },
    {
      name: 'paymentStatus',
      title: 'Payment Status',
      type: 'string',
      description: 'e.g. approved, completed',
    },
    {
      name: 'status',
      title: 'Workflow Status',
      type: 'string',
      options: {
        list: [
          { title: 'New', value: 'new' },
          { title: 'In Progress', value: 'in-progress' },
          { title: 'Completed', value: 'completed' },
          { title: 'Cancelled', value: 'cancelled' },
        ],
        layout: 'radio',
      },
      initialValue: 'new',
    },
    {
      name: 'createdAt',
      title: 'Created At',
      type: 'datetime',
      initialValue: () => new Date().toISOString(),
      readOnly: true,
    },
  ],
  orderings: [
    { title: 'Newest First', name: 'createdDesc', by: [{ field: 'createdAt', direction: 'desc' }] },
  ],
  preview: {
    select: {
      title: 'customerName',
      orderId: 'orderId',
      provider: 'paymentProvider',
      subtitle: 'status',
      amount: 'amount',
      date: 'createdAt',
    },
    prepare({ title, orderId, provider, subtitle, amount, date }) {
      const d = date ? new Date(date).toLocaleDateString() : ''
      const amt = amount != null ? `${amount} GEL` : ''
      const oid = orderId ? ` · ${orderId}` : ''
      return {
        title: title || orderId || 'Unknown',
        subtitle: [provider, amt, subtitle || 'new', d].filter(Boolean).join(' · '),
      }
    },
  },
}
