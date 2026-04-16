// sanity-studio/sanity.config.js
import { defineConfig } from 'sanity'
import { structureTool } from 'sanity/structure'
import { schemaTypes } from './schemaTypes'
import { structure } from './structure'

// Singleton document types — only one instance should exist
const singletonTypes = new Set(['siteSettings', 'navigation', 'homepage'])

export default defineConfig({
  name: 'ceramisia',
  title: 'Ceramisia Studio',

  projectId: 'uemjhi9v',
  dataset: 'production',

  plugins: [
    structureTool({ structure }),
  ],

  schema: {
    types: schemaTypes,
    // Prevent creating new singletons via the "New document" button
    templates: (templates) =>
      templates.filter(({ schemaType }) => !singletonTypes.has(schemaType)),
  },

  document: {
    actions: (input, context) =>
      singletonTypes.has(context.schemaType)
        ? input.filter(({ action }) =>
            action && ['publish', 'discardChanges', 'restore'].includes(action)
          )
        : input,
  },
})
