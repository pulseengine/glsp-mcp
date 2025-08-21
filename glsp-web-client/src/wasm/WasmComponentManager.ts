/**
 * Thin Client WASM Component Manager
 *
 * Simplified version that acts as a proxy to backend services.
 * Part of the architecture transformation to move business logic to the backend.
 *
 * Reduced from 600+ lines to ~150 lines by removing:
 * - Client-side validation
 * - Client-side transpilation
 * - Complex component introspection
 * - Heavy change notification system
 */

import { WasmComponentPalette } from "../diagrams/wasm-component-palette.js";
import { McpService } from "../services/McpService.js";
import { DiagramService } from "../services/DiagramService.js";
import {
  ValidationService,
  SecurityAnalysis as ServiceSecurityAnalysis,
} from "../services/ValidationService.js";
import { CanvasRenderer } from "../renderer/canvas-renderer.js";
import { WasmComponent, WasmInterface } from "../types/wasm-component.js";

// Re-export types for backward compatibility
export type { WasmComponent, WasmInterface } from "../types/wasm-component.js";
import {
  WasmComponentRendererV2,
  ComponentColors,
} from "../diagrams/wasm-component-renderer-v2.js";
import { GraphicsBridge, GraphicsAPI } from "./graphics/GraphicsBridge.js";
// Graphics components are now handled by GraphicsComponentPalette
// import { GraphicsComponentFactory } from './graphics/WasmGraphicsComponent.js'; // Ready for graphics component factory

interface SecurityAnalysis {
  safe: boolean;
  warnings: string[];
  restrictions: string[];
}

interface ComponentUpdateData {
  componentId: string;
  status: string;
  message?: string;
}

interface ComponentStatus {
  state: "loaded" | "unloaded" | "error" | "loading";
  message?: string;
  lastUpdated: number;
  metadata?: {
    size: number;
    interfaces: number;
    dependencies: string[];
    version?: string;
  };
}

// Using unified WasmComponent type from types/wasm-component.js

// Using unified WasmInterface from types/wasm-component.js
// Additional interfaces specific to this manager
export interface WasmFunction {
  name: string;
  params: WasmParam[];
  returns: WasmParam[];
}

export interface WasmParam {
  name: string;
  param_type: string;
}

export class WasmComponentManager {
  private wasmComponentPalette: WasmComponentPalette;
  protected mcpService: McpService;
  protected diagramService: DiagramService;
  private validationService: ValidationService;
  private renderer?: CanvasRenderer;
  private componentsCache: Map<string, WasmComponent> = new Map();
  private cacheTimeout = 5 * 60 * 1000; // 5 minutes
  private lastCacheUpdate = 0;

  // Advanced rendering properties
  private graphics?: GraphicsAPI;
  private componentColors: ComponentColors;
  private thumbnailCache: Map<string, string> = new Map(); // Cache for component thumbnails
  private statusCache: Map<string, ComponentStatus> = new Map(); // Cache for component status

  constructor(
    mcpService: McpService,
    diagramService: DiagramService,
    renderer?: CanvasRenderer,
  ) {
    this.mcpService = mcpService;
    this.diagramService = diagramService;
    this.renderer = renderer;
    this.validationService = new ValidationService(mcpService);
    this.wasmComponentPalette = new WasmComponentPalette(
      mcpService as unknown as import("../mcp/client.js").McpClient,
    );

    // Initialize advanced rendering
    this.componentColors = WasmComponentRendererV2.getDefaultColors();
    this.initializeGraphics();

    // Setup real-time updates via streaming
    this.setupStreamingUpdates();
  }

  /**
   * Get the palette UI element
   */
  public getPaletteElement(): HTMLElement {
    return this.wasmComponentPalette.getElement();
  }

  /**
   * Show the component palette
   */
  public async showPalette(): Promise<void> {
    await this.wasmComponentPalette.show();
  }

  /**
   * Hide the component palette
   */
  public hidePalette(): void {
    this.wasmComponentPalette.hide();
  }

