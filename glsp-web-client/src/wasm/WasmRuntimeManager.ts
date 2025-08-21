import { WasmComponentManager } from "./WasmComponentManager.js";
import { WasmTranspiler } from "./transpiler/WasmTranspiler.js";
import { ComponentRegistry } from "./runtime/ComponentRegistry.js";
import {
  ExecutionEngine,
  ExecutionContext,
  ExecutionResult,
} from "./runtime/ExecutionEngine.js";
import { ComponentUploadPanel } from "./ui/ComponentUploadPanel.js";
import { ComponentUploadService } from "../services/ComponentUploadService.js";
import { ValidationService } from "../services/ValidationService.js";
import { WasmComponentPanel } from "../ui/WasmComponentPanelRefactored.js";
import { McpService } from "../services/McpService.js";
import { DiagramService } from "../services/DiagramService.js";
import { CanvasRenderer } from "../renderer/canvas-renderer.js";
import { HeaderIconManager } from "../ui/HeaderIconManager.js";

export interface WasmRuntimeConfig {
  maxConcurrentExecutions?: number;
  maxCachedComponents?: number;
  enableClientSideTranspilation?: boolean;
}

export class WasmRuntimeManager extends WasmComponentManager {
  private transpiler: WasmTranspiler;
  private registry: ComponentRegistry;
  private executionEngine: ExecutionEngine;
  private uploadPanel: ComponentUploadPanel;
  private uploadService: ComponentUploadService;
  private enhancedPalette: WasmComponentPanel;
  private config: WasmRuntimeConfig;
  private headerIconManager?: HeaderIconManager;

  constructor(
    mcpService: McpService,
    diagramService: DiagramService,
    config: WasmRuntimeConfig = {},
    renderer?: CanvasRenderer,
  ) {
    super(mcpService, diagramService, renderer);

    this.config = {
      maxConcurrentExecutions: 5,
      maxCachedComponents: 50,
      enableClientSideTranspilation: true,
      ...config,
    };

    // Initialize new runtime services with validation configuration
    this.transpiler = new WasmTranspiler({
      maxImports: 50,
      maxExports: 50,
      allowedImports: [
        "wasi_snapshot_preview1",
        "wasi_snapshot_preview2",
        "env",
      ],
    });
    this.registry = new ComponentRegistry();
    this.executionEngine = new ExecutionEngine(this.registry);

    // Configure execution engine
    this.executionEngine.setMaxConcurrentExecutions(
      this.config.maxConcurrentExecutions!,
    );

    // Create upload service
    this.uploadService = new ComponentUploadService(this.mcpService);

    // Create upload panel
    this.uploadPanel = new ComponentUploadPanel(
      this.uploadService,
      new ValidationService(this.mcpService),
      (componentId: string) => this.onComponentUploadComplete(componentId),
      (error: string) => this.onComponentUploadError(error),
    );

    // Create enhanced floating palette
    this.enhancedPalette = new WasmComponentPanel(
      this.mcpService as unknown as import("../mcp/client.js").McpClient, // Cast to McpClient interface
      () => this.showUploadPanel(),
      {
        title: "WASM Components",
        initialPosition: { x: 20, y: 100 },
      },
      {
        onMinimizeToHeader: () => this.minimizeWasmPaletteToHeader(),
      },
    );

    // Set up component lifecycle callbacks
    this.enhancedPalette.setComponentLifecycleCallbacks({
      onLoad: async (elementId: string) =>
        await this.handleLoadComponentFromPalette(elementId),
      onUnload: async (elementId: string) =>
        await this.handleUnloadComponentFromPalette(elementId),
      onTranspile: async (elementId: string) =>
        await this.handleTranspileComponentFromPalette(elementId),
      onRelease: async (elementId: string) =>
        await this.handleReleaseComponentFromPalette(elementId),
    });

    document.body.appendChild(this.uploadPanel.getElement());
  }

  public setHeaderIconManager(headerIconManager: HeaderIconManager): void {
    this.headerIconManager = headerIconManager;
  }

  private minimizeWasmPaletteToHeader(): void {
    if (!this.headerIconManager) {
      console.warn("Header icon manager not set for WASM palette");
      return;
    }

    this.headerIconManager.addIcon({
      id: "wasm-components",
      title: "WASM Components",
      icon: "📦",
      color: "var(--accent-wasm)",
      onClick: () => this.restoreWasmPalette(),
      onClose: () => this.closeWasmPalette(),
    });
    console.log("WASM Components palette minimized to header");
  }

