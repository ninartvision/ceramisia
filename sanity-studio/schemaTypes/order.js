// sanity-studio/schemaTypes/order.js
// Orders created by the storefront API — read-only in Studio.

const readOnly = { readOnly: true }

export default {
  icon: () => '🛒',
  name: 'order',
  title: 'Order / Inquiry',
  type: 'document',
  groups: [
    { name: 'customer', title: 'Customer', default: true },
    { name: 'order', title: 'Order & payment' },
    { name: 'products', title: 'Products' },
  ],
  fields: [
    {
      name: 'orderId',
      title: 'Order ID',
      type: 'string',
      group: 'order',
      description: 'Payment order_id (BOG uuid or Flitt flt_…)',
      ...readOnly,
    },
    {
      name: 'customerName',
      title: 'First name',
      type: 'string',
      group: 'customer',
      validation: (Rule) => Rule.required().min(2),
      ...readOnly,
    },
    {
      name: 'customerSurname',
      title: 'Last name',
      type: 'string',
      group: 'customer',
      validation: (Rule) => Rule.required().min(2),
      ...readOnly,
    },
    {
      name: 'phoneNumber',
      title: 'Phone number',
      type: 'string',
      group: 'customer',
      validation: (Rule) => Rule.required().min(9),
      ...readOnly,
    },
    {
      name: 'email',
      title: 'Email',
      type: 'string',
      group: 'customer',
      validation: (Rule) => Rule.required().email(),
      ...readOnly,
    },
    {
      name: 'message',
      title: 'Customer message',
      type: 'text',
      rows: 4,
      group: 'customer',
      ...readOnly,
    },
    {
      name: 'amount',
      title: 'Amount (GEL)',
      type: 'number',
      group: 'order',
      validation: (Rule) => Rule.required().min(0),
      ...readOnly,
    },
    {
      name: 'paymentProvider',
      title: 'Payment provider',
      type: 'string',
      group: 'order',
      ...readOnly,
    },
    {
      name: 'paymentStatus',
      title: 'Payment status',
      type: 'string',
      description: 'e.g. approved, completed',
      group: 'order',
      ...readOnly,
    },
    {
      name: 'status',
      title: 'Workflow status',
      type: 'string',
      group: 'order',
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
      ...readOnly,
    },
    {
      name: 'selectedProducts',
      title: 'Selected products',
      type: 'array',
      group: 'products',
      of: [
        {
          type: 'object',
          fields: [
            {
              name: 'product',
              title: 'Product',
              type: 'reference',
              to: [{ type: 'product' }],
              ...readOnly,
            },
            {
              name: 'quantity',
              title: 'Quantity',
              type: 'number',
              initialValue: 1,
              validation: (Rule) => Rule.min(1),
              ...readOnly,
            },
            {
              name: 'variant',
              title: 'Product label at purchase',
              type: 'string',
              ...readOnly,
            },
            {
              name: 'unitPrice',
              title: 'Unit price (₾)',
              type: 'number',
              ...readOnly,
            },
            {
              name: 'lineTotal',
              title: 'Line total (₾)',
              type: 'number',
              ...readOnly,
            },
          ],
          preview: {
            select: {
              title: 'product.name',
              fallbackTitle: 'variant',
              qty: 'quantity',
              unit: 'unitPrice',
              line: 'lineTotal',
            },
            prepare({ title, fallbackTitle, qty, unit, line }) {
              const name = title || fallbackTitle || 'Product'
              const q = qty || 1
              const lineTxt =
                line != null
                  ? ` — ₾${line}`
                  : unit != null
                    ? ` — ₾${unit} × ${q}`
                    : ''
              return { title: `${name} × ${q}${lineTxt}` }
            },
          },
        },
      ],
    },
    {
      name: 'createdAt',
      title: 'Created at',
      type: 'datetime',
      group: 'order',
      initialValue: () => new Date().toISOString(),
      ...readOnly,
    },
  ],
  orderings: [
    {
      title: 'Newest first',
      name: 'createdDesc',
      by: [{ field: 'createdAt', direction: 'desc' }],
    },
  ],
  preview: {
    select: {
      firstName: 'customerName',
      lastName: 'customerSurname',
      orderId: 'orderId',
      provider: 'paymentProvider',
      subtitle: 'status',
      amount: 'amount',
      date: 'createdAt',
    },
    prepare({ firstName, lastName, orderId, provider, subtitle, amount, date }) {
      const name = [firstName, lastName].filter(Boolean).join(' ').trim()
      const d = date ? new Date(date).toLocaleDateString() : ''
      const amt = amount != null ? `${amount} GEL` : ''
      const oid = orderId ? ` · ${orderId}` : ''
      return {
        title: name || orderId || 'Order',
        subtitle: [provider, amt, subtitle || 'new', d].filter(Boolean).join(' · '),
      }
    },
  },
}