  /**
   * Initialize WASM components (triggers backend scan)
   */
  public async initializeWasmComponents(): Promise<void> {
    console.log("WasmComponentManager: Initializing components...");

    try {
      // Trigger backend component scan
      await this.mcpService.callTool("scan_wasm_components", {});

      // Load component list
      await this.refreshComponentList();

      console.log("WasmComponentManager: Components initialized");
    } catch (error) {
      console.error("WasmComponentManager: Initialization failed:", error);
    }
  }

  /**
   * Get list of available WASM components from backend
   */
  public async getComponents(): Promise<WasmComponent[]> {
    // Check cache first
    if (this.isCacheValid()) {
      console.log("WasmComponentManager: Using cached component list");
      return Array.from(this.componentsCache.values());
    }

    return await this.refreshComponentList();
  }

  /**
   * Get a specific component by name or ID
   */
  public async getComponent(nameOrId: string): Promise<WasmComponent | null> {
    const components = await this.getComponents();
    return (
      components.find(
        (comp) => comp.name === nameOrId || comp.name.includes(nameOrId),
      ) || null
    );
  }

  /**
   * Check if a component is loaded and ready for execution
   */
  public isComponentLoaded(nameOrId: string): boolean {
    // Check in cache first
    const cached = this.statusCache.get(`metadata_${nameOrId}`);
    if (cached) {
      return cached.state === "loaded";
    }

    // For thin client, we assume components from the list are available
    const component = Array.from(this.componentsCache.values()).find(
      (comp) => comp.name === nameOrId || comp.name.includes(nameOrId),
    );

    return component?.fileExists || false;
  }

  /**
   * Load a component for execution
   */
  public async loadComponent(nameOrId: string): Promise<WasmComponent | null> {
    console.log(
      `WasmComponentManager: Loading component for execution: ${nameOrId}`,
    );

    try {
      // First check if component exists
      let component = await this.getComponent(nameOrId);

      if (!component) {
        console.error(`Component not found: ${nameOrId}`);
        return null;
      }

      // Call backend to ensure component is loaded
      const loadResult = await this.mcpService.callTool("load_wasm_component", {
        componentName: component.name,
        componentPath: component.path,
      });

      if (loadResult.success) {
        // Update cache with loaded status
        const cacheKey = `metadata_${component.name}`;
        this.statusCache.set(cacheKey, {
          state: "loaded",
          message: "Component loaded for execution",
          lastUpdated: Date.now(),
          metadata: {
            size: await this.getComponentSize(component),
            interfaces: component.interfaces?.length || 0,
            dependencies: [],
            version: "1.0.0",
          },
        });

        console.log(`Component loaded successfully: ${component.name}`);
        return component;
      } else {
        console.error(`Failed to load component: ${loadResult.error}`);
        return null;
      }
    } catch (error) {
      console.error(`Error loading component ${nameOrId}:`, error);
      return null;
    }
  }

  /**
   * Refresh component list from backend
   */
  private async refreshComponentList(): Promise<WasmComponent[]> {
    console.log(
      "WasmComponentManager: Refreshing component list from backend...",
    );

    try {
      const result = await this.mcpService.callTool("scan_wasm_components", {});

      if (result && result.content && result.content[0]) {
        console.log(
          "WasmComponentManager: Raw response from scan_wasm_components:",
          result.content[0].text,
        );

        // Check if response looks like JSON
        const rawText = result.content[0].text;
        if (!rawText) {
          console.warn("WasmComponentManager: No text content in response");
          return [];
        }

        if (!rawText.startsWith("{") && !rawText.startsWith("[")) {
          console.warn(
            "WasmComponentManager: Response does not appear to be JSON, got:",
            rawText.substring(0, 100),
          );
          return [];
        }

        const componentData = JSON.parse(rawText);
        const components: WasmComponent[] = componentData.components || [];

        // Update cache
        this.updateCache(components);

        console.log(
          `WasmComponentManager: Loaded ${components.length} components`,
        );
        return components;
      }

      return [];
    } catch (error) {
      console.error(
        "WasmComponentManager: Failed to refresh component list:",
        error,
      );
      return [];
    }
  }

