/**
 * Main entry point for GLSP Web Client
 */

import { AppController } from "./AppController.js";

// Initialize the application when DOM is loaded
document.addEventListener("DOMContentLoaded", () => {
  console.log("🚀 DOM Content Loaded - Initializing GLSP application...");

  // Add visual indicator that JS is loading
  const statusChip = document.querySelector(".status-chip span");
  if (statusChip) {
    statusChip.textContent = "Initializing...";
  }

  const canvas = document.getElementById("diagram-canvas") as HTMLCanvasElement;

  if (!canvas) {
    console.error("Canvas element not found");
    return;
  }

  console.log("Creating AppController...");
  const app = new AppController(canvas);

  // Make app globally available for HTML onclick handlers (for debugging/console access)
  (window as { app?: import("./AppController.js").AppController }).app = app;

  console.log("🚀 MCP-GLSP Web Client initialized");

  // Add visual confirmation
  setTimeout(() => {
    const statusChip = document.querySelector(".status-chip span");
    if (statusChip && statusChip.textContent === "Initializing...") {
      statusChip.textContent = "App Loaded";
    }
  }, 1000);
});

// Handle global errors
window.addEventListener("error", (event) => {
  console.error("Global error:", event.error);
});

window.addEventListener("unhandledrejection", (event) => {
  console.error("Unhandled promise rejection:", event.reason);
});
