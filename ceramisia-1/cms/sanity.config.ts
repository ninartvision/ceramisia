import { defineConfig } from 'sanity';
import { deskTool } from 'sanity/desk';
import { visionTool } from '@sanity/vision';
import schemaTypes from './schemaTypes';

export default defineConfig({
  name: 'ceramisia',
  title: 'Ceramisia',

  projectId: 'your_project_id', // Replace with your actual project ID
  dataset: 'production', // Replace with your actual dataset name

  plugins: [deskTool(), visionTool()],

  schema: {
    types: schemaTypes,
  },
});