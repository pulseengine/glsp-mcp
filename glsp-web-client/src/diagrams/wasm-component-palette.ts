/**
 * WASM Component Palette
 * Shows available WASM components that can be dragged into diagrams
 */

import { McpClient } from "../mcp/client.js";

export interface WasmComponentInfo {
  name: string;
  path: string;
  description: string;
  status: "available" | "missing";
  interfaces: number;
  lastSeen?: string;
  removedAt?: string;
}

export interface DragEventData {
  componentName: string;
  componentInfo: WasmComponentInfo;
}

export class WasmComponentPalette {
  private element: HTMLElement;
  private mcpClient: McpClient;
  private components: WasmComponentInfo[] = [];
  private dragData?: DragEventData;
  private _countdownInterval?: NodeJS.Timeout;

  constructor(mcpClient: McpClient) {
    this.mcpClient = mcpClient;
    this.element = this.createElement();
    this.setupEventHandlers();

    // Start with palette hidden until wasm-component diagram is selected
    this.element.style.display = "none";
  }

  private createElement(): HTMLElement {
    const palette = document.createElement("div");
    palette.className = "wasm-component-palette";
    palette.innerHTML = `
            <div class="palette-header">
                <h3>WASM Components</h3>
                <div class="palette-header-actions">
                    <button id="refresh-components" class="refresh-btn" title="Refresh component list">🔄</button>
                    <button class="palette-minimize-btn" title="Minimize">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M19 13H5v-2h14v2z"/>
                        </svg>
                    </button>
                </div>
            </div>
            <div class="palette-search">
                <input type="text" id="component-search" placeholder="Search components..." />
            </div>
            <div class="palette-status">
                <span id="component-count" class="status-loading">
                    <span class="loading"></span>
                    <span style="margin-left: 8px;">Loading...</span>
                </span>
                <span id="component-health"></span>
            </div>
            <div class="palette-content" id="component-list">
                <div class="loading-container">
                    <div class="loading-pulse">
                        <span></span>
                        <span></span>
                        <span></span>
                    </div>
                    <div class="loading-text">Loading WASM components...</div>
                    <div class="loading-timeout-indicator">
                        <div class="loading-timeout-bar">
                            <div class="loading-timeout-progress"></div>
                        </div>
                        <span class="loading-timeout-text">10s</span>
                    </div>
                </div>
            </div>
        `;

    // Make it minimizable
    this.setupMinimizable(palette);

    // Make it draggable
    this.setupDraggable(palette);

    return palette;
  }

  private setupEventHandlers(): void {
    // Refresh button
    const refreshBtn = this.element.querySelector(
      "#refresh-components",
    ) as HTMLButtonElement;
    refreshBtn?.addEventListener("click", () => {
      // Add spinning animation to refresh button
      refreshBtn.classList.add("refreshing");
      refreshBtn.disabled = true;

      this.loadComponents().finally(() => {
        // Remove spinning animation after loading completes
        refreshBtn.classList.remove("refreshing");
        refreshBtn.disabled = false;
      });
    });

    // Search functionality
    this.element
      .querySelector("#component-search")
      ?.addEventListener("input", (e) => {
        const searchTerm = (e.target as HTMLInputElement).value.toLowerCase();
        this.filterComponents(searchTerm);
      });
  }

  public async loadComponents(): Promise<void> {
    // Show loading state
    this.showLoadingState();

    // Set a timeout timer
    const timeoutDuration = 10000; // 10 seconds
    let timeoutId: number | undefined;
    let isTimedOut = false;

    try {
      // Create timeout promise
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = window.setTimeout(() => {
          isTimedOut = true;
          reject(new Error("Request timed out after 10 seconds"));
        }, timeoutDuration);
      });

      // Create the actual loading promise
      const loadPromise = (async () => {
        // First trigger a scan to ensure we have latest data
        await this.mcpClient.callTool("scan_wasm_components", {});

        // Get components list
        const listResource = await this.mcpClient.readResource(
          "wasm://components/list",
        );
        const data = JSON.parse(listResource.text || "{}");

        this.components = data.components || [];
        return data;
      })();

      // Race between timeout and actual load
      const data = await Promise.race([loadPromise, timeoutPromise]);

      // Clear timeout if successful
      if (timeoutId) window.clearTimeout(timeoutId);

      // Clear countdown interval
      if (this._countdownInterval) {
        clearInterval(this._countdownInterval);
        this._countdownInterval = undefined;
      }

