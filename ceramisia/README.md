# Ceramisia Project

Ceramisia is a static website project that integrates with Sanity CMS for dynamic content management. This project is designed to showcase products, provide information about the site, and allow for easy updates through a user-friendly content management system.

## Project Structure

The project consists of the following files and directories:

- **index.html**: The main entry point of the website, containing the layout for the homepage.
- **about.html**: Static content for the About page.
- **products.html**: Displays the products or artworks available on the website.
- **contact.html**: Static content for the Contact page.
- **page.html**: Template for dynamically rendering pages based on the slug.
- **404.html**: Displays when a requested page is not found, with a JavaScript redirect for dynamic content.
- **assets/**: Contains all static assets including CSS and JavaScript files.
  - **css/styles.css**: Styles for the website.
  - **js/main.js**: Main JavaScript file for general functionality.
  - **js/sanity-client.js**: Initializes the Sanity client and fetches data.
  - **js/page-loader.js**: Logic for loading and rendering content based on the slug.
  - **js/products-loader.js**: Logic for fetching and rendering product data.
- **cms/**: Contains all files related to the Sanity CMS setup.
  - **sanity.config.ts**: Configuration for the Sanity Studio.
  - **sanity.cli.ts**: CLI commands for Sanity.
  - **package.json**: Lists dependencies and scripts for the Sanity Studio.
  - **tsconfig.json**: TypeScript configuration for the Sanity Studio.
  - **.env.example**: Example environment variables for the Sanity project.
  - **schemaTypes/**: Contains schema definitions for the CMS.
    - **index.ts**: Exports all schema types.
    - **page.ts**: Schema for pages.
    - **product.ts**: Schema for products/artworks.
    - **siteSettings.ts**: Schema for site settings.
- **.github/**: Contains GitHub Actions workflows.
  - **workflows/deploy.yml**: Workflow for deploying the website to GitHub Pages.
- **README.md**: Documentation for the project.

## Setup Instructions

1. **Clone the Repository**: Clone this repository to your local machine.
2. **Install Dependencies**: Navigate to the `cms` directory and run `npm install` to install the necessary dependencies for the Sanity Studio.
3. **Configure Sanity**: Update the `.env` file with your Sanity project ID and dataset.
4. **Run Sanity Studio**: Use the command `sanity start` in the `cms` directory to start the Sanity Studio locally.
5. **Deploy to GitHub Pages**: Follow the instructions in the `.github/workflows/deploy.yml` file to set up automatic deployment to GitHub Pages.

## Usage Guidelines

- Use the Sanity Studio to manage content for the website. You can add, edit, or delete pages and products as needed.
- The website will automatically reflect changes made in the Sanity CMS.
- Ensure that all static assets are properly linked in the HTML files.

For any issues or contributions, please refer to the project's GitHub repository.