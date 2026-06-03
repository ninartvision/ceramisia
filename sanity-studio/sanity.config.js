// sanity-studio/sanity.config.js
import { defineConfig } from 'sanity'
import { structureTool } from 'sanity/structure'
import { schemaTypes } from './schemaTypes'
import { structure } from './structure'

// Singleton document types — only one instance should exist
const singletonTypes = new Set(['siteSettings', 'navigation', 'homepage'])
const apiOnlyTypes = new Set(['order'])

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
      templates.filter(
        ({ schemaType }) =>
          !singletonTypes.has(schemaType) && !apiOnlyTypes.has(schemaType)
      ),
  },

  document: {
    actions: (input, context) => {
      if (singletonTypes.has(context.schemaType)) {
        return input.filter(({ action }) =>
          action && ['publish', 'discardChanges', 'restore'].includes(action)
        )
      }
      if (apiOnlyTypes.has(context.schemaType)) {
        return input.filter(({ action }) =>
          action && ['publish', 'discardChanges', 'restore', 'delete'].includes(action)
        )
      }
      return input
    },
  },
})
