// sanity-studio/sanity.config.js
import { defineConfig } from 'sanity'
import { structureTool } from 'sanity/structure'
import { schemaTypes } from './schemaTypes'

// Singleton document types — only one instance should exist
const singletonTypes = new Set(['siteSettings', 'navigation'])

// Custom desk structure for singletons
const deskStructure = (S) =>
  S.list()
    .title('Ceramisia CMS')
    .items([
      // ── Singletons at the top ─────────────────────────
      S.listItem()
        .title('Site Settings')
        .id('siteSettings')
        .child(
          S.document()
            .schemaType('siteSettings')
            .documentId('siteSettings')
            .title('Site Settings')
        ),
      S.listItem()
        .title('Navigation & Menus')
        .id('navigation')
        .child(
          S.document()
            .schemaType('navigation')
            .documentId('navigation')
            .title('Navigation & Menus')
        ),

      S.divider(),

      // ── Pages ─────────────────────────────────────────
      S.documentTypeListItem('page').title('Pages'),

      S.divider(),

      // ── Content ───────────────────────────────────────
      S.documentTypeListItem('product').title('Products'),
      S.documentTypeListItem('category').title('Categories'),
      S.documentTypeListItem('blogPost').title('Blog Posts'),

      S.divider(),

      // ── Orders ────────────────────────────────────────
      S.documentTypeListItem('order').title('Orders & Inquiries'),
    ])

export default defineConfig({
  name: 'ceramisia',
  title: 'Ceramisia Studio',

  projectId: 'x08ju18x',
  dataset: 'production',

  plugins: [
    structureTool({ structure: deskStructure }),
  ],

  schema: {
    types: schemaTypes,
    // Prevent creating new singletons via the "New document" button
    templates: (templates) =>
      templates.filter(({ schemaType }) => !singletonTypes.has(schemaType)),
  },

  document: {
    // Prevent singletons from being deleted or duplicated
    actions: (input, context) =>
      singletonTypes.has(context.schemaType)
        ? input.filter(({ action }) =>
            action && ['publish', 'discardChanges', 'restore'].includes(action)
          )
        : input,
  },
})