  private restoreWasmPalette(): void {
    this.enhancedPalette.show();
    if (this.headerIconManager) {
      this.headerIconManager.removeIcon("wasm-components");
    }
    console.log("WASM Components palette restored from header");
  }

  private closeWasmPalette(): void {
    this.enhancedPalette.close();
    if (this.headerIconManager) {
      this.headerIconManager.removeIcon("wasm-components");
    }
    console.log("WASM Components palette closed");
  }

  // Enhanced component loading with client-side transpilation support
  async uploadAndTranspileComponent(
    file: File,
    componentName?: string,
  ): Promise<string> {
    if (!this.config.enableClientSideTranspilation) {
      throw new Error("Client-side transpilation is disabled");
    }

    console.log("Uploading and transpiling component...", {
      fileName: file.name,
      size: file.size,
    });

    try {
      // Read file as ArrayBuffer
      const arrayBuffer = await this.readFileAsArrayBuffer(file);

      // Transpile component
      const transpiledComponent = await this.transpiler.transpileComponent(
        arrayBuffer,
        componentName || file.name.replace(".wasm", ""),
      );

      // Register component
      const componentId = this.registry.registerComponent(transpiledComponent);

      console.log(
        `Component uploaded and registered: ${transpiledComponent.metadata.name} (${componentId})`,
      );
      return componentId;
    } catch (error) {
      console.error("Failed to upload and transpile component:", error);
      throw error;
    }
  }

  async loadTranspiledComponent(
    componentId: string,
  ): Promise<WebAssembly.Instance> {
    console.log(`Loading transpiled component: ${componentId}`);

    try {
      const instance = await this.registry.loadComponent(componentId);
      console.log(`Transpiled component loaded successfully: ${componentId}`);
      return instance;
    } catch (error) {
      console.error(
        `Failed to load transpiled component ${componentId}:`,
        error,
      );
      throw error;
    }
  }

  async executeComponent(
    componentId: string,
    method: string,
    args: unknown[] = [],
    timeout?: number,
  ): Promise<ExecutionResult> {
    console.log(`Executing component method: ${componentId}.${method}`, {
      args,
      timeout,
    });

    const context: ExecutionContext = {
      componentId,
      method,
      args,
      timeout,
      onProgress: (progress) => {
        console.log(
          `Execution progress: ${progress.stage} - ${progress.message} (${progress.progress}%)`,
        );
      },
    };

    try {
      const result = await this.executionEngine.executeComponent(context);
      console.log(`Component execution completed:`, {
        success: result.success,
        executionTime: result.executionTime,
      });
      return result;
    } catch (error) {
      console.error(`Component execution failed:`, error);
      throw error;
    }
  }

  async getComponentMethods(componentId: string) {
    return await this.executionEngine.getComponentMethods(componentId);
  }

  async testComponent(componentId: string) {
    return await this.executionEngine.testComponent(componentId);
  }

  // UI Management
  showUploadPanel(): void {
    this.uploadPanel.show();
  }

  hideUploadPanel(): void {
    this.uploadPanel.hide();
  }

  // Component management
  getRegisteredComponents() {
    return this.registry.listComponents();
  }

  getLoadedComponents(): Map<string, WebAssembly.Instance> {
    const loadedComponentsMetadata = this.registry.getLoadedComponents();
    const result = new Map();
    loadedComponentsMetadata.forEach((metadata) => {
      result.set(metadata.hash, { metadata, isLoaded: true });
    });
    return result;
  }

  getComponentStatus(componentId: string) {
    return this.registry.getComponentStatus(componentId);
  }

  // Override parent method signature for compatibility
  async unloadComponent(
    elementId: string,
    componentName?: string,
  ): Promise<void> {
    console.log(`Unloading component: ${elementId}`, { componentName });

    // If this is called for a client-side component, use elementId as componentId
    if (componentName === undefined) {
      // New client-side component
      this.registry.unloadComponent(elementId);
    } else {
      // Legacy MCP component - call parent method
      await super.unloadComponent(elementId);
    }
  }

