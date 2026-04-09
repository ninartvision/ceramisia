// sanity-studio/sanity.cli.js
import { defineCliConfig } from 'sanity/cli'

export default defineCliConfig({
  api: {
    projectId: 'YOUR_PROJECT_ID',  // ← replace with your Sanity project ID
    dataset: 'production',
  },
})
