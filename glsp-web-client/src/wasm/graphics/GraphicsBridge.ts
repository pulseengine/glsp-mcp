/**
 * Graphics bridge for WASM components - Backend-first approach
 *
 * This bridge delegates complex graphics processing to the backend server
 * and only handles basic canvas operations on the frontend.
 */

interface McpGraphicsService {
  callTool(
    toolName: string,
    params: Record<string, unknown>,
  ): Promise<{
    isError?: boolean;
    content?: Array<{ text?: string }>;
  }>;
}

export interface RenderCommand {
  type: "rect" | "circle" | "line" | "text" | "path" | "image" | "clear";
  params: Record<string, unknown>;
  style?: RenderStyle;
}

export interface RenderStyle {
  fillColor?: string;
  strokeColor?: string;
  lineWidth?: number;
  font?: string;
  alpha?: number;
}

export interface GraphicsAPI {
  // Basic immediate operations (handled locally)
  drawRect(
    x: number,
    y: number,
    width: number,
    height: number,
    style?: RenderStyle,
  ): void;
  drawCircle(x: number, y: number, radius: number, style?: RenderStyle): void;
  drawLine(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    style?: RenderStyle,
  ): void;
  drawText(text: string, x: number, y: number, style?: RenderStyle): void;
  clear(): void;

  // Canvas properties
  getWidth(): number;
  getHeight(): number;
  getCanvasSize(): { width: number; height: number };

  // Backend rendering (for complex operations)
  renderOnBackend(
    componentId: string,
    commands: RenderCommand[],
  ): Promise<ImageData | null>;
  streamFromBackend(
    componentId: string,
    params: Record<string, unknown>,
  ): Promise<void>;
  renderChart(data: any, options?: any): Promise<any>;
  streamVisualization(dataStream: any, options?: any): Promise<any>;
}

export class GraphicsBridge implements GraphicsAPI {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private mcpService: McpGraphicsService;

  constructor(canvas: HTMLCanvasElement, mcpService: McpGraphicsService) {
    this.canvas = canvas;
    this.mcpService = mcpService;

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Failed to get 2D context from canvas");
    }
    this.ctx = ctx;

