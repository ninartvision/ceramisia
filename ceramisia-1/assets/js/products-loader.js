// This file contains logic for fetching and rendering product data from Sanity CMS.

const sanityClient = require('./sanity-client');

const productsContainer = document.getElementById('products-container');

async function fetchProducts() {
  const query = '*[_type == "product"]{_id, title, description, price, image}';
  try {
    const products = await sanityClient.fetch(query);
    renderProducts(products);
  } catch (error) {
    console.error('Error fetching products:', error);
    productsContainer.innerHTML = '<p>Unable to load products at this time.</p>';
  }
}

function renderProducts(products) {
  if (products.length === 0) {
    productsContainer.innerHTML = '<p>No products found.</p>';
    return;
  }

  productsContainer.innerHTML = products.map(product => `
    <div class="product">
      <img src="${product.image.asset.url}" alt="${product.title}" />
      <h2>${product.title}</h2>
      <p>${product.description}</p>
      <p>Price: $${product.price}</p>
    </div>
  `).join('');
}

// Initialize the product loader
document.addEventListener('DOMContentLoaded', fetchProducts);