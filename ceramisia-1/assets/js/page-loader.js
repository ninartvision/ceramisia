// This file contains logic for loading and rendering content for different pages based on the slug.

document.addEventListener("DOMContentLoaded", function() {
  const slug = new URLSearchParams(window.location.search).get("slug");

  if (slug) {
    fetchPageContent(slug);
  } else {
    display404();
  }

  function fetchPageContent(slug) {
    fetch(`https://<your-sanity-project-id>.api.sanity.io/v1/data/query/<your-dataset>?query=*[_type == "page" && slug.current == $slug]{title, content}`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${<your-sanity-token>}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ slug })
    })
    .then(response => response.json())
    .then(data => {
      if (data.result && data.result.length > 0) {
        renderPage(data.result[0]);
      } else {
        display404();
      }
    })
    .catch(error => {
      console.error("Error fetching page content:", error);
      display404();
    });
  }

  function renderPage(page) {
    document.title = page.title;
    const contentContainer = document.getElementById("content");
    contentContainer.innerHTML = page.content;
  }

  function display404() {
    document.title = "404 - Page Not Found";
    const contentContainer = document.getElementById("content");
    contentContainer.innerHTML = "<h1>404</h1><p>Page not found.</p>";
  }
});