    // Basic setup
    this.ctx.imageSmoothingEnabled = true;
    this.ctx.lineCap = "round";
    this.ctx.lineJoin = "round";
  }

  // Local immediate operations for basic graphics
  drawRect(
    x: number,
    y: number,
    width: number,
    height: number,
    style?: RenderStyle,
  ): void {
    this.applyStyle(style);

    if (style?.fillColor) {
      this.ctx.fillRect(x, y, width, height);
    }
    if (style?.strokeColor) {
      this.ctx.strokeRect(x, y, width, height);
    }
  }

  drawCircle(x: number, y: number, radius: number, style?: RenderStyle): void {
    this.applyStyle(style);

    this.ctx.beginPath();
    this.ctx.arc(x, y, radius, 0, Math.PI * 2);

    if (style?.fillColor) {
      this.ctx.fill();
    }
    if (style?.strokeColor) {
      this.ctx.stroke();
    }
  }

  drawLine(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    style?: RenderStyle,
  ): void {
    this.applyStyle(style);

    this.ctx.beginPath();
    this.ctx.moveTo(x1, y1);
    this.ctx.lineTo(x2, y2);
    this.ctx.stroke();
  }

  drawText(text: string, x: number, y: number, style?: RenderStyle): void {
    this.applyStyle(style);

    if (style?.fillColor) {
      this.ctx.fillText(text, x, y);
    }
    if (style?.strokeColor) {
      this.ctx.strokeText(text, x, y);
    }
  }

  clear(): void {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  getWidth(): number {
    return this.canvas.width;
  }

  getHeight(): number {
    return this.canvas.height;
  }

  getCanvasSize(): { width: number; height: number } {
    return { width: this.canvas.width, height: this.canvas.height };
  }

  /**
   * Render complex graphics on the backend and receive the result
   * This is for heavy operations like 3D rendering, complex animations, etc.
   */
  async renderOnBackend(
    componentId: string,
    commands: RenderCommand[],
  ): Promise<ImageData | null> {
    try {
      const result = await this.mcpService.callTool("render_wasm_graphics", {
        componentId,
        commands,
        width: this.canvas.width,
        height: this.canvas.height,
      });

      if (result.isError) {
        throw new Error(
          result.content?.[0]?.text || "Backend rendering failed",
        );
      }

      // Parse the result - backend should return base64 encoded image data
      const response = JSON.parse(result.content?.[0]?.text || "{}");
      if (response.imageData) {
        // Convert base64 to ImageData and draw to canvas
        const imageData = await this.base64ToImageData(response.imageData);
        if (imageData) {
          this.ctx.putImageData(imageData, 0, 0);
          return imageData;
        }
      }

      return null;
    } catch (error) {
      console.error("Backend rendering failed:", error);
      return null;
    }
  }

  /**
   * Stream live graphics data from backend (e.g., for real-time visualizations)
   */
  async streamFromBackend(
    componentId: string,
    params: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.mcpService.callTool("stream_wasm_graphics", {
        componentId,
        params,
        width: this.canvas.width,
        height: this.canvas.height,
      });
    } catch (error) {
      console.error("Graphics streaming failed:", error);
    }
  }

  private applyStyle(style?: RenderStyle): void {
    if (!style) return;

    if (style.fillColor) this.ctx.fillStyle = style.fillColor;
    if (style.strokeColor) this.ctx.strokeStyle = style.strokeColor;
    if (style.lineWidth) this.ctx.lineWidth = style.lineWidth;
    if (style.font) this.ctx.font = style.font;
    if (style.alpha) this.ctx.globalAlpha = style.alpha;
  }

  private async base64ToImageData(base64: string): Promise<ImageData | null> {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        // Create temporary canvas to extract ImageData
        const tempCanvas = document.createElement("canvas");
        tempCanvas.width = this.canvas.width;
        tempCanvas.height = this.canvas.height;
        const tempCtx = tempCanvas.getContext("2d");

        if (tempCtx) {
          tempCtx.drawImage(img, 0, 0);
          const imageData = tempCtx.getImageData(
            0,
            0,
            tempCanvas.width,
            tempCanvas.height,
          );
          resolve(imageData);
        } else {
          resolve(null);
        }
      };
      img.onerror = () => resolve(null);
      img.src = `data:image/png;base64,${base64}`;
    });
  }

  // Planned integration methods - ready for implementation
  async initialize(): Promise<void> {
    // TODO: Initialize graphics system with advanced features
    console.log(
      "GraphicsBridge: Initialize method called - ready for implementation",
    );
  }

  async renderChart(data: any, options?: any): Promise<any> {
    // TODO: Backend-delegated chart rendering
    console.log(
      "GraphicsBridge: renderChart called with data:",
      data,
      "options:",
      options,
    );
    return null;
  }

  async streamVisualization(dataStream: any, options?: any): Promise<any> {
    // TODO: Real-time visualization streaming
    console.log(
      "GraphicsBridge: streamVisualization called with data:",
      dataStream,
      "options:",
      options,
    );
    return null;
  }
}

/**
 * Factory for creating graphics bridges
 */
export class GraphicsFactory {
  static create(
    canvas: HTMLCanvasElement,
    mcpService: McpGraphicsService,
  ): GraphicsAPI {
    return new GraphicsBridge(canvas, mcpService);
  }
}

/**
 * Component interface for WASM graphics components
 */
export interface WasmGraphicsComponent {
  render(graphics: GraphicsAPI): void;
  update?(deltaTime: number): void;
  onResize?(width: number, height: number): void;
}

/**
 * Base class for WASM graphics components
 */
export abstract class BaseWasmGraphicsComponent
  implements WasmGraphicsComponent
{
  protected width: number = 0;
  protected height: number = 0;

  abstract render(graphics: GraphicsAPI): void;

  update(_deltaTime: number): void {
    // Override in subclasses if needed
  }

  onResize(width: number, height: number): void {
    this.width = width;
    this.height = height;
  }
}
