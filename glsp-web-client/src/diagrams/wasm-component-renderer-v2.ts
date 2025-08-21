/**
 * WASM Component Renderer V2 - Clean n8n/Langflow Style
 * Simplified, professional appearance with clear connection points
 */

import { Bounds, ModelElement } from "../model/diagram.js";

// Interface for WASM component interfaces
interface ComponentInterface {
  name?: string;
  interface_type?: "import" | "export";
  type?: "import" | "export";
  direction?: "input" | "output";
}

export interface ComponentColors {
  primary: string;
  secondary: string;
  input: string;
  output: string;
  selected: string;
  text: string;
  textSecondary: string;
  background: string;
  border: string;
  status: {
    loaded: string;
    unloaded: string;
    error: string;
  };
}

export interface WasmRenderingContextV2 {
  ctx: CanvasRenderingContext2D;
  scale: number;
  isSelected: boolean;
  isHovered: boolean;
  isMissing?: boolean;
  colors: ComponentColors;
  showTooltip?: boolean;
  mousePosition?: { x: number; y: number };
  showInterfaceNames?: boolean; // Toggle to show/hide interface names
}

export class WasmComponentRendererV2 {
  // Minimum dimensions - components will expand to fit content
  private static readonly MIN_WIDTH = 180;
  private static readonly MAX_WIDTH = 400;
  private static readonly DEFAULT_HEIGHT = 120;
  private static readonly HEADER_HEIGHT = 40;
  private static readonly PORT_RADIUS = 8;
  private static readonly PORT_SPACING = 24;
  private static readonly CORNER_RADIUS = 12;

  static renderWasmComponent(
    element: ModelElement,
    bounds: Bounds,
    context: WasmRenderingContextV2,
  ): void {
    const {
      ctx,
      isSelected,
      isHovered,
      isMissing,
      colors,
      showTooltip,
      mousePosition,
    } = context;

    // Get component properties
    // First check the label field (set by MCP create_node), then fall back to other properties
    const componentName =
      element.label?.toString() ||
      element.properties?.label?.toString() ||
      element.properties?.componentName?.toString() ||
      "Component";
    const componentType =
      element.properties?.componentType?.toString() || "WASM";
    const isLoaded = element.properties?.isLoaded === true;
    const interfaces = element.properties?.interfaces || [];
    const status = isMissing ? "error" : isLoaded ? "loaded" : "unloaded";

    // Debug interface data (reduced verbosity)
    // console.log('WasmComponentRendererV2: Rendering component', componentName);

    // Handle both interface count (number) and interface array
    let actualInterfaces: ComponentInterface[] = [];

    if (typeof interfaces === "number") {
      // If interfaces is a number (count), create placeholder interfaces
      actualInterfaces = Array.from({ length: interfaces }, (_, i) => ({
        name: `interface-${i + 1}`,
        interface_type: i % 2 === 0 ? "import" : "export",
        type: i % 2 === 0 ? "import" : "export",
        direction: i % 2 === 0 ? "input" : "output",
      }));
    } else if (Array.isArray(interfaces)) {
      // If interfaces is already an array, use it directly
      actualInterfaces = interfaces;
    } else {
      // Fallback for other cases
      actualInterfaces = [];
    }

    // Separate input and output interfaces for height calculation
    const inputs = actualInterfaces.filter(
      (i) =>
        i.interface_type === "import" ||
        i.type === "import" ||
        i.direction === "input",
    );
    const outputs = actualInterfaces.filter(
      (i) =>
        i.interface_type === "export" ||
        i.type === "export" ||
        i.direction === "output",
    );

    // Calculate minimum height needed for interfaces
    const maxPorts = Math.max(inputs.length, outputs.length);
    const minHeightForPorts =
      this.HEADER_HEIGHT + 40 + maxPorts * this.PORT_SPACING;

    // Calculate required width for component name (no truncation)
    ctx.font =
      'bold 14px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    const nameWidth = ctx.measureText(componentName).width;
    const iconSpace = 12 + 24 + 8; // left padding + icon + spacing
    const badgeSpace = 60; // space for type badge and right padding
    const requiredWidth = iconSpace + nameWidth + badgeSpace;

    // Use dynamic width that fits the component name, constrained by min/max
    const dynamicWidth = Math.max(
      this.MIN_WIDTH,
      Math.min(this.MAX_WIDTH, requiredWidth),
    );
    const width = Math.max(bounds.width, dynamicWidth);
    const height = Math.max(
      bounds.height,
      this.DEFAULT_HEIGHT,
      minHeightForPorts,
    );

    // Height calculation completed - reduced verbosity
    // console.log(`Component ${componentName} - inputs: ${inputs.length}, outputs: ${outputs.length}`);

    // Center the component if bounds are larger than needed
    const x = bounds.x + (bounds.width - width) / 2;
    const y = bounds.y + (bounds.height - height) / 2;

    const actualBounds = { x, y, width, height };

    // Update element bounds if component size changed due to interface count
    if (height > bounds.height || width > bounds.width) {
      // Update the element's bounds to reflect the actual rendered size
      // This ensures selection and interaction work correctly
      Object.assign(bounds, { width, height });
      console.log(
        `WasmComponentRendererV2: Updated bounds for ${componentName} to ${width}x${height}`,
      );
    }

    // Draw main component body
    this.drawComponentBody(
      ctx,
      actualBounds,
      colors,
      isSelected,
      isHovered,
      status,
    );

    // Draw header section
    const wasTruncated = this.drawComponentHeader(
      ctx,
      actualBounds,
      componentName,
      componentType,
      colors,
      status,
    );

    // Show tooltip if hovering and name was actually truncated
    if (isHovered && showTooltip && mousePosition && wasTruncated) {
      this.drawTooltip(
        ctx,
        componentName,
        mousePosition.x,
        actualBounds.y,
        colors,
      );
    }

    // Draw status indicator
    this.drawStatusIndicator(ctx, actualBounds, status, colors);

    // Draw interface names inside component if enabled
    if (context.showInterfaceNames) {
      this.drawInterfaceNames(ctx, actualBounds, actualInterfaces, colors);
    }

    // Draw input/output ports
    this.drawPorts(ctx, actualBounds, actualInterfaces, colors, isSelected);

    // Draw missing indicator if needed
    if (isMissing) {
      this.drawErrorOverlay(ctx, actualBounds, colors);
    }
  }