  /**
   * Request security analysis for a component (delegates to ValidationService)
   */
  public async getSecurityAnalysis(
    componentName: string,
  ): Promise<ServiceSecurityAnalysis | null> {
    const analysis =
      await this.validationService.requestSecurityAnalysis(componentName);
    return analysis;
  }

  /**
   * Request WIT validation for a component (delegates to ValidationService)
   */
  public async getWitAnalysis(
    componentName: string,
  ): Promise<
    import("../services/ValidationService.js").ComponentWitAnalysis | null
  > {
    return await this.validationService.requestWitValidation(componentName);
  }

  /**
   * Check compatibility between two components
   */
  public async checkCompatibility(
    componentA: string,
    componentB: string,
  ): Promise<Record<string, unknown> | null> {
    const analysis = await this.validationService.requestCompatibilityAnalysis(
      componentA,
      componentB,
    );

    // Convert CompatibilityAnalysis to Record<string, unknown> for compatibility
    return analysis ? ({ ...analysis } as Record<string, unknown>) : null;
  }

  /**
   * Setup real-time updates via HTTP streaming
   */
  private setupStreamingUpdates(): void {
    const mcpClient = this.mcpService.getClient();

    // Listen for component updates
    mcpClient.addStreamListener(
      "wasm_component_update",
      (data: ComponentUpdateData) => {
        console.log("WasmComponentManager: Component update received:", data);
        this.handleComponentUpdate(data);
      },
    );

    // Listen for component discovery
    mcpClient.addStreamListener(
      "wasm_component_discovered",
      (data: Record<string, unknown>) => {
        console.log("WasmComponentManager: New component discovered:", data);
        this.handleComponentDiscovered(data);
      },
    );

    // Listen for component removal
    mcpClient.addStreamListener(
      "wasm_component_removed",
      (data: Record<string, unknown>) => {
        console.log("WasmComponentManager: Component removed:", data);
        this.handleComponentRemoved(data);
      },
    );

    // Setup validation streaming
    this.validationService.setupValidationStreaming();
  }

  /**
   * Handle component update from streaming
   */
  private handleComponentUpdate(data: ComponentUpdateData): void {
    if (data.component) {
      const component = data.component as WasmComponent;
      this.componentsCache.set(component.name, component);

      // Notify UI of update
      this.notifyComponentUpdate("updated", component);
    }
  }

  /**
   * Handle new component discovery
   */
  private handleComponentDiscovered(data: Record<string, unknown>): void {
    if (data.component) {
      const component = data.component as WasmComponent;
      this.componentsCache.set(component.name, component);

      // Notify UI of new component
      this.notifyComponentUpdate("discovered", component);
    }
  }

  /**
   * Handle component removal
   */
  private handleComponentRemoved(data: Record<string, unknown>): void {
    if (data.component_name) {
      this.componentsCache.delete(data.component_name);

      // Notify UI of removal
      this.notifyComponentUpdate("removed", { name: data.component_name });
    }
  }

  /**
   * Notify UI components of changes
   */
  private notifyComponentUpdate(type: string, component: WasmComponent): void {
    const event = new CustomEvent("wasm-component-update", {
      detail: { type, component },
    });
    window.dispatchEvent(event);
  }

  /**
   * Update component cache
   */
  private updateCache(components: WasmComponent[]): void {
    this.componentsCache.clear();
    for (const component of components) {
      this.componentsCache.set(component.name, component);
    }
    this.lastCacheUpdate = Date.now();
  }

  /**
   * Check if cache is still valid
   */
  private isCacheValid(): boolean {
    return (
      Date.now() - this.lastCacheUpdate < this.cacheTimeout &&
      this.componentsCache.size > 0
    );
  }

  /**
   * Get component statistics (for UI display)
   */
  public async getComponentStatistics(): Promise<{
    total: number;
    loaded: number;
    failed: number;
  }> {
    try {
      const result = await this.mcpService.callTool(
        "get_component_statistics",
        {},
      );

      if (result && result.content && result.content[0]) {
        return JSON.parse(result.content[0].text);
      }

      return null;
    } catch (error) {
      console.error("WasmComponentManager: Failed to get statistics:", error);
      return null;
    }
  }

