import { defineCliConfig } from 'sanity/cli';

export default defineCliConfig({
  api: {
    projectId: 'your_project_id', // Replace with your actual project ID
    dataset: 'production', // Replace with your actual dataset name
  },
});