  private static drawComponentBody(
    ctx: CanvasRenderingContext2D,
    bounds: Bounds,
    colors: ComponentColors,
    isSelected: boolean,
    isHovered: boolean,
    _status: string,
  ): void {
    // Main body with subtle gradient
    const gradient = ctx.createLinearGradient(
      bounds.x,
      bounds.y,
      bounds.x,
      bounds.y + bounds.height,
    );
    gradient.addColorStop(0, colors.background);
    gradient.addColorStop(1, this.adjustBrightness(colors.background, -5));

    ctx.fillStyle = gradient;
    ctx.strokeStyle = isSelected
      ? colors.selected
      : isHovered
        ? colors.primary
        : colors.border;
    ctx.lineWidth = isSelected ? 3 : isHovered ? 2 : 1;

    this.drawRoundedRect(
      ctx,
      bounds.x,
      bounds.y,
      bounds.width,
      bounds.height,
      this.CORNER_RADIUS,
    );
    ctx.fill();
    ctx.stroke();

    // Add subtle inner shadow for depth
    if (!isSelected && !isHovered) {
      ctx.strokeStyle = "rgba(0, 0, 0, 0.08)";
      ctx.lineWidth = 1;
      this.drawRoundedRect(
        ctx,
        bounds.x + 1,
        bounds.y + 1,
        bounds.width - 2,
        bounds.height - 2,
        this.CORNER_RADIUS - 1,
      );
      ctx.stroke();
    }
  }