  /**
   * Trigger a full component rescan
   */
  public async rescanComponents(): Promise<boolean> {
    console.log("WasmComponentManager: Triggering component rescan...");

    try {
      await this.mcpService.callTool("rescan_wasm_components", {});

      // Clear cache to force refresh
      this.componentsCache.clear();
      this.lastCacheUpdate = 0;

      // Refresh component list
      await this.refreshComponentList();

      console.log("WasmComponentManager: Rescan completed");
      return true;
    } catch (error) {
      console.error("WasmComponentManager: Rescan failed:", error);
      return false;
    }
  }

  /**
   * Check if streaming is active
   */
  public isStreamingActive(): boolean {
    return this.mcpService.getClient().isStreaming();
  }

  /**
   * Get validation service for direct access
   */
  public getValidationService(): ValidationService {
    return this.validationService;
  }

  /**
   * Legacy method for compatibility - unload component
   */
  public unloadComponent(componentId: string): void {
    // This is now handled by the backend
    console.log(`Component ${componentId} unloading is now handled by backend`);
  }

  /**
   * Check if a click position is on the load switch of a WASM component
   */
  public isLoadSwitchClick(
    position: { x: number; y: number },
    element: any,
  ): boolean {
    // Check if this is a WASM component node
    if (!element || !element.type || !element.type.includes("wasm-component")) {
      return false;
    }

    // Get the element bounds
    const bounds = element.bounds;
    if (!bounds) {
      return false;
    }

    // The load switch is typically in the top-right corner of the component
    // Assuming a 20x20 pixel area for the switch
    const switchSize = 20;
    const switchX = bounds.x + bounds.width - switchSize - 5; // 5px margin
    const switchY = bounds.y + 5; // 5px margin

    // Check if click is within switch bounds
    return (
      position.x >= switchX &&
      position.x <= switchX + switchSize &&
      position.y >= switchY &&
      position.y <= switchY + switchSize
    );
  }

  /**
   * Toggle the load state of a component
   */
  public async toggleComponentLoad(componentId: string): Promise<void> {
    console.log(
      "WasmComponentManager: Toggling load state for component:",
      componentId,
    );

    try {
      // For now, just log the action
      // In a full implementation, this would:
      // 1. Track the load state
      // 2. Update the visual representation
      // 3. Possibly load/unload the actual WASM module
      console.log(
        "Component load toggle not yet implemented for:",
        componentId,
      );
    } catch (error) {
      console.error("Failed to toggle component load state:", error);
    }
  }

  /**
   * Clear any cached data
   */
  private clearCache(): void {
    // Clear any in-memory caches
    console.log("Clearing component manager cache");
  }

  /**
   * Clean up resources
   */
  public cleanup(): void {
    console.log("Cleaning up component manager...");
    // Clear any cached data
    this.clearCache();
    console.log("Component manager cleaned up");
  }

  // ===== ADVANCED RENDERING METHODS =====

  /**
   * Initialize graphics for advanced component rendering
   */
  private initializeGraphics(): void {
    if (this.renderer) {
      try {
        // Initialize graphics bridge for advanced rendering
        const canvas = document.createElement("canvas");
        canvas.width = 300;
        canvas.height = 200;
        this.graphics = new GraphicsBridge(canvas);
        console.log(
          "WasmComponentManager: Graphics initialized for advanced rendering",
        );
      } catch (error) {
        console.warn(
          "WasmComponentManager: Failed to initialize graphics:",
          error,
        );
      }
    }
  }