  async unloadClientSideComponent(componentId: string): Promise<boolean> {
    console.log(`Unloading client-side component: ${componentId}`);
    return this.registry.unloadComponent(componentId);
  }

  async removeComponent(componentId: string): Promise<boolean> {
    console.log(`Removing component: ${componentId}`);
    return this.registry.removeComponent(componentId);
  }

  // Enhanced initialization that supports both MCP and client-side components
  async initializeEnhancedWasmComponents(): Promise<void> {
    console.log("Initializing enhanced WASM components...");

    try {
      // Initialize legacy MCP-based components
      await super.initializeWasmComponents();
      console.log("Legacy MCP components initialized");

      // Load any pre-configured client-side components
      await this.loadPreconfiguredComponents();
      console.log("Pre-configured components loaded");

      console.log("Enhanced WASM components initialized successfully");
    } catch (error) {
      console.error("Failed to initialize enhanced WASM components:", error);
      throw error;
    }
  }

  private async loadPreconfiguredComponents(): Promise<void> {
    // In a real implementation, this might load components from local storage
    // or a configuration file
    console.log("Loading pre-configured components...");

    // For now, just log that we're ready to accept uploaded components
    const cachedComponents = this.transpiler.getCachedComponents();
    console.log(
      `Found ${cachedComponents.length} cached components from previous sessions`,
    );

    for (const component of cachedComponents) {
      this.registry.registerComponent(component);
      console.log(`Restored cached component: ${component.metadata.name}`);
    }
  }

  // Enhanced palette integration
  async showEnhancedPalette(): Promise<void> {
    // Show the new floating panel instead of old palette
    this.enhancedPalette.show();

    // Wait for next tick to ensure DOM is ready
    await new Promise((resolve) => setTimeout(resolve, 0));

    // Update client-side components
    this.refreshClientSideComponents();

    // Update with current diagram components
    this.updatePaletteWithDiagramComponents();
  }

  // Get the enhanced palette for external updates
  public getEnhancedPalette(): WasmComponentPanel {
    return this.enhancedPalette;
  }

  // Override to use enhanced palette
  public getPaletteElement(): HTMLElement {
    return this.enhancedPalette.getElement();
  }

  // Override to use enhanced palette
  public async showPalette(): Promise<void> {
    await this.showEnhancedPalette();
  }

  // Override to use enhanced palette
  public hidePalette(): void {
    this.enhancedPalette.hide();
  }

  private refreshClientSideComponents(): void {
    const components = this.registry.getLoadedComponents();
    const componentArray = components.map((metadata) => ({
      id: metadata.hash,
      name: metadata.name,
      path: "",
      description: metadata.description || "",
      status: "loaded" as const,
      fileExists: true,
      dependencies: [],
      metadata: {
        hash: metadata.hash,
        size: metadata.size,
        interfaces: metadata.interfaces || [],
        exports: metadata.exports || [],
        imports: metadata.imports || [],
      },
      interfaces: [],
    }));

    this.enhancedPalette.updateClientSideComponents(componentArray);

    // Update transpiled components in palette
    const transpiledComponents = componentArray.map((comp) => ({
      name: comp.name,
      interfaces: comp.metadata.exports || [],
      source: "Client Upload",
    }));
    this.enhancedPalette.updateTranspiledComponents(transpiledComponents);

    // Generate test harnesses for transpiled components
    const testHarnesses = this.generateTestHarnesses(components);
    this.enhancedPalette.updateTestHarnesses(testHarnesses);
  }

  private updatePaletteWithDiagramComponents(): void {
    const currentDiagram = this.diagramService.getCurrentDiagram();
    if (!currentDiagram) return;

    const wasmComponents: Array<{
      elementId: string;
      name: string;
      status: "available" | "missing" | "loaded" | "transpiled";
      isLoaded: boolean;
      isTranspiled: boolean;
    }> = [];

    // Find all WASM components in the diagram
    Object.entries(currentDiagram.elements).forEach(([elementId, element]) => {
      if (
        element.type === "wasm-component" ||
        element.type === "WASM Component"
      ) {
        const componentName =
          element.properties?.componentName ||
          element.properties?.name ||
          "Unknown";
        const isLoaded = this.isComponentLoaded(elementId);
        const isTranspiled =
          this.registry.getComponent(componentName as string) !== null;

        wasmComponents.push({
          elementId,
          name: componentName as string,
          status: isTranspiled
            ? "transpiled"
            : isLoaded
              ? "loaded"
              : "available",
          isLoaded,
          isTranspiled,
        });
      }
    });

    this.enhancedPalette.updateDiagramComponents(wasmComponents);
  }