  private static drawComponentHeader(
    ctx: CanvasRenderingContext2D,
    bounds: Bounds,
    componentName: string,
    componentType: string,
    colors: ComponentColors,
    _status: string,
  ): boolean {
    // Header background with component color
    const headerGradient = ctx.createLinearGradient(
      bounds.x,
      bounds.y,
      bounds.x,
      bounds.y + this.HEADER_HEIGHT,
    );
    headerGradient.addColorStop(0, colors.primary);
    headerGradient.addColorStop(1, this.adjustBrightness(colors.primary, -10));

    ctx.fillStyle = headerGradient;
    this.drawRoundedRect(
      ctx,
      bounds.x + 1,
      bounds.y + 1,
      bounds.width - 2,
      this.HEADER_HEIGHT,
      this.CORNER_RADIUS - 1,
      true, // top corners only
    );
    ctx.fill();

    // Component icon/logo area (left side of header)
    const iconSize = 24;
    const iconX = bounds.x + 12;
    const iconY = bounds.y + (this.HEADER_HEIGHT - iconSize) / 2;

    this.drawComponentIcon(ctx, iconX, iconY, iconSize, componentType, colors);

    // Component name (center-left of header)
    ctx.fillStyle = "white";
    ctx.font =
      'bold 14px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";

    const textX = iconX + iconSize + 8;
    const textY = bounds.y + this.HEADER_HEIGHT / 2;

    // Calculate available space for text with dynamic width
    const maxTextWidth = bounds.width - textX + bounds.x - 60; // Leave space for type badge

    // Only truncate if we've hit the maximum width constraint
    let displayName = componentName;
    let wasTruncated = false;

    if (bounds.width >= this.MAX_WIDTH) {
      const truncationResult = this.smartTruncateText(
        ctx,
        componentName,
        maxTextWidth,
      );
      displayName = truncationResult.text;
      wasTruncated = truncationResult.wasTruncated;
    }

    // Component rendered - reduced verbosity

    ctx.fillText(displayName, textX, textY);

    // Component type badge (right side of header)
    this.drawTypeBadge(ctx, bounds, componentType, colors);

    return wasTruncated;
  }

  private static drawComponentIcon(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    size: number,
    componentType: string,
    _colors: ComponentColors,
  ): void {
    // Simple geometric icon based on component type
    ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
    ctx.strokeStyle = "rgba(255, 255, 255, 0.7)";
    ctx.lineWidth = 2;

    const centerX = x + size / 2;
    const centerY = y + size / 2;

    if (
      componentType.toLowerCase().includes("ai") ||
      componentType.toLowerCase().includes("ml")
    ) {
      // Brain/neural network icon for AI components
      this.drawNeuralIcon(ctx, centerX, centerY, size * 0.4);
    } else if (componentType.toLowerCase().includes("sensor")) {
      // Sensor icon
      this.drawSensorIcon(ctx, centerX, centerY, size * 0.4);
    } else if (
      componentType.toLowerCase().includes("ecu") ||
      componentType.toLowerCase().includes("control")
    ) {
      // Control unit icon
      this.drawControlIcon(ctx, centerX, centerY, size * 0.4);
    } else {
      // Default WASM cube icon
      this.drawCubeIcon(ctx, centerX, centerY, size * 0.4);
    }
  }

  private static drawStatusIndicator(
    ctx: CanvasRenderingContext2D,
    bounds: Bounds,
    status: string,
    colors: ComponentColors,
  ): void {
    const indicatorSize = 8;
    const x = bounds.x + bounds.width - indicatorSize - 8;
    const y = bounds.y + this.HEADER_HEIGHT + 8;

    // Status dot
    ctx.fillStyle = colors.status[status as keyof typeof colors.status];
    ctx.beginPath();
    ctx.arc(x, y, indicatorSize / 2, 0, 2 * Math.PI);
    ctx.fill();

    // Status text
    ctx.fillStyle = colors.textSecondary;
    ctx.font =
      '10px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";

    const statusText =
      status === "loaded"
        ? "Active"
        : status === "error"
          ? "Error"
          : "Inactive";
    ctx.fillText(statusText, x - indicatorSize, y);
  }

  private static drawPorts(
    ctx: CanvasRenderingContext2D,
    bounds: Bounds,
    interfaces: ComponentInterface[],
    colors: ComponentColors,
    isSelected: boolean,
  ): void {
    // Separate input and output interfaces
    const inputs = interfaces.filter(
      (i) =>
        i.interface_type === "import" ||
        i.type === "import" ||
        i.direction === "input",
    );
    const outputs = interfaces.filter(
      (i) =>
        i.interface_type === "export" ||
        i.type === "export" ||
        i.direction === "output",
    );

    // Draw input ports (left side)
    this.drawPortGroup(ctx, bounds, inputs, "input", colors, isSelected);

    // Draw output ports (right side)
    this.drawPortGroup(ctx, bounds, outputs, "output", colors, isSelected);
  }