  /**
   * Generate thumbnail for a component
   */
  public async generateComponentThumbnail(
    component: WasmComponent,
  ): Promise<string | null> {
    const cacheKey = `thumbnail_${component.name}`;

    // Check cache first
    if (this.thumbnailCache.has(cacheKey)) {
      return this.thumbnailCache.get(cacheKey)!;
    }

    if (!this.graphics) {
      console.warn("Graphics not initialized for thumbnail generation");
      return null;
    }

    try {
      // Create a small canvas for thumbnail
      const thumbnailCanvas = document.createElement("canvas");
      thumbnailCanvas.width = 120;
      thumbnailCanvas.height = 80;
      const ctx = thumbnailCanvas.getContext("2d")!;

      // Create mock element for rendering
      const mockElement = {
        label: component.name,
        properties: {
          componentName: component.name,
          componentType: this.inferComponentType(component),
          interfaces: component.interfaces || [],
          isLoaded: component.fileExists,
        },
      };

      const bounds = { x: 5, y: 5, width: 110, height: 70 };
      const renderContext = {
        ctx,
        scale: 0.6,
        isSelected: false,
        isHovered: false,
        isMissing: !component.fileExists,
        colors: this.componentColors,
        showInterfaceNames: false,
      };

      // Render component thumbnail
      WasmComponentRendererV2.renderWasmComponent(
        mockElement,
        bounds,
        renderContext,
      );

      // Convert to data URL
      const thumbnailDataUrl = thumbnailCanvas.toDataURL("image/png");

      // Cache the thumbnail
      this.thumbnailCache.set(cacheKey, thumbnailDataUrl);

      return thumbnailDataUrl;
    } catch (error) {
      console.error("Failed to generate component thumbnail:", error);
      return null;
    }
  }

  /**
   * Get enhanced component metadata
   */
  public async getComponentMetadata(
    componentName: string,
  ): Promise<ComponentStatus | null> {
    const cacheKey = `metadata_${componentName}`;

    // Check cache first
    const cached = this.statusCache.get(cacheKey);
    if (cached && Date.now() - cached.lastUpdated < this.cacheTimeout) {
      return cached;
    }

    try {
      const component = await this.getComponent(componentName);
      if (!component) return null;

      // Get detailed metadata from validation services
      const [securityAnalysis, witAnalysis] = await Promise.all([
        this.validationService.requestSecurityAnalysis(componentName),
        this.validationService.requestWitValidation(componentName),
      ]);

      const metadata: ComponentStatus = {
        state: component.fileExists ? "loaded" : "unloaded",
        lastUpdated: Date.now(),
        metadata: {
          size: await this.getComponentSize(component),
          interfaces: component.interfaces?.length || 0,
          dependencies: this.extractDependencies(witAnalysis),
          version: "1.0.0", // TODO: Extract from component metadata
        },
      };

      // Add security status
      if (securityAnalysis) {
        if (
          securityAnalysis.overall_risk === "Critical" ||
          securityAnalysis.overall_risk === "High"
        ) {
          metadata.state = "error";
          metadata.message = `Security risk: ${securityAnalysis.overall_risk}`;
        }
      }

      // Cache the metadata
      this.statusCache.set(cacheKey, metadata);

      return metadata;
    } catch (error) {
      console.error("Failed to get component metadata:", error);
      return null;
    }
  }

  /**
   * Get component status with visual indicators
   */
  public getComponentStatusIndicator(component: WasmComponent): {
    icon: string;
    color: string;
    message: string;
  } {
    const status = this.statusCache.get(`metadata_${component.name}`);

    if (!component.fileExists) {
      return {
        icon: "❌",
        color: this.componentColors.status.error,
        message: "Component file missing",
      };
    }

    if (status?.state === "error") {
      return {
        icon: "⚠️",
        color: this.componentColors.status.error,
        message: status.message || "Error",
      };
    }

    if (status?.state === "loading") {
      return {
        icon: "⏳",
        color: this.componentColors.status.unloaded,
        message: "Loading...",
      };
    }

    if (status?.state === "loaded") {
      return {
        icon: "✅",
        color: this.componentColors.status.loaded,
        message: "Active",
      };
    }

    return {
      icon: "⭕",
      color: this.componentColors.status.unloaded,
      message: "Inactive",
    };
  }

