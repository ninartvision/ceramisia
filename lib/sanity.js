import { createClient } from "@sanity/client";

/** Same project as sanity-studio/sanity.config.js */
const STUDIO_PROJECT_ID = "uemjhi9v";

const projectId =
  (process.env.SANITY_PROJECT_ID && process.env.SANITY_PROJECT_ID.trim()) ||
  STUDIO_PROJECT_ID;
const dataset =
  (process.env.SANITY_DATASET && process.env.SANITY_DATASET.trim()) ||
  "production";
const token =
  process.env.SANITY_API_TOKEN && process.env.SANITY_API_TOKEN.trim();

export const client = createClient({
  projectId,
  dataset,
  apiVersion: "2024-01-01",
  useCdn: false,
  token,
});
