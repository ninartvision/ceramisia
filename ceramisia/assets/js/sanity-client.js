// This file initializes the Sanity client and contains functions for fetching data from Sanity CMS.

import sanityClient from '@sanity/client';

const client = sanityClient({
  projectId: 'your_project_id', // replace with your Sanity project ID
  dataset: 'your_dataset_name', // replace with your dataset name
  apiVersion: '2023-10-01', // use a UTC date string
  token: 'your_token', // replace with your API token if needed
  useCdn: true, // `false` if you want to ensure fresh data
});

// Function to fetch all pages
export const fetchPages = async () => {
  const query = '*[_type == "page"]';
  return await client.fetch(query);
};

// Function to fetch a single page by slug
export const fetchPageBySlug = async (slug) => {
  const query = `*[_type == "page" && slug.current == $slug][0]`;
  return await client.fetch(query, { slug });
};

// Function to fetch all products
export const fetchProducts = async () => {
  const query = '*[_type == "product"]';
  return await client.fetch(query);
};

// Function to fetch a single product by slug
export const fetchProductBySlug = async (slug) => {
  const query = `*[_type == "product" && slug.current == $slug][0]`;
  return await client.fetch(query, { slug });
};