      this.renderComponents();
      this.updateStatus(data);
    } catch (error) {
      console.error("Failed to load WASM components:", error);

      // Clear countdown interval on error
      if (this._countdownInterval) {
        clearInterval(this._countdownInterval);
        this._countdownInterval = undefined;
      }

      // Clear timeout if it's still pending
      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }

      if (isTimedOut) {
        console.log("Request timed out - showing timeout error");
        this.showError("Request timed out. Click refresh to try again.");
      } else {
        console.log("Request failed - showing generic error");
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        if (
          errorMessage.includes("Method not found") ||
          errorMessage.includes("Not implemented")
        ) {
          this.showError(
            "WASM backend not available. Please start the MCP server with WASM component support.",
          );
        } else {
          this.showError("Failed to load WASM components");
        }
      }
    }
  }

  public async refreshComponents(): Promise<void> {
    console.log("Refreshing WASM components...");
    try {
      await this.loadComponents();
    } catch (error) {
      console.error("Failed to refresh components:", error);
    }
  }

  private renderComponents(): void {
    const listElement = this.element.querySelector("#component-list");
    if (!listElement) return;

    if (this.components.length === 0) {
      listElement.innerHTML =
        '<div class="no-components">No WASM components found</div>';
      return;
    }

    listElement.innerHTML = this.components
      .map((component) => this.renderComponent(component))
      .join("");

    // Add drag event handlers to component items
    listElement.querySelectorAll(".component-item").forEach((item, index) => {
      this.setupComponentDragHandlers(
        item as HTMLElement,
        this.components[index],
      );
    });
  }

  private renderComponent(component: WasmComponentInfo): string {
    const statusIcon = component.status === "available" ? "✅" : "❌";
    const statusClass =
      component.status === "available" ? "available" : "missing";

    return `
            <div class="component-item ${statusClass}" draggable="true" data-component="${
              component.name
            }">
                <div class="component-header">
                    <span class="component-status">${statusIcon}</span>
                    <span class="component-name">${component.name}</span>
                    <span class="interface-count">${
                      component.interfaces
                    } interfaces</span>
                </div>
                <div class="component-description">${
                  component.description
                }</div>
                <div class="component-details">
                    <span class="component-path">${component.path}</span>
                    ${
                      component.status === "missing"
                        ? `<span class="missing-info">Missing since: ${
                            component.removedAt || "Unknown"
                          }</span>`
                        : ""
                    }
                </div>
            </div>
        `;
  }

  private setupComponentDragHandlers(
    element: HTMLElement,
    component: WasmComponentInfo,
  ): void {
    element.addEventListener("dragstart", (e) => {
      if (component.status !== "available") {
        e.preventDefault();
        this.showNotification(
          `Cannot drag missing component: ${component.name}`,
        );
        return;
      }

      this.dragData = {
        componentName: component.name,
        componentInfo: component,
      };

      e.dataTransfer!.effectAllowed = "copy";
      e.dataTransfer!.setData(
        "application/wasm-component",
        JSON.stringify(this.dragData),
      );

      // Visual feedback
      element.classList.add("dragging");
      this.showNotification(
        `Dragging ${component.name} - drop on diagram to add`,
      );
    });

    element.addEventListener("dragend", () => {
      element.classList.remove("dragging");
      this.dragData = undefined;
    });

    // Double-click to add to center of diagram
    element.addEventListener("dblclick", () => {
      if (component.status === "available") {
        this.addComponentToCenter(component);
      }
    });
  }

  private filterComponents(searchTerm: string): void {
    const items = this.element.querySelectorAll(".component-item");
    items.forEach((item) => {
      const componentName =
        item.querySelector(".component-name")?.textContent?.toLowerCase() || "";
      const description =
        item
          .querySelector(".component-description")
          ?.textContent?.toLowerCase() || "";

      const matches =
        componentName.includes(searchTerm) || description.includes(searchTerm);
      (item as HTMLElement).style.display = matches ? "block" : "none";
    });
  }

  private updateStatus(data: Record<string, unknown>): void {
    const countElement = this.element.querySelector("#component-count");
    const healthElement = this.element.querySelector("#component-health");

    if (countElement) {
      // Remove loading state and update text
      countElement.classList.remove("status-loading");
      countElement.innerHTML = `${data.total || 0} components`;
    }

    if (healthElement) {
      const available = data.available || 0;
      const missing = data.missing || 0;
      const healthIcon =
        missing === 0 ? "🟢" : missing < available ? "🟡" : "🔴";
      healthElement.innerHTML = `${healthIcon} ${available} available, ${missing} missing`;
    }
  }

  private showError(message: string): void {
    const listElement = this.element.querySelector("#component-list");
    if (listElement) {
      const isTimeout = message.includes("timed out");
      listElement.innerHTML = `
                <div class="error-container">
                    <div class="error-icon">${isTimeout ? "⏱️" : "❌"}</div>
                    <div class="error">${message}</div>
                    ${
                      isTimeout
                        ? `
                        <button class="retry-btn" onclick="document.querySelector('#refresh-components').click()">
                            <span class="retry-icon">🔄</span>
                            Retry
                        </button>
                    `
                        : ""
                    }
                </div>
            `;
    }

    // Also update the status to show error
    const countElement = this.element.querySelector("#component-count");
    if (countElement) {
      countElement.classList.remove("status-loading");
      countElement.innerHTML = `<span class="error-text">Failed to load</span>`;
    }
  }

  private showLoadingState(): void {
    const listElement = this.element.querySelector("#component-list");
    if (!listElement) return;

    // Reset status to loading
    const countElement = this.element.querySelector("#component-count");
    if (countElement) {
      countElement.classList.add("status-loading");
      countElement.innerHTML = `
                <span class="loading"></span>
                <span style="margin-left: 8px;">Loading...</span>
            `;
    }

    // Show loading with timeout indicator
    let remainingTime = 10;
    listElement.innerHTML = `
            <div class="loading-container">
                <div class="loading-pulse">
                    <span></span>
                    <span></span>
                    <span></span>
                </div>
                <div class="loading-text">Loading WASM components...</div>
                <div class="loading-timeout-indicator">
                    <div class="loading-timeout-bar">
                        <div class="loading-timeout-progress"></div>
                    </div>
                    <span class="loading-timeout-text">${remainingTime}s</span>
                </div>
            </div>
        `;

    // Update countdown timer
    const countdownInterval = setInterval(() => {
      remainingTime--;
      const timeoutText = listElement.querySelector(".loading-timeout-text");
      if (timeoutText) {
        timeoutText.textContent = `${remainingTime}s`;
      }

      if (remainingTime <= 0) {
        clearInterval(countdownInterval);
        // Stop the progress bar animation by setting width to 0
        const progressBar = listElement.querySelector(
          ".loading-timeout-progress",
        ) as HTMLElement;
        if (progressBar) {
          progressBar.style.animation = "none";
          progressBar.style.width = "0%";
        }
        // Add timed-out class to make loading animation more subdued
        const loadingContainer =
          listElement.querySelector(".loading-container");
        if (loadingContainer) {
          loadingContainer.classList.add("timed-out");
        }
      }
    }, 1000);

    // Store interval ID to clear later if needed
    this._countdownInterval = countdownInterval;
  }

  private showNotification(message: string): void {
    // Simple notification - in a real app this would be a proper toast/notification system
    console.log(`WASM Palette: ${message}`);

    // You could also update a status area or show a temporary message
    const statusElement = this.element.querySelector("#component-count");
    if (statusElement) {
      const originalText = statusElement.textContent;
      statusElement.textContent = message;
      setTimeout(() => {
        statusElement.textContent = originalText;
      }, 3000);
    }
  }

  private async addComponentToCenter(
    component: WasmComponentInfo,
  ): Promise<void> {
    // This would be called by the parent app when a component is double-clicked
    // For now, just log it - the actual implementation will be in the main app
    console.log(`Add component ${component.name} to center of diagram`);
    this.showNotification(
      `Double-click detected for ${component.name} - implement in main app`,
    );
  }

  public getElement(): HTMLElement {
    return this.element;
  }

  public getDragData(): DragEventData | undefined {
    return this.dragData;
  }

  public async show(): Promise<void> {
    this.element.style.display = "block";
    await this.loadComponents();
  }

  public hide(): void {
    this.element.style.display = "none";
  }

  public isVisible(): boolean {
    return this.element.style.display !== "none";
  }

  // Called by external code when a component is successfully added to diagram
  public onComponentAdded(componentName: string): void {
    this.showNotification(`Successfully added ${componentName} to diagram`);
  }

  // Called by external code when a component add fails
  public onComponentAddFailed(componentName: string, error: string): void {
    this.showNotification(`Failed to add ${componentName}: ${error}`);
  }

  private setupMinimizable(palette: HTMLElement): void {
    const minimizeBtn = palette.querySelector(".palette-minimize-btn");
    if (minimizeBtn) {
      minimizeBtn.addEventListener("click", () => {
        palette.classList.toggle("minimized");

        // Update minimize button icon
        const svg = minimizeBtn.querySelector("svg");
        if (palette.classList.contains("minimized")) {
          // Show expand icon when minimized
          svg!.innerHTML =
            '<path d="M12 8l-6 6 1.41 1.41L12 10.83l4.59 4.58L18 14z"/>';
        } else {
          // Show minimize icon when expanded
          svg!.innerHTML = '<path d="M19 13H5v-2h14v2z"/>';
        }
      });
    }
  }

  private setupDraggable(palette: HTMLElement): void {
    const header = palette.querySelector(".palette-header") as HTMLElement;
    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let startLeft = 0;
    let startTop = 0;

    header.addEventListener("mousedown", (e) => {
      // Don't drag if clicking on buttons
      if ((e.target as HTMLElement).closest("button")) {
        return;
      }

      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;

      const rect = palette.getBoundingClientRect();
      startLeft = rect.left;
      startTop = rect.top;

      document.body.style.cursor = "move";
      document.body.style.userSelect = "none";

      e.preventDefault();
    });

    document.addEventListener("mousemove", (e) => {
      if (!isDragging) return;

      const deltaX = e.clientX - startX;
      const deltaY = e.clientY - startY;

      let newLeft = startLeft + deltaX;
      let newTop = startTop + deltaY;

      // Constrain to viewport
      const maxLeft = window.innerWidth - palette.offsetWidth;
      const maxTop = window.innerHeight - palette.offsetHeight;

      newLeft = Math.max(0, Math.min(newLeft, maxLeft));
      newTop = Math.max(0, Math.min(newTop, maxTop));

      palette.style.left = newLeft + "px";
      palette.style.top = newTop + "px";
      palette.style.right = "auto";
    });

    document.addEventListener("mouseup", () => {
      if (isDragging) {
        isDragging = false;
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      }
    });
  }
}
