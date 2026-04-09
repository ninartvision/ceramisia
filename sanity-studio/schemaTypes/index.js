// sanity-studio/schemaTypes/index.js
// Export all schema types for Sanity Studio

// Object types (must be registered before document types that use them)
import seo from './objects/seo'
import pageSection from './objects/pageSection'
import variant from './objects/variant'

// Document types
import category from './category'
import product from './product'
import blogPost from './blogPost'
import order from './order'
import siteSettings from './siteSettings'
import page from './page'
import navigation from './navigation'

export const schemaTypes = [
  // Objects
  seo,
  pageSection,
  variant,
  // Documents
  category,
  product,
  blogPost,
  order,
  siteSettings,
  page,
  navigation,
]