  private static drawPortGroup(
    ctx: CanvasRenderingContext2D,
    bounds: Bounds,
    ports: Array<{
      name?: string;
      interface_type?: string;
      type?: string;
      direction?: string;
    }>,
    type: "input" | "output",
    colors: ComponentColors,
    isSelected: boolean,
  ): void {
    if (ports.length === 0) return;

    const isInput = type === "input";
    const portColor = isInput ? colors.input : colors.output;

    // Calculate port positions with proper spacing
    const startY = bounds.y + this.HEADER_HEIGHT + 20;
    const spacing = this.PORT_SPACING; // Use consistent spacing - component height is now dynamic

    ports.forEach((port, index) => {
      const x = isInput ? bounds.x : bounds.x + bounds.width;
      const y = startY + index * spacing;

      // Draw port circle
      ctx.fillStyle = portColor;
      ctx.strokeStyle = isSelected ? colors.selected : "white";
      ctx.lineWidth = 2;

      ctx.beginPath();
      ctx.arc(x, y, this.PORT_RADIUS, 0, 2 * Math.PI);
      ctx.fill();
      ctx.stroke();

      // Add connection hint
      ctx.fillStyle = "white";
      ctx.beginPath();
      ctx.arc(x, y, this.PORT_RADIUS - 3, 0, 2 * Math.PI);
      ctx.fill();

      // Port label (on hover or selection)
      if (isSelected) {
        this.drawPortLabel(
          ctx,
          port.name || `${type}-${index}`,
          x,
          y,
          isInput,
          colors,
        );
      }
    });
  }

  private static drawPortLabel(
    ctx: CanvasRenderingContext2D,
    label: string,
    x: number,
    y: number,
    isInput: boolean,
    _colors: ComponentColors,
  ): void {
    ctx.font =
      '10px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.textBaseline = "middle";

    const metrics = ctx.measureText(label);
    const padding = 6;
    const labelWidth = metrics.width + padding * 2;
    const labelHeight = 18;

    const labelX = isInput
      ? x - this.PORT_RADIUS - 8 - labelWidth
      : x + this.PORT_RADIUS + 8;

    // Label background
    ctx.fillStyle = "rgba(0, 0, 0, 0.8)";
    this.drawRoundedRect(
      ctx,
      labelX,
      y - labelHeight / 2,
      labelWidth,
      labelHeight,
      4,
    );
    ctx.fill();

    // Label text
    ctx.fillStyle = "white";
    ctx.textAlign = isInput ? "right" : "left";
    ctx.fillText(label, labelX + (isInput ? labelWidth - padding : padding), y);
  }

  private static drawTypeBadge(
    ctx: CanvasRenderingContext2D,
    bounds: Bounds,
    componentType: string,
    _colors: ComponentColors,
  ): void {
    const badgeWidth = 45;
    const badgeHeight = 16;
    const badgeX = bounds.x + bounds.width - badgeWidth - 8;
    const badgeY = bounds.y + (this.HEADER_HEIGHT - badgeHeight) / 2;

    // Badge background
    ctx.fillStyle = "rgba(255, 255, 255, 0.2)";
    this.drawRoundedRect(ctx, badgeX, badgeY, badgeWidth, badgeHeight, 8);
    ctx.fill();

    // Badge text
    ctx.fillStyle = "white";
    ctx.font =
      'bold 9px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    const badgeText = componentType.toUpperCase().substring(0, 6);
    ctx.fillText(badgeText, badgeX + badgeWidth / 2, badgeY + badgeHeight / 2);
  }

  private static drawErrorOverlay(
    ctx: CanvasRenderingContext2D,
    bounds: Bounds,
    colors: ComponentColors,
  ): void {
    // Semi-transparent red overlay
    ctx.fillStyle = "rgba(244, 67, 54, 0.1)";
    this.drawRoundedRect(
      ctx,
      bounds.x + 1,
      bounds.y + 1,
      bounds.width - 2,
      bounds.height - 2,
      this.CORNER_RADIUS - 1,
    );
    ctx.fill();

    // Error icon in bottom-right
    const iconSize = 16;
    const iconX = bounds.x + bounds.width - iconSize - 8;
    const iconY = bounds.y + bounds.height - iconSize - 8;

    ctx.fillStyle = colors.status.error;
    ctx.beginPath();
    ctx.arc(
      iconX + iconSize / 2,
      iconY + iconSize / 2,
      iconSize / 2,
      0,
      2 * Math.PI,
    );
    ctx.fill();

    ctx.fillStyle = "white";
    ctx.font = "bold 10px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("!", iconX + iconSize / 2, iconY + iconSize / 2);
  }

