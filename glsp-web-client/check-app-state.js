// Check application state and loading - run this in the browser console
console.log("=== Application State Check ===");

// Check if DOM is ready
console.log("Document ready state:", document.readyState);
console.log("Document body exists:", !!document.body);
console.log(
  "Document body children count:",
  document.body ? document.body.children.length : "No body",
);

// Check if main app element exists
const appElement = document.querySelector("#app");
console.log("App element exists:", !!appElement);
if (appElement) {
  console.log("App element content length:", appElement.innerHTML.length);
  console.log(
    "App element HTML (first 500 chars):",
    appElement.innerHTML.substring(0, 500),
  );
}

// Check for any error messages
const errorElements = document.querySelectorAll(
  '[class*="error"], [id*="error"]',
);
console.log("Error elements found:", errorElements.length);
errorElements.forEach((el) => {
  console.log("Error element:", el.textContent);
});

// Check if scripts are loaded
console.log("Number of script tags:", document.scripts.length);
Array.from(document.scripts).forEach((script, i) => {
  console.log(`Script ${i + 1}:`, script.src || "inline", script.type);
});

// Check for Vite dev server connection
console.log(
  "Vite client script present:",
  !!document.querySelector('script[src*="@vite/client"]'),
);

// Check window objects that should be available
console.log("Window objects check:");
console.log("  window.__TAURI__:", !!window.__TAURI__);
console.log("  window.__TAURI__.invoke:", !!window.__TAURI__?.invoke);

// Wait a bit and try again if body is empty
if (!document.body || document.body.children.length === 0) {
  console.log("Body is empty, waiting 2 seconds and checking again...");
  setTimeout(() => {
    console.log("=== After 2 seconds ===");
    console.log("Document ready state:", document.readyState);
    console.log(
      "Document body children count:",
      document.body ? document.body.children.length : "No body",
    );

    if (document.body && document.body.children.length > 0) {
      console.log("Body children:");
      Array.from(document.body.children).forEach((child, i) => {
        console.log(`  ${i + 1}:`, child.tagName, child.className, child.id);
      });
    }

    // Check for app element again
    const appElement = document.querySelector("#app");
    if (appElement) {
      console.log(
        "App element content after delay:",
        appElement.innerHTML.length > 0 ? "Has content" : "Still empty",
      );
    }
  }, 2000);
}

// Check if there are any console errors
console.log("=== Console Error Check ===");
console.log(
  "Check the Console tab for any JavaScript errors that might be preventing the app from loading",
);

// Try to trigger a manual app initialization if it exists
if (window.initializeApp) {
  console.log("Found window.initializeApp, attempting to call it...");
  try {
    window.initializeApp();
    console.log("Manual app initialization called successfully");
  } catch (error) {
    console.error("Error calling manual app initialization:", error);
  }
} else {
  console.log("No window.initializeApp function found");
}

console.log("=== End Application State Check ===");