  private generateTestHarnesses(
    components: import("./transpiler/WasmTranspiler.js").ComponentMetadata[],
  ): Array<{
    interfaceName: string;
    componentName: string;
    methods: string[];
  }> {
    const harnesses: Array<{
      interfaceName: string;
      componentName: string;
      methods: string[];
    }> = [];

    components.forEach((comp) => {
      if (comp.exports) {
        comp.exports.forEach((exportInterface: string) => {
          // Extract actual methods from component metadata
          const actualMethods = this.extractMethodsFromInterface(
            comp,
            exportInterface,
          );
          harnesses.push({
            interfaceName: exportInterface,
            componentName: comp.metadata.name,
            methods: actualMethods,
          });
        });
      }
    });

    return harnesses;
  }

  private extractMethodsFromInterface(
    comp: import("./transpiler/WasmTranspiler.js").ComponentMetadata,
    interfaceName: string,
  ): string[] {
    // Try to extract actual method names from the interface
    // For now, return common WASM export patterns
    const commonMethods = ["main", "execute", "process", "run", "test"];

    // If the component has detailed interface information, use it
    if (comp.interfaces) {
      const matchingInterface = comp.interfaces.find(
        (iface) => iface === interfaceName,
      );
      if (matchingInterface) {
        return [`${interfaceName}_main`, `${interfaceName}_execute`];
      }
    }

    // Fallback to common patterns
    return commonMethods;
  }

  // Component lifecycle handlers from palette
  private async handleLoadComponentFromPalette(
    elementId: string,
  ): Promise<void> {
    // Get component info from the diagram
    const currentDiagram = this.diagramService.getCurrentDiagram();
    if (!currentDiagram) throw new Error("No active diagram");

    const element = currentDiagram.elements[elementId];
    if (!element) throw new Error("Element not found in diagram");

    const componentName =
      element.properties?.componentName || element.properties?.name;
    if (!componentName) throw new Error("Component name not found");

    // Use the existing load method from WasmComponentManager
    await this.loadComponent(componentName as string);

    // The canvas will be updated by refreshDiagramAfterStateChange in loadComponent
    // Just update the palette display
    this.updatePaletteWithDiagramComponents();
  }

  private async handleUnloadComponentFromPalette(
    elementId: string,
  ): Promise<void> {
    const currentDiagram = this.diagramService.getCurrentDiagram();
    if (!currentDiagram) throw new Error("No active diagram");

    const element = currentDiagram.elements[elementId];
    if (!element) throw new Error("Element not found in diagram");

    const componentName =
      element.properties?.componentName || element.properties?.name;
    if (!componentName) throw new Error("Component name not found");

    await this.unloadComponent(elementId, componentName as string);
    this.updatePaletteWithDiagramComponents();
  }

  private async handleTranspileComponentFromPalette(
    elementId: string,
  ): Promise<void> {
    const currentDiagram = this.diagramService.getCurrentDiagram();
    if (!currentDiagram) throw new Error("No active diagram");

    const element = currentDiagram.elements[elementId];
    if (!element) throw new Error("Element not found in diagram");

    const componentName =
      element.properties?.componentName || element.properties?.name;
    if (!componentName) throw new Error("Component name not found");

    // Get the loaded component
    const loadedComponent = this.getLoadedComponent(elementId);
    if (!loadedComponent) throw new Error("Component not loaded");

    // Transpile using the transpiler
    const transpiledResult = await this.transpiler.transpileComponent(
      loadedComponent.module, // ArrayBuffer
      componentName as string,
    );

    // Register the transpiled component
    this.registry.registerComponent(transpiledResult);

    // Update displays
    this.refreshClientSideComponents();
    this.updatePaletteWithDiagramComponents();
  }