  // Icon drawing helpers
  private static drawCubeIcon(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    size: number,
  ): void {
    const s = size;
    ctx.beginPath();
    // Simple isometric cube
    ctx.moveTo(x - s / 2, y);
    ctx.lineTo(x, y - s / 2);
    ctx.lineTo(x + s / 2, y);
    ctx.lineTo(x, y + s / 2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  private static drawNeuralIcon(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    size: number,
  ): void {
    // Simple neural network representation
    const nodeRadius = size / 6;
    const nodes = [
      { x: x - size / 3, y: y - size / 4 },
      { x: x - size / 3, y: y + size / 4 },
      { x: x + size / 3, y: y },
    ];

    // Draw connections
    ctx.beginPath();
    nodes.forEach((node, i) => {
      nodes.forEach((other, j) => {
        if (i !== j) {
          ctx.moveTo(node.x, node.y);
          ctx.lineTo(other.x, other.y);
        }
      });
    });
    ctx.stroke();

    // Draw nodes
    nodes.forEach((node) => {
      ctx.beginPath();
      ctx.arc(node.x, node.y, nodeRadius, 0, 2 * Math.PI);
      ctx.fill();
    });
  }

  private static drawSensorIcon(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    size: number,
  ): void {
    // Radar/sensor waves
    const waveCount = 3;
    for (let i = 0; i < waveCount; i++) {
      const radius = ((size / 2) * (i + 1)) / waveCount;
      ctx.beginPath();
      ctx.arc(x, y, radius, -Math.PI / 3, Math.PI / 3);
      ctx.stroke();
    }
  }

  private static drawControlIcon(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    size: number,
  ): void {
    // Circuit board pattern
    const s = size / 3;
    ctx.beginPath();
    ctx.rect(x - s, y - s, s * 2, s * 2);
    ctx.moveTo(x - s, y);
    ctx.lineTo(x + s, y);
    ctx.moveTo(x, y - s);
    ctx.lineTo(x, y + s);
    ctx.stroke();

    // Corner nodes
    [-s, s].forEach((dx) => {
      [-s, s].forEach((dy) => {
        ctx.beginPath();
        ctx.arc(x + dx, y + dy, s / 4, 0, 2 * Math.PI);
        ctx.fill();
      });
    });
  }

  // Utility methods
  private static drawRoundedRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    radius: number,
    topOnly: boolean = false,
  ): void {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);

    if (topOnly) {
      ctx.lineTo(x + width, y + height);
      ctx.lineTo(x, y + height);
      ctx.lineTo(x, y + radius);
    } else {
      ctx.lineTo(x + width, y + height - radius);
      ctx.quadraticCurveTo(
        x + width,
        y + height,
        x + width - radius,
        y + height,
      );
      ctx.lineTo(x + radius, y + height);
      ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
      ctx.lineTo(x, y + radius);
    }

    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  }

  private static adjustBrightness(color: string, percent: number): string {
    // Simple brightness adjustment for hex colors
    if (color.startsWith("#")) {
      const num = parseInt(color.slice(1), 16);
      const amt = Math.round(2.55 * percent);
      const R = (num >> 16) + amt;
      const G = ((num >> 8) & 0x00ff) + amt;
      const B = (num & 0x0000ff) + amt;
      return `#${(
        0x1000000 +
        (R < 255 ? (R < 1 ? 0 : R) : 255) * 0x10000 +
        (G < 255 ? (G < 1 ? 0 : G) : 255) * 0x100 +
        (B < 255 ? (B < 1 ? 0 : B) : 255)
      )
        .toString(16)
        .slice(1)}`;
    }
    return color;
  }

  private static smartTruncateText(
    ctx: CanvasRenderingContext2D,
    text: string,
    maxWidth: number,
  ): { text: string; wasTruncated: boolean } {
    if (ctx.measureText(text).width <= maxWidth) {
      return { text, wasTruncated: false };
    }

    // Try to break at sensible points first (underscore, dash, camelCase)
    const breakPoints = [/_/g, /-/g, /(?=[A-Z])/g];

    for (const breakPattern of breakPoints) {
      const parts = text.split(breakPattern);
      if (parts.length > 1) {
        // Try to keep the most important part (usually the end)
        let truncated = parts[parts.length - 1];
        if (ctx.measureText(truncated).width <= maxWidth) {
          return { text: truncated, wasTruncated: true };
        }

        // If last part is still too long, try first part
        truncated = parts[0];
        if (ctx.measureText(truncated).width <= maxWidth) {
          return { text: truncated, wasTruncated: true };
        }
      }
    }

    // Fall back to character-by-character truncation
    let truncated = text;
    while (
      ctx.measureText(truncated + "…").width > maxWidth &&
      truncated.length > 0
    ) {
      truncated = truncated.slice(0, -1);
    }
    return {
      text: truncated + (truncated.length < text.length ? "…" : ""),
      wasTruncated: truncated.length < text.length,
    };
  }

