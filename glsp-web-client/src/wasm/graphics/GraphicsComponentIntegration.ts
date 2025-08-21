/**
 * Graphics Component Integration Manager
 * Handles integration of graphics components with the main diagram rendering system
 */

import { CanvasRenderer } from "../../renderer/canvas-renderer.js";
import { Node } from "../../model/diagram.js";
import {
  GraphicsBridge,
  GraphicsAPI,
  RenderCommand,
} from "./GraphicsBridge.js";
import {
  GraphicsComponentFactory,
  GraphicsComponent as WasmGraphicsComponent,
} from "./WasmGraphicsComponent.js"; // Ready for graphics integration
import { WasmComponent } from "../../types/wasm-component.js";
import {
  graphicsAnimationIntegration,
  type AnimatedGraphicsNode,
} from "../../animation/GraphicsAnimationIntegration.js";

export interface GraphicsIntegrationOptions {
  enableInteractivity: boolean;
  enableAnimation: boolean;
  maxRenderFPS: number;
  enableThumbnails: boolean;
  thumbnailSize: { width: number; height: number };
}

export interface GraphicsComponentInfo {
  name: string;
  component: WasmGraphicsComponent;
  config?: any;
}

export interface GraphicsComponentNode extends Node {
  graphicsComponent?: WasmGraphicsComponent; // Ready for graphics component integration
  graphicsCanvas?: HTMLCanvasElement;
  graphicsContext?: CanvasRenderingContext2D;
  isGraphicsComponent: boolean;
  renderCommands?: RenderCommand[];
  lastRenderTime?: number;
  animationFrameId?: number;
}

export class GraphicsComponentIntegration {
  private canvasRenderer: CanvasRenderer;
  private graphicsBridge: GraphicsBridge;
  private componentFactory: GraphicsComponentFactory; // Ready for graphics component factory
  private graphicsComponents: Map<string, WasmGraphicsComponent> = new Map(); // Ready for graphics components
  private graphicsCanvases: Map<string, HTMLCanvasElement> = new Map();
  private animationCallbacks: Map<string, number> = new Map();
  private options: GraphicsIntegrationOptions;
  private isInitialized: boolean = false;

  constructor(
    canvasRenderer: CanvasRenderer,
    graphicsBridge: GraphicsBridge,
    options: Partial<GraphicsIntegrationOptions> = {},
  ) {
    this.canvasRenderer = canvasRenderer;
    this.graphicsBridge = graphicsBridge;
    this.componentFactory = new GraphicsComponentFactory();
    this.options = {
      enableInteractivity: true,
      enableAnimation: true,
      maxRenderFPS: 60,
      enableThumbnails: true,
      thumbnailSize: { width: 200, height: 150 },
      ...options,
    };

    // Initialize animation system integration if enabled
    if (this.options.enableAnimation) {
      this.initializeAnimationSystem();
    }
  }

  /**
   * Initialize animation system for graphics components
   */
  private initializeAnimationSystem(): void {
    console.log(
      "🎬 GraphicsComponentIntegration: Initializing animation system",
    );
    // Animation system is ready for graphics component registration
    // Individual graphics nodes will be registered when created
  }

  /**
   * Initialize graphics component integration
   */
  public async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      // Register default graphics components
      await this.registerDefaultComponents();

      // Set up rendering hooks
      this.setupRenderingHooks();

      // Initialize graphics bridge
      await this.graphicsBridge.initialize();

