// sanity-studio/structure.js
// Custom desk structure — controls the Sanity Studio sidebar with emoji icons.
// Imported by sanity.config.js via structureTool({ structure }).

export const structure = (S) =>
  S.list()
    .title('Ceramisia CMS')
    .items([
      // ── Singletons ────────────────────────────────────
      S.listItem()
        .title('⚙️ Site Settings')
        .id('siteSettings')
        .child(
          S.document()
            .schemaType('siteSettings')
            .documentId('siteSettings')
            .title('⚙️ Site Settings')
        ),

      S.listItem()
        .title('🧭 Navigation & Menus')
        .id('navigation')
        .child(
          S.document()
            .schemaType('navigation')
            .documentId('navigation')
            .title('🧭 Navigation & Menus')
        ),

      S.listItem()
        .title('🏠 Homepage Layout')
        .id('homepage')
        .child(
          S.document()
            .schemaType('homepage')
            .documentId('homepage')
            .title('🏠 Homepage Layout')
        ),

      S.divider(),

      // ── Pages ─────────────────────────────────────────
      S.documentTypeListItem('page').title('📄 Pages'),

      S.divider(),

      // ── Shop content ──────────────────────────────────
      S.documentTypeListItem('product').title('🛍️ Products'),
      S.documentTypeListItem('category').title('📂 Categories'),

      S.divider(),

      // ── Blog ──────────────────────────────────────────
      S.documentTypeListItem('blogPost').title('📝 Blog Posts'),

      S.divider(),

      // ── Orders ────────────────────────────────────────
      S.documentTypeListItem('order').title('📦 Orders & Inquiries'),
    ])