  private async handleReleaseComponentFromPalette(
    elementId: string,
  ): Promise<void> {
    const currentDiagram = this.diagramService.getCurrentDiagram();
    if (!currentDiagram) throw new Error("No active diagram");

    const element = currentDiagram.elements[elementId];
    if (!element) throw new Error("Element not found in diagram");

    const componentName =
      element.properties?.componentName || element.properties?.name;
    if (!componentName) throw new Error("Component name not found");

    // Unload the component first
    await this.unloadComponent(elementId, componentName as string);

    // Remove from registry
    this.registry.removeComponent(componentName as string);

    // Update displays
    this.refreshClientSideComponents();
    this.updatePaletteWithDiagramComponents();
  }

  // Event handlers
  private async onComponentUploadComplete(componentId: string): Promise<void> {
    console.log(`Component upload completed: ${componentId}`);

    // Refresh MCP component list since it's now uploaded to backend
    await this.refreshMcpComponents();

    // Refresh any UI that shows component lists
    this.refreshComponentDisplays();

    // Refresh the enhanced palette
    await this.enhancedPalette.loadComponents();

    // Show success message
    this.showNotification(
      `Component "${componentId}" uploaded successfully!`,
      "success",
    );
  }

  private async refreshMcpComponents(): Promise<void> {
    try {
      // Trigger a component scan on the backend
      await this.mcpService.getClient().callTool("scan_wasm_components", {});
      console.log("Backend component scan triggered after upload");
    } catch (error) {
      console.error("Failed to refresh MCP components:", error);
    }
  }

  private onComponentUploadError(error: string): void {
    console.error(`Component upload failed: ${error}`);
    this.showNotification(`Upload failed: ${error}`, "error");
  }

  async validateComponent(
    file: File,
  ): Promise<{ valid: boolean; report?: string }> {
    try {
      const arrayBuffer = await this.readFileAsArrayBuffer(file);
      const report = await this.transpiler.generateSecurityReport(arrayBuffer);

      // Try to validate the component
      const validation = await this.transpiler.validateComponent(arrayBuffer);

      return {
        valid: validation.isValid,
        report,
      };
    } catch (error) {
      return {
        valid: false,
        report: `Validation failed: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      };
    }
  }

  private refreshComponentDisplays(): void {
    // Refresh the enhanced palette with updated component lists
    console.log("Refreshing component displays...");
    this.refreshClientSideComponents();
  }

  private showNotification(
    message: string,
    type: "success" | "error" | "info",
  ): void {
    // Simple notification system
    const notification = document.createElement("div");
    notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 12px 20px;
            border-radius: 6px;
            color: white;
            font-weight: 500;
            z-index: 2000;
            animation: slideIn 0.3s ease;
            ${
              type === "success"
                ? "background: #10B981;"
                : type === "error"
                  ? "background: #EF4444;"
                  : "background: #3B82F6;"
            }
        `;
    notification.textContent = message;

    document.body.appendChild(notification);

    // Auto-remove after 3 seconds
    setTimeout(() => {
      notification.style.animation = "slideOut 0.3s ease";
      setTimeout(() => notification.remove(), 300);
    }, 3000);
  }

  // Utility methods
  private readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = () => reject(new Error("Failed to read file"));
      reader.readAsArrayBuffer(file);
    });
  }

  // Runtime statistics
  getRuntimeStats() {
    return {
      transpiler: {
        cachedComponents: this.transpiler.getCacheSize(),
        totalComponents: this.transpiler.getCachedComponents().length,
      },
      registry: this.registry.getMemoryUsage(),
      execution: this.executionEngine.getExecutionStats(),
      config: this.config,
    };
  }

  // Cleanup
  async cleanup(): Promise<void> {
    console.log("Cleaning up WASM runtime manager...");

    this.executionEngine.cleanup();
    this.registry.cleanup();
    this.transpiler.clearCache();

    if (this.uploadPanel) {
      this.uploadPanel.hide();
    }

    console.log("WASM runtime manager cleaned up");
  }

  async refreshComponentInterfaces(componentName: string): Promise<void> {
    // Use MCP tool to refresh component status
    try {
      await this.mcpService
        .getClient()
        .callTool("check_wasm_component_status", {
          componentName,
        });
    } catch (error) {
      console.error("Failed to refresh component interfaces:", error);
    }
  }

  isComponentLoaded(componentName: string): boolean {
    // Check if component exists in the registry
    return this.registry.hasComponent(componentName);
  }

  getLoadedComponent(
    componentName: string,
  ): import("./WasmComponentManager.js").WasmComponent | undefined {
    return this.registry.getComponent(componentName);
  }
}