  /**
   * Search and filter components by metadata
   */
  public async searchComponents(query: {
    name?: string;
    type?: string;
    interfaces?: number;
    status?: "loaded" | "unloaded" | "error";
    dependencies?: string[];
  }): Promise<WasmComponent[]> {
    const allComponents = await this.getComponents();

    return allComponents.filter((component) => {
      // Name filter
      if (
        query.name &&
        !component.name.toLowerCase().includes(query.name.toLowerCase())
      ) {
        return false;
      }

      // Type filter
      if (query.type) {
        const componentType = this.inferComponentType(component);
        if (!componentType.toLowerCase().includes(query.type.toLowerCase())) {
          return false;
        }
      }

      // Interface count filter
      if (query.interfaces !== undefined) {
        const interfaceCount = component.interfaces?.length || 0;
        if (interfaceCount !== query.interfaces) {
          return false;
        }
      }

      // Status filter
      if (query.status) {
        const status = this.statusCache.get(`metadata_${component.name}`);
        if (!status || status.state !== query.status) {
          return false;
        }
      }

      return true;
    });
  }

  /**
   * Render component with advanced visualization
   */
  public renderComponentAdvanced(
    component: WasmComponent,
    canvas: HTMLCanvasElement,
    options: {
      showMetadata?: boolean;
      showInterfaces?: boolean;
      showStatus?: boolean;
      size?: { width: number; height: number };
    } = {},
  ): void {
    const ctx = canvas.getContext("2d")!;
    const { width = 200, height = 150 } = options.size || {};

    canvas.width = width;
    canvas.height = height;

    // Create element for rendering
    const element = {
      label: component.name,
      properties: {
        componentName: component.name,
        componentType: this.inferComponentType(component),
        interfaces: component.interfaces || [],
        isLoaded: component.fileExists,
      },
    };

    const bounds = { x: 10, y: 10, width: width - 20, height: height - 20 };
    const status = this.statusCache.get(`metadata_${component.name}`);

    const renderContext = {
      ctx,
      scale: 1,
      isSelected: false,
      isHovered: false,
      isMissing: !component.fileExists,
      colors: this.componentColors,
      showInterfaceNames: options.showInterfaces || false,
    };

    // Render the component
    WasmComponentRendererV2.renderWasmComponent(element, bounds, renderContext);

    // Add metadata overlay if requested
    if (options.showMetadata && status?.metadata) {
      this.renderMetadataOverlay(ctx, bounds, status.metadata);
    }
  }

  // Helper methods

  private async getComponentSize(component: WasmComponent): Promise<number> {
    // TODO: Get actual file size from backend
    return Math.floor(Math.random() * 1000000) + 50000; // Mock size for now
  }

  private extractDependencies(witAnalysis: any): string[] {
    if (!witAnalysis?.dependencies) return [];
    return witAnalysis.dependencies.map((dep: any) => dep.name || "unknown");
  }

  private inferComponentType(component: WasmComponent): string {
    const name = component.name.toLowerCase();
    if (name.includes("ai") || name.includes("ml") || name.includes("neural"))
      return "AI";
    if (
      name.includes("sensor") ||
      name.includes("camera") ||
      name.includes("lidar")
    )
      return "Sensor";
    if (name.includes("ecu") || name.includes("control")) return "ECU";
    if (name.includes("fusion") || name.includes("processor"))
      return "Processor";
    return "WASM";
  }

  private renderMetadataOverlay(
    ctx: CanvasRenderingContext2D,
    bounds: { x: number; y: number; width: number; height: number },
    metadata: ComponentStatus["metadata"],
  ): void {
    if (!metadata) return;

    // Background for metadata
    ctx.fillStyle = "rgba(0, 0, 0, 0.8)";
    ctx.fillRect(
      bounds.x + bounds.width - 80,
      bounds.y + bounds.height - 60,
      75,
      55,
    );

    // Metadata text
    ctx.fillStyle = "white";
    ctx.font = "10px monospace";
    ctx.textAlign = "left";

    const startX = bounds.x + bounds.width - 75;
    let y = bounds.y + bounds.height - 45;

    ctx.fillText(`Size: ${this.formatFileSize(metadata.size)}`, startX, y);
    y += 12;
    ctx.fillText(`Interfaces: ${metadata.interfaces}`, startX, y);
    y += 12;
    ctx.fillText(`Deps: ${metadata.dependencies.length}`, startX, y);
    y += 12;
    ctx.fillText(`v${metadata.version || "1.0.0"}`, startX, y);
  }

  private formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  }
}
