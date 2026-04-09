/**
 * Ceramisia – GROQ Queries Reference
 * Copy these into your fetch layer (sanity.js) or use directly.
 *
 * All queries follow the bilingual (GE/EN) pattern used throughout the site.
 */

// ═══════════════════════════════════════════════════════
// PRODUCTS
// ═══════════════════════════════════════════════════════

// Fetch all products (in stock)
export const ALL_PRODUCTS = `
  *[_type == "product" && inStock == true] | order(order asc) {
    _id,
    name,
    nameEn,
    "slug": slug.current,
    sku,
    mainImage,
    price,
    salePrice,
    badge,
    isFeatured,
    inStock,
    additionalPackaging,
    packagingPrice,
    variants,
    "categoryTitle": category->title,
    "categoryTitleEn": category->titleEn,
    "categorySlug": category->slug.current
  }
`

// Fetch products by category slug
export const PRODUCTS_BY_CATEGORY = `
  *[_type == "product" && category->slug.current == $categorySlug && inStock == true] | order(order asc) {
    _id,
    name,
    nameEn,
    "slug": slug.current,
    sku,
    mainImage,
    price,
    salePrice,
    badge,
    isFeatured,
    variants,
    "categoryTitle": category->title,
    "categoryTitleEn": category->titleEn,
    "categorySlug": category->slug.current
  }
`

// Fetch featured products (for homepage)
export const FEATURED_PRODUCTS = `
  *[_type == "product" && isFeatured == true && inStock == true] | order(order asc) {
    _id,
    name,
    nameEn,
    "slug": slug.current,
    mainImage,
    price,
    salePrice,
    badge,
    "categoryTitle": category->title,
    "categoryTitleEn": category->titleEn,
    "categorySlug": category->slug.current
  }
`

// Fetch single product by slug (full detail)
export const PRODUCT_BY_SLUG = `
  *[_type == "product" && slug.current == $slug][0] {
    _id,
    name,
    nameEn,
    "slug": slug.current,
    sku,
    description,
    descriptionEn,
    mainImage,
    gallery,
    price,
    salePrice,
    badge,
    inStock,
    isFeatured,
    variants,
    additionalPackaging,
    packagingPrice,
    category->{ _id, title, titleEn, "slug": slug.current },
    seo
  }
`

// ═══════════════════════════════════════════════════════
// CATEGORIES
// ═══════════════════════════════════════════════════════

export const ALL_CATEGORIES = `
  *[_type == "category"] | order(order asc) {
    _id,
    title,
    titleEn,
    "slug": slug.current,
    description,
    descriptionEn,
    image
  }
`

// ═══════════════════════════════════════════════════════
// PAGES
// ═══════════════════════════════════════════════════════

// Fetch page by slug (home, about, contact)
export const PAGE_BY_SLUG = `
  *[_type == "page" && slug.current == $slug][0] {
    _id,
    title,
    titleEn,
    "slug": slug.current,
    heroImage,
    heroHeading,
    heroHeadingEn,
    heroSubtext,
    heroSubtextEn,
    sections[] {
      _key,
      heading,
      headingEn,
      text,
      textEn,
      image
    },
    seo
  }
`

// Fetch homepage content (convenience alias)
export const HOMEPAGE = `
  *[_type == "page" && slug.current == "home"][0] {
    _id,
    title,
    titleEn,
    heroImage,
    heroHeading,
    heroHeadingEn,
    heroSubtext,
    heroSubtextEn,
    sections[] {
      _key,
      heading,
      headingEn,
      text,
      textEn,
      image
    },
    seo
  }
`

// ═══════════════════════════════════════════════════════
// SITE SETTINGS (global)
// ═══════════════════════════════════════════════════════

export const SITE_SETTINGS = `
  *[_type == "siteSettings"][0] {
    siteTitle,
    logo,
    logoDark,
    favicon,
    homepageTitle,
    homepageTitleEn,
    homepageDescription,
    homepageDescriptionEn,
    heroImage,
    contactEmail,
    phoneNumber,
    address,
    addressEn,
    mapEmbedUrl,
    socialLinks,
    seo
  }
`

// ═══════════════════════════════════════════════════════
// NAVIGATION
// ═══════════════════════════════════════════════════════

export const NAVIGATION = `
  *[_type == "navigation"][0] {
    mainMenu[] {
      _key,
      title,
      titleEn,
      link,
      openInNewTab
    },
    footerLinks[] {
      _key,
      title,
      titleEn,
      link,
      openInNewTab
    },
    footerText,
    footerTextEn
  }
`

// ═══════════════════════════════════════════════════════
// BLOG POSTS
// ═══════════════════════════════════════════════════════

export const BLOG_POSTS = `
  *[_type == "blogPost"] | order(publishedAt desc) [0...$limit] {
    _id,
    title,
    titleEn,
    "slug": slug.current,
    publishedAt,
    image,
    excerpt,
    excerptEn,
    tags
  }
`

export const BLOG_POST_BY_SLUG = `
  *[_type == "blogPost" && slug.current == $slug][0] {
    _id,
    title,
    titleEn,
    "slug": slug.current,
    publishedAt,
    image,
    excerpt,
    excerptEn,
    body,
    bodyEn,
    tags
  }
`

// ═══════════════════════════════════════════════════════
// ORDERS (admin queries)
// ═══════════════════════════════════════════════════════

export const ALL_ORDERS = `
  *[_type == "order"] | order(createdAt desc) {
    _id,
    customerName,
    phone,
    email,
    message,
    status,
    createdAt,
    selectedProducts[] {
      quantity,
      variant,
      product->{ _id, name, nameEn, price, mainImage }
    }
  }
`
