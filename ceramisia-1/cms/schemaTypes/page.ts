export default {
  name: 'page',
  title: 'Page',
  type: 'document',
  fields: [
    {
      name: 'title',
      title: 'Title',
      type: 'string',
      validation: Rule => Rule.required().min(1).max(100)
    },
    {
      name: 'slug',
      title: 'Slug',
      type: 'slug',
      options: {
        source: 'title',
        maxLength: 96,
      },
      validation: Rule => Rule.required()
    },
    {
      name: 'content',
      title: 'Content',
      type: 'array',
      of: [{ type: 'block' }],
      validation: Rule => Rule.required()
    },
    {
      name: 'publishedAt',
      title: 'Published At',
      type: 'datetime',
      options: {
        dateFormat: 'YYYY-MM-DD',
        timeFormat: 'HH:mm',
        calendarTodayLabel: 'Today'
      }
    },
    {
      name: 'mainImage',
      title: 'Main Image',
      type: 'image',
      options: {
        hotspot: true,
      }
    },
    {
      name: 'heroSlides',
      title: 'Hero Slides',
      type: 'array',
      description: 'Homepage slider slides. If empty, frontend fallback slides are shown.',
      of: [
        {
          type: 'object',
          name: 'heroSlide',
          title: 'Hero Slide',
          fields: [
            {
              name: 'image',
              title: 'Slide Image',
              type: 'image',
              options: { hotspot: true },
              validation: Rule => Rule.required(),
              fields: [
                { name: 'alt', title: 'Alt Text', type: 'string' }
              ]
            },
            {
              name: 'heading',
              title: 'Heading',
              type: 'object',
              fields: [
                { name: 'ge', title: 'Heading (GE)', type: 'string', validation: Rule => Rule.required() },
                { name: 'en', title: 'Heading (EN)', type: 'string' }
              ]
            },
            {
              name: 'subtext',
              title: 'Subtext',
              type: 'object',
              fields: [
                { name: 'ge', title: 'Subtext (GE)', type: 'text', rows: 2 },
                { name: 'en', title: 'Subtext (EN)', type: 'text', rows: 2 }
              ]
            }
          ],
          preview: {
            select: {
              titleGe: 'heading.ge',
              titleEn: 'heading.en',
              media: 'image'
            },
            prepare(selection) {
              return {
                title: selection.titleGe || selection.titleEn || 'Untitled Slide',
                subtitle: selection.titleEn && selection.titleGe ? selection.titleEn : undefined,
                media: selection.media
              };
            }
          }
        }
      ]
    }
  ],
  preview: {
    select: {
      title: 'title',
      media: 'mainImage'
    }
  }
};