      this.isInitialized = true;
      console.log("GraphicsComponentIntegration: Initialized successfully");
    } catch (error) {
      console.error(
        "GraphicsComponentIntegration: Initialization failed:",
        error,
      );
      throw error;
    }
  }

  /**
   * Register a graphics component with the integration system
   */
  public registerGraphicsComponent(componentInfo: GraphicsComponentInfo): void {
    this.componentFactory.registerComponent({
      name: componentInfo.name,
      component: componentInfo.component,
    });
    console.log(
      `GraphicsComponentIntegration: Registered component '${componentInfo.name}'`,
    );
  }

  /**
   * Check if a WASM component is graphics-enabled
   */
  public isGraphicsComponent(component: WasmComponent): boolean {
    // Check if component has graphics interface or metadata
    const hasGraphicsInterface = component.exports?.some(
      (exp: any) =>
        exp?.name?.includes("graphics") ||
        exp?.name?.includes("render") ||
        exp?.name?.includes("draw"),
    );

    const hasGraphicsMetadata =
      component.metadata?.graphics === true ||
      component.metadata?.type === "graphics" ||
      component.metadata?.category === "visualization";

    return hasGraphicsInterface || hasGraphicsMetadata || false;
  }

  /**
   * Create graphics component node from WASM component
   */
  public async createGraphicsComponentNode(
    component: WasmComponent,
    position: { x: number; y: number },
  ): Promise<GraphicsComponentNode> {
    if (!this.isGraphicsComponent(component)) {
      throw new Error(
        `Component '${component.name}' is not a graphics component`,
      );
    }

    // Create graphics component instance
    const graphicsComponent = this.componentFactory.createComponent(
      component.name,
      {
        width: this.options.thumbnailSize.width,
        height: this.options.thumbnailSize.height,
      },
    );

    if (!graphicsComponent) {
      throw new Error(
        `Failed to create graphics component '${component.name}'`,
      );
    }

    // Create canvas for the component
    const canvas = document.createElement("canvas");
    canvas.width = this.options.thumbnailSize.width;
    canvas.height = this.options.thumbnailSize.height;
    canvas.style.cssText = `
            width: ${this.options.thumbnailSize.width}px;
            height: ${this.options.thumbnailSize.height}px;
            border: 1px solid var(--border-color, #2A3441);
            border-radius: 4px;
            background: var(--bg-primary, #0D1117);
        `;

    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("Failed to get 2D context for graphics component canvas");
    }

    // Create node
    const node: GraphicsComponentNode = {
      id: `graphics-${component.name}-${Date.now()}`,
      type: "graphics-component",
      label: component.name,
      position,
      size: {
        width: this.options.thumbnailSize.width + 40, // Extra space for labels
        height: this.options.thumbnailSize.height + 60,
      },
      metadata: {
        component: component,
        componentType: "graphics",
        witType: "component",
        graphicsEnabled: true,
      },
      graphicsComponent,
      graphicsCanvas: canvas,
      graphicsContext: context,
      isGraphicsComponent: true,
      renderCommands: [],
      lastRenderTime: 0,
    };

    // Store references
    this.graphicsComponents.set(node.id, graphicsComponent);
    this.graphicsCanvases.set(node.id, canvas);

    // Initialize component
    await this.initializeGraphicsComponent(node);

    // Register with animation system if enabled
    if (this.options.enableAnimation) {
      this.registerNodeForAnimation(node);
    }

    console.log(
      `GraphicsComponentIntegration: Created graphics component node '${node.id}'`,
    );
    return node;
  }

  /**
   * Initialize a graphics component
   */
  private async initializeGraphicsComponent(
    node: GraphicsComponentNode,
  ): Promise<void> {
    if (!node.graphicsComponent || !node.graphicsContext) return;

    try {
      // Create graphics API for the component
      const graphicsAPI = this.createGraphicsAPI(node);

      // Initialize the component
      await node.graphicsComponent.initialize(graphicsAPI, {
        width: this.options.thumbnailSize.width,
        height: this.options.thumbnailSize.height,
      });

      // Start animation if enabled
      if (
        this.options.enableAnimation &&
        node.graphicsComponent.supportsAnimation
      ) {
        this.startAnimation(node);
      }

      // Initial render
      await this.renderGraphicsComponent(node);

      console.log(
        `GraphicsComponentIntegration: Initialized graphics component '${node.id}'`,
      );
    } catch (error) {
      console.error(
        `GraphicsComponentIntegration: Failed to initialize component '${node.id}':`,
        error,
      );
      throw error;
    }
  }

  /**
   * Create graphics API for a component
   */
  private createGraphicsAPI(node: GraphicsComponentNode): GraphicsAPI {
    if (!node.graphicsContext) {
      throw new Error("Graphics context not available");
    }

    const context = node.graphicsContext;
    const canvas = node.graphicsCanvas!;

    return {
      // Basic drawing operations
      drawRect: (
        x: number,
        y: number,
        width: number,
        height: number,
        style?: any,
      ) => {
        if (style?.fillColor) {
          context.fillStyle = style.fillColor;
          context.fillRect(x, y, width, height);
        }
        if (style?.strokeColor) {
          context.strokeStyle = style.strokeColor;
          context.lineWidth = style.lineWidth || 1;
          context.strokeRect(x, y, width, height);
        }
      },

      drawCircle: (x: number, y: number, radius: number, style?: any) => {
        context.beginPath();
        context.arc(x, y, radius, 0, 2 * Math.PI);

        if (style?.fillColor) {
          context.fillStyle = style.fillColor;
          context.fill();
        }
        if (style?.strokeColor) {
          context.strokeStyle = style.strokeColor;
          context.lineWidth = style.lineWidth || 1;
          context.stroke();
        }
      },

      drawLine: (
        x1: number,
        y1: number,
        x2: number,
        y2: number,
        style?: any,
      ) => {
        context.beginPath();
        context.moveTo(x1, y1);
        context.lineTo(x2, y2);

        context.strokeStyle = style?.strokeColor || "#ffffff";
        context.lineWidth = style?.lineWidth || 1;
        context.stroke();
      },

      drawText: (text: string, x: number, y: number, style?: any) => {
        context.font = style?.font || "12px Arial";
        context.fillStyle = style?.fillColor || "#ffffff";
        context.fillText(text, x, y);
      },

      clear: () => {
        context.clearRect(0, 0, canvas.width, canvas.height);
      },

      // Canvas properties
      getWidth: () => canvas.width,
      getHeight: () => canvas.height,
      getCanvasSize: () => ({ width: canvas.width, height: canvas.height }),

      // Backend operations (delegated to GraphicsBridge)
      renderChart: async (data: any, options?: any) => {
        return await this.graphicsBridge.renderChart(data, options);
      },

      streamVisualization: async (dataStream: any, options?: any) => {
        return await this.graphicsBridge.streamVisualization(
          dataStream,
          options,
        );
      },

      renderOnBackend: async (componentId: string, commands: any[]) => {
        return await this.graphicsBridge.renderOnBackend(componentId, commands);
      },

      streamFromBackend: async (
        componentId: string,
        params: Record<string, unknown>,
      ) => {
        return await this.graphicsBridge.streamFromBackend(componentId, params);
      },
    };
  }

  /**
   * Start animation for a graphics component
   */
  private startAnimation(node: GraphicsComponentNode): void {
    if (
      !node.graphicsComponent?.supportsAnimation ||
      this.animationCallbacks.has(node.id)
    ) {
      return;
    }

    const animate = async (timestamp: number) => {
      if (!this.animationCallbacks.has(node.id)) return; // Animation stopped

      const deltaTime = timestamp - (node.lastRenderTime || 0);
      const targetFrameTime = 1000 / this.options.maxRenderFPS;

      if (deltaTime >= targetFrameTime) {
        try {
          if (node.graphicsComponent?.onFrame) {
            await node.graphicsComponent.onFrame(timestamp, deltaTime);
          }

          await this.renderGraphicsComponent(node);
          node.lastRenderTime = timestamp;
        } catch (error) {
          console.error(`Animation error for component '${node.id}':`, error);
        }
      }

      const animationId = requestAnimationFrame(animate);
      this.animationCallbacks.set(node.id, animationId);
    };

    const initialAnimationId = requestAnimationFrame(animate);
    this.animationCallbacks.set(node.id, initialAnimationId);

    console.log(
      `GraphicsComponentIntegration: Started animation for '${node.id}'`,
    );
  }

  /**
   * Stop animation for a graphics component
   */
  private stopAnimation(nodeId: string): void {
    const animationId = this.animationCallbacks.get(nodeId);
    if (animationId) {
      cancelAnimationFrame(animationId);
      this.animationCallbacks.delete(nodeId);
      console.log(
        `GraphicsComponentIntegration: Stopped animation for '${nodeId}'`,
      );
    }
  }

  /**
   * Render a graphics component
   */
  private async renderGraphicsComponent(
    node: GraphicsComponentNode,
  ): Promise<void> {
    if (!node.graphicsComponent || !node.graphicsContext) return;

    try {
      // Let the component render itself
      if (node.graphicsComponent.render) {
        const graphicsAPI = this.createGraphicsAPI(node);
        node.graphicsComponent.render(graphicsAPI, {
          time: Date.now(),
          deltaTime: 16,
          frameCount: 0,
        });
      }

      // Trigger main canvas re-render to show updated graphics
      this.canvasRenderer.render();
    } catch (error) {
      console.error(`Render error for graphics component '${node.id}':`, error);
    }
  }

  /**
   * Handle mouse events for graphics components
   */
  public handleMouseEvent(
    node: GraphicsComponentNode,
    event: MouseEvent,
    type: "click" | "move" | "down" | "up",
  ): boolean {
    if (!this.options.enableInteractivity || !node.graphicsComponent) {
      return false;
    }

    // Calculate relative coordinates within the graphics canvas
    const canvas = node.graphicsCanvas;
    if (!canvas) return false;

    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    try {
      // Delegate to component's event handler
      switch (type) {
        case "click":
          return node.graphicsComponent.onClick?.(x, y) || false;
        case "move":
          return node.graphicsComponent.onMouseMove?.(x, y) || false;
        case "down":
          return node.graphicsComponent.onMouseDown?.(x, y, 0) || false;
        case "up":
          return node.graphicsComponent.onMouseUp?.(x, y, 0) || false;
      }
    } catch (error) {
      console.error(
        `Mouse event error for graphics component '${node.id}':`,
        error,
      );
    }

    return false;
  }

  /**
   * Remove a graphics component
   */
  public removeGraphicsComponent(nodeId: string): void {
    // Stop animation
    this.stopAnimation(nodeId);

    // Clean up component
    const component = this.graphicsComponents.get(nodeId);
    if (component?.destroy) {
      component.destroy();
    }

    // Clean up canvas
    const canvas = this.graphicsCanvases.get(nodeId);
    if (canvas) {
      canvas.remove();
    }

    // Remove from maps
    this.graphicsComponents.delete(nodeId);
    this.graphicsCanvases.delete(nodeId);

    console.log(
      `GraphicsComponentIntegration: Removed graphics component '${nodeId}'`,
    );
  }

  /**
   * Get graphics component by node ID
   */
  public getGraphicsComponent(
    nodeId: string,
  ): WasmGraphicsComponent | undefined {
    return this.graphicsComponents.get(nodeId);
  }

  /**
   * Get graphics canvas by node ID
   */
  public getGraphicsCanvas(nodeId: string): HTMLCanvasElement | undefined {
    return this.graphicsCanvases.get(nodeId);
  }

  /**
   * Get available graphics components
   */
  public getAvailableGraphicsComponents(): GraphicsComponentInfo[] {
    return this.componentFactory.getAvailableComponents();
  }

  /**
   * Update graphics component properties
   */
  public async updateComponentProperties(
    nodeId: string,
    properties: Record<string, any>,
  ): Promise<void> {
    const component = this.graphicsComponents.get(nodeId);
    if (!component) return;

    try {
      if (component.updateProperties) {
        await component.updateProperties(properties);
      }

      // Re-render after property update
      const node = {
        id: nodeId,
        graphicsComponent: component,
      } as GraphicsComponentNode;
      await this.renderGraphicsComponent(node);

      console.log(
        `GraphicsComponentIntegration: Updated properties for '${nodeId}'`,
      );
    } catch (error) {
      console.error(
        `Property update error for graphics component '${nodeId}':`,
        error,
      );
    }
  }

  /**
   * Register default graphics components
   */
  private async registerDefaultComponents(): Promise<void> {
    // Register built-in graphics components
    const defaultComponents = this.componentFactory.getAvailableComponents();

    console.log(
      `GraphicsComponentIntegration: Registered ${defaultComponents.length} default components`,
    );
  }

  /**
   * Set up rendering hooks with the main canvas renderer
   */
  private setupRenderingHooks(): void {
    // This would be implemented to hook into the main canvas renderer
    // to render graphics components as part of the diagram
    console.log("GraphicsComponentIntegration: Set up rendering hooks");
  }

  /**
   * Register a graphics node with the animation system
   */
  private registerNodeForAnimation(node: GraphicsComponentNode): void {
    try {
      // Convert GraphicsComponentNode to AnimatedGraphicsNode format
      const animatedNode: AnimatedGraphicsNode = {
        id: node.id,
        type: this.inferGraphicsNodeType(node),
        bounds: {
          x: node.position?.x || 0,
          y: node.position?.y || 0,
          width: node.size?.width || 200,
          height: node.size?.height || 150,
        },
        properties: this.extractGraphicsProperties(node),
      };

      // Register with animation system
      graphicsAnimationIntegration.registerAnimatedNode(animatedNode);

      console.log(`🎬 Registered graphics node '${node.id}' for animation`);
    } catch (error) {
      console.warn(
        `Failed to register node '${node.id}' for animation:`,
        error,
      );
    }
  }

  /**
   * Infer graphics node type from component
   */
  private inferGraphicsNodeType(node: GraphicsComponentNode): string {
    const componentName = node.label?.toLowerCase() || "";

    // Map component names to our graphics node types
    if (componentName.includes("sine") || componentName.includes("wave")) {
      return "sine-wave-visualizer";
    }
    if (componentName.includes("particle")) {
      return "particle-system";
    }
    if (componentName.includes("radar")) {
      return "radar-visualization";
    }
    if (componentName.includes("chart") || componentName.includes("graph")) {
      return "chart-display";
    }
    if (componentName.includes("led") || componentName.includes("status")) {
      return "status-led";
    }

    // Default fallback
    return "sine-wave-visualizer";
  }

  /**
   * Extract properties for animation system
   */
  private extractGraphicsProperties(
    node: GraphicsComponentNode,
  ): Record<string, any> {
    const defaultProps = {
      amplitude: 50,
      frequency: 0.02,
      speed: 0.05,
      color: "#4A9EFF",
      backgroundColor: "#0A0E1A",
    };

    // Merge with any existing properties from the node
    const metadataProps = (node.metadata as any)?.properties || {};
    return {
      ...defaultProps,
      ...metadataProps,
      // Add component-specific properties
      componentName: node.label,
      isActive: true,
    };
  }

  /**
   * Destroy the integration manager
   */
  public destroy(): void {
    // Clean up animation system registrations
    if (this.options.enableAnimation) {
      this.graphicsComponents.forEach((_component, nodeId) => {
        try {
          graphicsAnimationIntegration.unregisterAnimatedNode(nodeId);
        } catch (error) {
          console.warn(
            `Failed to unregister animated node '${nodeId}':`,
            error,
          );
        }
      });
    }

    // Stop all animations
    this.animationCallbacks.forEach((animationId, _nodeId) => {
      cancelAnimationFrame(animationId);
    });
    this.animationCallbacks.clear();

    // Destroy all components
    this.graphicsComponents.forEach((component, _nodeId) => {
      if (component.destroy) {
        component.destroy();
      }
    });
    this.graphicsComponents.clear();

    // Clean up canvases
    this.graphicsCanvases.forEach((canvas) => {
      canvas.remove();
    });
    this.graphicsCanvases.clear();

    this.isInitialized = false;
    console.log("GraphicsComponentIntegration: Destroyed");
  }
}