  // Method to render tooltip for truncated text
  private static drawTooltip(
    ctx: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    _colors: ComponentColors,
  ): void {
    ctx.font =
      '12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    const metrics = ctx.measureText(text);
    const padding = 8;
    const tooltipWidth = metrics.width + padding * 2;
    const tooltipHeight = 24;

    // Position tooltip above the component
    const tooltipX = x - tooltipWidth / 2;
    const tooltipY = y - tooltipHeight - 10;

    // Draw tooltip background
    ctx.fillStyle = "rgba(0, 0, 0, 0.9)";
    this.drawRoundedRect(
      ctx,
      tooltipX,
      tooltipY,
      tooltipWidth,
      tooltipHeight,
      6,
    );
    ctx.fill();

    // Draw tooltip border
    ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
    ctx.lineWidth = 1;
    ctx.stroke();

    // Draw tooltip text
    ctx.fillStyle = "white";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(
      text,
      tooltipX + tooltipWidth / 2,
      tooltipY + tooltipHeight / 2,
    );
  }

  // Draw interface names inside the component
  private static drawInterfaceNames(
    ctx: CanvasRenderingContext2D,
    bounds: Bounds,
    interfaces: ComponentInterface[],
    colors: ComponentColors,
  ): void {
    // Separate imports and exports
    const imports = interfaces.filter(
      (i) =>
        i.interface_type === "import" ||
        i.type === "import" ||
        i.direction === "input",
    );
    const exports = interfaces.filter(
      (i) =>
        i.interface_type === "export" ||
        i.type === "export" ||
        i.direction === "output",
    );

    // Set up text style for interface names
    ctx.font =
      '10px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.textBaseline = "middle";

    // Use the same positioning as the ports
    const startY = bounds.y + this.HEADER_HEIGHT + 20;
    const spacing = this.PORT_SPACING;

    // Draw imports on the left side (aligned with ports)
    if (imports.length > 0) {
      ctx.textAlign = "left";
      ctx.fillStyle = colors.input;

      imports.forEach((imp, index) => {
        const y = startY + index * spacing;
        if (y < bounds.y + bounds.height - 20) {
          // Don't overflow component bounds
          const name = imp.name || `import-${index + 1}`;
          // Position text just inside the port
          const textX = bounds.x + this.PORT_RADIUS + 15;
          // Truncate long names
          const maxWidth = bounds.width / 2 - 40;
          const truncated = this.truncateText(ctx, name, maxWidth);
          ctx.fillText(truncated, textX, y);
        }
      });
    }

    // Draw exports on the right side (aligned with ports)
    if (exports.length > 0) {
      ctx.textAlign = "right";
      ctx.fillStyle = colors.output;

      exports.forEach((exp, index) => {
        const y = startY + index * spacing;
        if (y < bounds.y + bounds.height - 20) {
          // Don't overflow component bounds
          const name = exp.name || `export-${index + 1}`;
          // Position text just inside the port
          const textX = bounds.x + bounds.width - this.PORT_RADIUS - 15;
          // Truncate long names
          const maxWidth = bounds.width / 2 - 40;
          const truncated = this.truncateText(ctx, name, maxWidth);
          ctx.fillText(truncated, textX, y);
        }
      });
    }
  }

  // Simple text truncation helper
  private static truncateText(
    ctx: CanvasRenderingContext2D,
    text: string,
    maxWidth: number,
  ): string {
    if (ctx.measureText(text).width <= maxWidth) {
      return text;
    }

    let truncated = text;
    while (
      ctx.measureText(truncated + "…").width > maxWidth &&
      truncated.length > 0
    ) {
      truncated = truncated.slice(0, -1);
    }
    return truncated + "…";
  }

