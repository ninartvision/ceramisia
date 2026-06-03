// sanity-studio/sanity.cli.js
const { defineCliConfig } = require('sanity/cli')

module.exports = defineCliConfig({
  api: {
    projectId: 'uemjhi9v',
    dataset: 'production',
  },
  studioHost: 'ceramisia',
})