  // Default color scheme inspired by modern workflow tools
  static getDefaultColors() {
    return {
      primary: "#4F46E5", // Modern purple-blue
      secondary: "#6366F1", // Lighter purple
      input: "#10B981", // Green for inputs
      output: "#F59E0B", // Orange for outputs
      selected: "#EC4899", // Pink for selection
      text: "#1F2937", // Dark gray text
      textSecondary: "#6B7280", // Light gray text
      background: "#FFFFFF", // White background
      border: "#E5E7EB", // Light border
      status: {
        loaded: "#10B981", // Green
        unloaded: "#6B7280", // Gray
        error: "#EF4444", // Red
      },
    };
  }

  // Check if a position is within a port area (for connection logic)
  static getPortAtPosition(
    element: ModelElement,
    bounds: Bounds,
    position: { x: number; y: number },
  ): {
    port: ComponentInterface & { name: string };
    type: "input" | "output";
  } | null {
    const interfaces = element.properties?.interfaces || [];

    // Handle both interface count (number) and interface array
    let actualInterfaces: ComponentInterface[] = [];

    if (typeof interfaces === "number") {
      // If interfaces is a number (count), create placeholder interfaces
      actualInterfaces = Array.from({ length: interfaces }, (_, i) => ({
        name: `interface-${i + 1}`,
        interface_type: i % 2 === 0 ? "import" : "export",
        type: i % 2 === 0 ? "import" : "export",
        direction: i % 2 === 0 ? "input" : "output",
      }));
    } else if (Array.isArray(interfaces)) {
      // If interfaces is already an array, use it directly
      actualInterfaces = interfaces;
    }

    const inputs = actualInterfaces.filter(
      (i) =>
        i.interface_type === "import" ||
        i.type === "import" ||
        i.direction === "input",
    );
    const outputs = actualInterfaces.filter(
      (i) =>
        i.interface_type === "export" ||
        i.type === "export" ||
        i.direction === "output",
    );

    // Check input ports
    const startY = bounds.y + this.HEADER_HEIGHT + 20;
    const availableHeight = bounds.height - this.HEADER_HEIGHT - 40;
    const spacing = Math.min(
      this.PORT_SPACING,
      availableHeight / Math.max(inputs.length || outputs.length, 1),
    );

    // Check inputs (left side)
    for (let i = 0; i < inputs.length; i++) {
      const portX = bounds.x;
      const portY = startY + i * spacing;
      const distance = Math.sqrt(
        Math.pow(position.x - portX, 2) + Math.pow(position.y - portY, 2),
      );

      if (distance <= this.PORT_RADIUS + 20) {
        // Larger tolerance for easier clicking
        console.log(
          `FOUND INPUT PORT: ${inputs[i].name} at (${portX}, ${portY}), click: (${position.x}, ${position.y}), distance: ${distance}`,
        );
        return {
          port: { ...inputs[i], name: inputs[i].name || `input-${i + 1}` },
          type: "input",
        };
      }
    }

    // Check outputs (right side)
    for (let i = 0; i < outputs.length; i++) {
      const portX = bounds.x + bounds.width;
      const portY = startY + i * spacing;
      const distance = Math.sqrt(
        Math.pow(position.x - portX, 2) + Math.pow(position.y - portY, 2),
      );

      if (distance <= this.PORT_RADIUS + 20) {
        // Larger tolerance for easier clicking
        console.log(
          `FOUND OUTPUT PORT: ${outputs[i].name} at (${portX}, ${portY}), click: (${position.x}, ${position.y}), distance: ${distance}`,
        );
        return {
          port: { ...outputs[i], name: outputs[i].name || `output-${i + 1}` },
          type: "output",
        };
      }
    }

    return null;
  }

  // Check if component name would be truncated (useful for hover logic)
  static wouldNameBeTruncated(
    componentName: string,
    bounds: Bounds,
    ctx: CanvasRenderingContext2D,
  ): boolean {
    ctx.font =
      'bold 14px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    const iconSize = 24;
    const textX = bounds.x + 12 + iconSize + 8;
    const maxTextWidth = bounds.width - textX - bounds.x - 60;
    const textWidth = ctx.measureText(componentName).width;
    return textWidth > maxTextWidth;
  }

  // Get the full component name for tooltip display
  static getFullComponentName(element: ModelElement): string {
    return (
      element.label?.toString() ||
      element.properties?.label?.toString() ||
      element.properties?.componentName?.toString() ||
      "Component"
    );
  }
}
