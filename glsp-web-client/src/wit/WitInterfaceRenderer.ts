/**
 * WIT Interface Renderer
 * Custom canvas renderer for WebAssembly Interface Types diagrams
 */

import { CanvasRenderer } from "../renderer/canvas-renderer.js";
import {
  DiagramModel,
  ModelElement,
  Node,
  Edge,
  Position,
} from "../model/diagram.js";
import {
  WIT_VISUAL_STYLES,
  WIT_ICONS,
} from "../diagrams/wit-interface-types.js";
import {
  WitElement,
  WitConnection,
  WitDiagram,
  WitElementType,
  WitConnectionType,
  WitViewConfig,
} from "./wit-types.js";
import { WitIconLegend } from "./components/WitIconLegend.js";
import { WitElementIcon } from "./components/WitElementIcon.js";

// Define proper interface for WIT element properties
export interface WitElementProperties {
  interfaceType?: string;
  functions?: unknown[];
  types?: unknown[];
  resources?: unknown[];
  methods?: unknown[];
  worlds?: unknown[];
  parameterCount?: number;
  returnCount?: number;
  fieldsCount?: number;
  casesCount?: number;
  methodsCount?: number;
  importsCount?: number;
  exportsCount?: number;
  description?: string;
  functionsCount?: number;
  typesCount?: number;
  witType?: string;
  hovered?: boolean;
  relatedHighlight?: boolean;
  hoverEffects?: unknown;
  originalStyles?: unknown;
  highlighted?: boolean;
}

// Define interface for node metadata
export interface WitNodeMetadata {
  witType?: string;
  highlighted?: boolean;
  [key: string]: unknown;
}

export class WitInterfaceRenderer extends CanvasRenderer {
  private expandedNodes: Set<string> = new Set();
  private hoveredElement: WitElement | null = null;
  private hoveredElementId: string | null = null;
  private witDiagramModel: DiagramModel | null = null;
  private elementTooltip: HTMLElement | null = null;
  private tooltipTimeout: number | null = null;
  private mouseMoveDebounceTimeout: number | null = null;
  private lastMousePosition: Position | null = null;
  private witViewConfig: WitViewConfig = {
    showPackages: true,
    showWorlds: true,
    showInterfaces: true,
    showTypes: true,
    showFunctions: true,
    showResources: true,
    expandLevel: 2,
    highlightImports: true,
    highlightExports: true,
  };
  private onWitModelChange?: (model: DiagramModel) => void;
  private iconLegend: WitIconLegend | null = null;
  private _legendContainer: HTMLElement | null = null;
  private _showLegend: boolean = true;

  // Hover state management
  private relatedElements: Set<string> = new Set();

  /**
   * Override the default node rendering for WIT-specific visualization
   */
  protected renderNode(node: Node): void {
    const ctx = this.ctx;
    if (!ctx) return;

    const bounds = node.bounds || {
      x: node.position?.x || 0,
      y: node.position?.y || 0,
      width: node.size?.width || 100,
      height: node.size?.height || 60,
    };

    // Get node type and style
    const nodeType = this.getWitNodeType(node);
    const style = this.getNodeStyle(nodeType);
    const isHovered = this.hoveredElementId === node.id;
    const isRelatedHighlight = node.properties?.relatedHighlight === true;

    // Save context state
    ctx.save();

    // Draw hover effect if element is hovered
    if (isHovered) {
      // Draw glow effect
      ctx.shadowColor = "#4CAF50";
      ctx.shadowBlur = 15;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;

      // Draw hover outline
      ctx.strokeStyle = "#4CAF50";
      ctx.lineWidth = 3;
      this.drawRoundedRect(
        bounds.x - 2,
        bounds.y - 2,
        bounds.width + 4,
        bounds.height + 4,
        style.borderRadius + 2,
      );
      ctx.stroke();

      // Reset shadow for main drawing
      ctx.shadowBlur = 0;
    }

    // Draw related highlight if applicable
    if (isRelatedHighlight) {
      ctx.strokeStyle = "#3B82F6";
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      this.drawRoundedRect(
        bounds.x - 1,
        bounds.y - 1,
        bounds.width + 2,
        bounds.height + 2,
        style.borderRadius + 1,
      );
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Apply node-specific styling with hover modifications
    if (isHovered) {
      // Brighten background color on hover
      ctx.fillStyle = this.brightenColor(style.backgroundColor, 0.1);
      ctx.strokeStyle = "#4CAF50";
      ctx.lineWidth = 2;
    } else {
      ctx.fillStyle = style.backgroundColor;
      ctx.strokeStyle = style.borderColor;
      ctx.lineWidth = style.borderWidth;
    }

    // Draw rounded rectangle
    this.drawRoundedRect(
      bounds.x,
      bounds.y,
      bounds.width,
      bounds.height,
      style.borderRadius,
    );

    // Fill and stroke
    ctx.fill();
    ctx.stroke();

    // Draw icon and label with enhanced positioning
    ctx.fillStyle = style.textColor;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";

    const icon = this.getNodeIcon(nodeType);
    const label = node.label || node.properties?.name || "Unnamed";

    // Calculate icon size based on element type
    const iconSize = this.getIconSize(nodeType);
    const iconX = bounds.x + 8;
    const iconY = bounds.y + bounds.height / 2;

    // Draw icon with appropriate sizing
    ctx.font = `${iconSize}px sans-serif`;
    ctx.fillText(icon, iconX, iconY);

    // Draw label with proper spacing from icon
    ctx.font = `${style.fontWeight} ${style.fontSize}px -apple-system, sans-serif`;
    const labelX = bounds.x + iconSize + 15;
    const labelY = bounds.y + bounds.height / 2;

    // Truncate label if it's too long
    const maxLabelWidth = bounds.width - iconSize - 25;
    const truncatedLabel = this.truncateText(ctx, String(label), maxLabelWidth);
    ctx.fillText(truncatedLabel, labelX, labelY);

    // Draw additional details for interfaces
    if (nodeType === "interface" && node.properties) {
      this.renderInterfaceDetails(node, bounds, style);
    }

    // Draw expansion indicator for container nodes
    if (this.isContainerNode(nodeType)) {
      this.drawExpansionIndicator(node, bounds);
    }

    // Restore context state
    ctx.restore();
  }

  /**
   * Get the WIT-specific node type
   */
  private getWitNodeType(node: Node): string {
    const elementType = node.element_type || node.type || "";

    // Map element types to WIT node types that correspond to WIT_ICONS keys
    if (elementType.includes("package")) return "package";
    if (elementType.includes("world")) return "world";
    if (elementType.includes("interface")) return "interface";
    if (elementType.includes("function")) return "function";
    if (elementType.includes("record")) return "record";
    if (elementType.includes("variant")) return "variant";
    if (elementType.includes("enum")) return "enum";
    if (elementType.includes("flags")) return "flags";
    if (elementType.includes("resource")) return "resource";
    if (elementType.includes("import")) return "import";
    if (elementType.includes("export")) return "export";
    if (elementType.includes("primitive")) return "primitive";
    if (elementType.includes("list")) return "list";
    if (elementType.includes("tuple")) return "tuple";
    if (elementType.includes("option")) return "option";
    if (elementType.includes("result")) return "result";
    if (elementType.includes("type")) return "record"; // Generic type defaults to record

    return "interface"; // default
  }

  /**
   * Get visual style for a node type
   */
  private getNodeStyle(nodeType: string): any {
    const styles = WIT_VISUAL_STYLES as any;
    return styles[nodeType] || styles.interface;
  }

  /**
   * Get icon for a node type using the WIT_ICONS system
   */
  private getNodeIcon(nodeType: string): string {
    return WIT_ICONS[nodeType as keyof typeof WIT_ICONS] || WIT_ICONS.interface;
  }

  /**
   * Get appropriate icon size based on element type and hierarchy
   */
  private getIconSize(nodeType: string): number {
    const iconSizes: Record<string, number> = {
      package: 24, // Largest for top-level elements
      world: 22, // Large for world-level elements
      interface: 20, // Standard for interfaces
      function: 16, // Smaller for functions
      record: 16, // Standard for type definitions
      variant: 16,
      enum: 16,
      flags: 16,
      resource: 18, // Slightly larger for resources
      import: 18, // Standard for import/export containers
      export: 18,
      primitive: 14, // Smallest for primitive types
      list: 16,
      tuple: 16,
      option: 14,
      result: 16,
    };
    return iconSizes[nodeType] || 18;
  }

  /**
   * Truncate text to fit within specified width
   */
  private truncateText(
    ctx: CanvasRenderingContext2D,
    text: string,
    maxWidth: number,
  ): string {
    const metrics = ctx.measureText(text);
    if (metrics.width <= maxWidth) {
      return text;
    }

    // Try progressively shorter versions with ellipsis
    for (let i = text.length - 1; i > 0; i--) {
      const truncated = text.substring(0, i) + "…";
      const truncatedMetrics = ctx.measureText(truncated);
      if (truncatedMetrics.width <= maxWidth) {
        return truncated;
      }
    }

    return "…";
  }

  /**
   * Render additional details for interface nodes
   */
  private renderInterfaceDetails(node: Node, bounds: any, style: any): void {
    const ctx = this.ctx;
    if (!ctx || !node.properties) return;

    ctx.save();

    // Draw interface type badge
    const interfaceType = (node.properties.interfaceType as string) || "export";
    const badgeColor = interfaceType === "import" ? "#3B82F6" : "#10B981";

    ctx.fillStyle = badgeColor;
    ctx.font = "10px sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(
      interfaceType.toUpperCase(),
      bounds.x + bounds.width - 10,
      bounds.y + 15,
    );

    // Draw function/type counts with icons if available
    if (
      node.properties.functions ||
      node.properties.types ||
      node.properties.resources
    ) {
      ctx.font = "10px sans-serif";
      ctx.fillStyle = style.textColor;
      ctx.globalAlpha = 0.8;
      ctx.textAlign = "left";

      let detailY = bounds.y + bounds.height - 25;
      const detailX = bounds.x + 8;

      // Show function count with icon
      const functions = (node.properties.functions as any[]) || [];
      if (functions.length > 0) {
        ctx.fillText(
          `${WIT_ICONS.function} ${functions.length}`,
          detailX,
          detailY,
        );
        detailY += 12;
      }

      // Show type count with icon
      const types = (node.properties.types as any[]) || [];
      if (types.length > 0) {
        ctx.fillText(`${WIT_ICONS.record} ${types.length}`, detailX, detailY);
        detailY += 12;
      }

      // Show resource count with icon
      const resources = (node.properties.resources as any[]) || [];
      if (resources.length > 0) {
        ctx.fillText(
          `${WIT_ICONS.resource} ${resources.length}`,
          detailX,
          detailY,
        );
      }
    }

    ctx.restore();
  }

  /**
   * Check if a node type can contain other nodes
   */
  private isContainerNode(nodeType: string): boolean {
    return ["package", "world", "interface", "import", "export"].includes(
      nodeType,
    );
  }

  /**
   * Draw expansion/collapse indicator
   */
  private drawExpansionIndicator(node: Node, bounds: any): void {
    const ctx = this.ctx;
    if (!ctx) return;

    const isExpanded = this.expandedNodes.has(node.id);
    const indicatorSize = 12;
    const x = bounds.x + bounds.width - indicatorSize - 5;
    const y = bounds.y + bounds.height - indicatorSize - 5;

    ctx.save();

    // Draw background
    ctx.fillStyle = "rgba(255, 255, 255, 0.1)";
    ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
    ctx.lineWidth = 1;

    ctx.beginPath();
    ctx.arc(
      x + indicatorSize / 2,
      y + indicatorSize / 2,
      indicatorSize / 2,
      0,
      Math.PI * 2,
    );
    ctx.fill();
    ctx.stroke();

    // Draw plus/minus
    ctx.strokeStyle = "#FFFFFF";
    ctx.lineWidth = 2;
    ctx.beginPath();

    // Horizontal line
    ctx.moveTo(x + 3, y + indicatorSize / 2);
    ctx.lineTo(x + indicatorSize - 3, y + indicatorSize / 2);

    // Vertical line (only for collapsed state)
    if (!isExpanded) {
      ctx.moveTo(x + indicatorSize / 2, y + 3);
      ctx.lineTo(x + indicatorSize / 2, y + indicatorSize - 3);
    }

    ctx.stroke();
    ctx.restore();
  }

  /**
   * Override edge rendering for WIT-specific styling
   */
  protected renderEdge(edge: Edge): void {
    const ctx = this.ctx;
    if (!ctx || !edge.sourceId || !edge.targetId) return;

    // Get edge type and style
    const edgeType = this.getWitEdgeType(edge);
    const edgeConfig = this.getEdgeConfig(edgeType);

    // Find source and target nodes
    const sourceNode = this.findNode(edge.sourceId);
    const targetNode = this.findNode(edge.targetId);

    if (!sourceNode || !targetNode) return;

    // Calculate connection points
    const sourceBounds = this.getNodeBounds(sourceNode);
    const targetBounds = this.getNodeBounds(targetNode);

    const sourcePoint = this.getConnectionPoint(sourceBounds, targetBounds);
    const targetPoint = this.getConnectionPoint(targetBounds, sourceBounds);

    ctx.save();

    // Set edge style
    ctx.strokeStyle = edgeConfig.color || "#6B7280";
    ctx.lineWidth = 2;

    // Set dash pattern based on style
    if (edgeConfig.style === "dashed") {
      ctx.setLineDash([5, 5]);
    } else if (edgeConfig.style === "dotted") {
      ctx.setLineDash([2, 3]);
    }

    // Draw the path
    ctx.beginPath();

    if (edge.routingPoints && edge.routingPoints.length > 0) {
      // Use routing points if available
      ctx.moveTo(sourcePoint.x, sourcePoint.y);
      edge.routingPoints.forEach((point) => {
        ctx.lineTo(point.x, point.y);
      });
      ctx.lineTo(targetPoint.x, targetPoint.y);
    } else {
      // Draw curved connection
      const dx = targetPoint.x - sourcePoint.x;
      const dy = targetPoint.y - sourcePoint.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const curvature = Math.min(distance * 0.3, 50);

      ctx.moveTo(sourcePoint.x, sourcePoint.y);
      ctx.bezierCurveTo(
        sourcePoint.x + dx * 0.3,
        sourcePoint.y + curvature,
        targetPoint.x - dx * 0.3,
        targetPoint.y - curvature,
        targetPoint.x,
        targetPoint.y,
      );
    }

    ctx.stroke();

    // Set stroke color for arrowhead
    ctx.strokeStyle = edgeConfig.color || "#6B7280";

    // Draw arrowhead
    this.drawArrowhead(targetPoint, sourcePoint);

    // Draw edge label if present
    if (edge.label) {
      const midPoint = {
        x: (sourcePoint.x + targetPoint.x) / 2,
        y: (sourcePoint.y + targetPoint.y) / 2,
      };
      this.drawEdgeLabel(edge.label, midPoint);
    }

    ctx.restore();
  }

  /**
   * Get WIT-specific edge type
   */
  private getWitEdgeType(edge: Edge): string {
    const elementType = edge.element_type || edge.type || "";

    if (elementType.includes("import")) return "import";
    if (elementType.includes("export")) return "export";
    if (elementType.includes("uses")) return "uses";
    if (elementType.includes("implements")) return "implements";
    if (elementType.includes("dependency")) return "dependency";
    if (elementType.includes("contains")) return "contains";
    if (elementType.includes("type-ref")) return "type-ref";

    return "dependency"; // default
  }

  /**
   * Get edge configuration
   */
  private getEdgeConfig(edgeType: string): any {
    const configs: Record<string, any> = {
      import: { style: "dashed", color: "#3B82F6" },
      export: { style: "solid", color: "#10B981" },
      uses: { style: "dotted", color: "#8B5CF6" },
      implements: { style: "solid", color: "#F59E0B" },
      dependency: { style: "dashed", color: "#6B7280" },
      contains: { style: "solid", color: "#374151" },
      "type-ref": { style: "dotted", color: "#EC4899" },
    };

    return configs[edgeType] || configs.dependency;
  }

  /**
   * Draw an arrowhead at the target point
   */
  protected drawArrowhead(
    to: { x: number; y: number },
    from: { x: number; y: number },
  ): void {
    const ctx = this.ctx;
    const headLength = 10;
    const angle = Math.atan2(to.y - from.y, to.x - from.x);

    ctx.fillStyle = ctx.strokeStyle || "#666";
    ctx.beginPath();
    ctx.moveTo(to.x, to.y);
    ctx.lineTo(
      to.x - headLength * Math.cos(angle - Math.PI / 6),
      to.y - headLength * Math.sin(angle - Math.PI / 6),
    );
    ctx.lineTo(
      to.x - headLength * Math.cos(angle + Math.PI / 6),
      to.y - headLength * Math.sin(angle + Math.PI / 6),
    );
    ctx.closePath();
    ctx.fill();
  }

  /**
   * Draw edge label
   */
  protected drawEdgeLabel(
    text: string,
    position: { x: number; y: number },
  ): void {
    const ctx = this.ctx;
    if (!ctx || !text) return;

    ctx.save();

    // Draw label background
    const padding = 4;
    ctx.font = "11px sans-serif";
    const metrics = ctx.measureText(text);
    const width = metrics.width + padding * 2;
    const height = 16;

    ctx.fillStyle = "rgba(31, 41, 55, 0.9)";
    ctx.fillRect(
      position.x - width / 2,
      position.y - height / 2,
      width,
      height,
    );

    // Draw label text
    ctx.fillStyle = "#E5E7EB";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, position.x, position.y);

    ctx.restore();
  }

  /**
   * Handle click events for expanding/collapsing nodes
   */
  protected handleClick(event: MouseEvent): void {
    const rect = (event.target as HTMLCanvasElement).getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const worldPos = this.screenToWorld(x, y);
    const clickedNode = this.getNodeAt(worldPos.x, worldPos.y);

    if (clickedNode && this.isContainerNode(this.getWitNodeType(clickedNode))) {
      // Check if click was on expansion indicator
      const bounds = this.getNodeBounds(clickedNode);
      const indicatorSize = 12;
      const indicatorX = bounds.x + bounds.width - indicatorSize - 5;
      const indicatorY = bounds.y + bounds.height - indicatorSize - 5;

      const dx = worldPos.x - (indicatorX + indicatorSize / 2);
      const dy = worldPos.y - (indicatorY + indicatorSize / 2);
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance <= indicatorSize / 2) {
        // Toggle expansion state
        if (this.expandedNodes.has(clickedNode.id)) {
          this.expandedNodes.delete(clickedNode.id);
        } else {
          this.expandedNodes.add(clickedNode.id);
        }

        // Trigger re-render
        this.render();
        return;
      }
    }

    super.handleClick(event);
  }

  /**
   * Get node at specific coordinates
   */
  private getNodeAt(x: number, y: number): Node | null {
    if (!this.currentDiagram) return null;

    const nodes = Object.values(this.currentDiagram.elements).filter((el) =>
      this.isNode(el),
    ) as Node[];

    // Check nodes in reverse order (top to bottom)
    for (let i = nodes.length - 1; i >= 0; i--) {
      const node = nodes[i];
      const bounds = this.getNodeBounds(node);

      if (
        x >= bounds.x &&
        x <= bounds.x + bounds.width &&
        y >= bounds.y &&
        y <= bounds.y + bounds.height
      ) {
        return node;
      }
    }

    return null;
  }

  /**
   * Find a node by ID
   */
  private findNode(id: string): Node | null {
    if (!this.currentDiagram) return null;
    const element = this.currentDiagram.elements[id];
    return element && this.isNode(element) ? (element as Node) : null;
  }

  /**
   * Check if an element is a node
   */
  private isNode(element: ModelElement): boolean {
    const elementType = element.element_type || element.type || "";
    return (
      !elementType.includes("edge") &&
      !elementType.includes("flow") &&
      !elementType.includes("connection")
    );
  }

  // ===== DIAGRAM MODEL INTEGRATION METHODS =====

  /**
   * Set callback for model changes
   */
  public onModelChange(callback: (model: DiagramModel) => void): void {
    this.onWitModelChange = callback;
  }

  /**
   * Convert WIT diagram to DiagramModel
   */
  public convertWitToDiagram(witDiagram: WitDiagram): DiagramModel {
    console.log(
      "WitInterfaceRenderer: Converting WIT diagram to DiagramModel...",
    );

    const diagramModel: DiagramModel = {
      id: witDiagram.id,
      diagramType: "wit-diagram",
      revision: 1,
      root: {
        id: "root",
        type: "wit-root",
        bounds: { x: 0, y: 0, width: 800, height: 600 },
      },
      elements: {},
      metadata: {
        type: "wit-diagram",
        name: witDiagram.name,
        componentName: witDiagram.componentName,
        layout: witDiagram.layout,
        viewConfig: witDiagram.viewConfig,
      } as any,
    };

    // Convert WIT elements to diagram nodes
    witDiagram.elements.forEach((witElement) => {
      const node = this.convertWitElementToNode(witElement);
      diagramModel.elements[node.id] = node;
    });

    // Convert WIT connections to diagram edges
    witDiagram.connections.forEach((witConnection) => {
      const edge = this.convertWitConnectionToEdge(witConnection);
      diagramModel.elements[edge.id] = edge;
    });

    this.witDiagramModel = diagramModel;
    console.log(
      `WitInterfaceRenderer: Converted ${witDiagram.elements.length} elements, ${witDiagram.connections.length} connections`,
    );

    return diagramModel;
  }

  /**
   * Convert DiagramModel back to WIT diagram
   */
  public convertDiagramToWit(diagramModel: DiagramModel): WitDiagram {
    console.log(
      "WitInterfaceRenderer: Converting DiagramModel to WIT diagram...",
    );

    const elements: WitElement[] = [];
    const connections: WitConnection[] = [];

    Object.values(diagramModel.elements).forEach((element) => {
      if (this.isNode(element)) {
        const witElement = this.convertNodeToWitElement(element as Node);
        elements.push(witElement);
      } else {
        const witConnection = this.convertEdgeToWitConnection(element as Edge);
        connections.push(witConnection);
      }
    });

    const metadata = diagramModel.metadata as any;
    const witDiagram: WitDiagram = {
      id: metadata?.id || `wit-diagram-${Date.now()}`,
      name: metadata?.name || "Untitled WIT Diagram",
      componentName: metadata?.componentName || "component",
      elements,
      connections,
      layout: metadata?.layout,
      viewConfig: metadata?.viewConfig || this.witViewConfig,
    };

    console.log(
      `WitInterfaceRenderer: Converted to WIT diagram with ${elements.length} elements, ${connections.length} connections`,
    );
    return witDiagram;
  }

  /**
   * Convert WIT element to diagram node
   */
  private convertWitElementToNode(witElement: WitElement): Node {
    return {
      id: witElement.id,
      element_type: `wit-${witElement.type}`,
      type: `wit-${witElement.type}`,
      label: witElement.name,
      position: witElement.position || { x: 0, y: 0 },
      size: witElement.size || this.getDefaultSizeForType(witElement.type),
      bounds: {
        x: witElement.position?.x || 0,
        y: witElement.position?.y || 0,
        width:
          witElement.size?.width ||
          this.getDefaultSizeForType(witElement.type).width,
        height:
          witElement.size?.height ||
          this.getDefaultSizeForType(witElement.type).height,
      },
      properties: {
        name: witElement.name,
        witType: witElement.type,
        metadata: witElement.metadata || {},
        ...this.extractTypeSpecificProperties(witElement),
      },
    };
  }

  /**
   * Convert WIT connection to diagram edge
   */
  private convertWitConnectionToEdge(witConnection: WitConnection): Edge {
    return {
      id: witConnection.id,
      element_type: `wit-${witConnection.type}`,
      type: `wit-${witConnection.type}`,
      sourceId: witConnection.source,
      targetId: witConnection.target,
      label: witConnection.label,
      properties: {
        witConnectionType: witConnection.type,
        edgeStyle: this.getEdgeStyleForType(witConnection.type),
      },
    };
  }

  /**
   * Convert diagram node back to WIT element
   */
  private convertNodeToWitElement(node: Node): WitElement {
    const witType =
      node.properties?.witType ||
      node.element_type?.replace("wit-", "") ||
      WitElementType.Interface;

    return {
      id: node.id,
      type: witType as WitElementType,
      name:
        node.label?.toString() ||
        node.properties?.name?.toString() ||
        "Unnamed",
      position: node.position,
      size: node.size,
      metadata: node.properties?.metadata || {},
    };
  }

  /**
   * Convert diagram edge back to WIT connection
   */
  private convertEdgeToWitConnection(edge: Edge): WitConnection {
    const witType =
      edge.properties?.witConnectionType ||
      edge.element_type?.replace("wit-", "") ||
      WitConnectionType.Dependency;

    return {
      id: edge.id,
      source: edge.sourceId!,
      target: edge.targetId!,
      type: witType as WitConnectionType,
      label: edge.label,
    };
  }

  /**
   * Get default size for WIT element type
   */
  private getDefaultSizeForType(type: WitElementType): {
    width: number;
    height: number;
  } {
    const sizes: Record<string, { width: number; height: number }> = {
      [WitElementType.Package]: { width: 200, height: 150 },
      [WitElementType.World]: { width: 180, height: 120 },
      [WitElementType.Interface]: { width: 160, height: 100 },
      [WitElementType.Function]: { width: 140, height: 60 },
      [WitElementType.Type]: { width: 120, height: 50 },
      [WitElementType.Resource]: { width: 150, height: 80 },
      [WitElementType.Import]: { width: 130, height: 70 },
      [WitElementType.Export]: { width: 130, height: 70 },
      // Additional WIT types
      record: { width: 140, height: 100 },
      variant: { width: 140, height: 100 },
      enum: { width: 120, height: 80 },
      flags: { width: 120, height: 80 },
      primitive: { width: 100, height: 50 },
      list: { width: 120, height: 60 },
      tuple: { width: 120, height: 60 },
      option: { width: 110, height: 50 },
      result: { width: 110, height: 50 },
    };
    return sizes[type] || { width: 120, height: 60 };
  }

  /**
   * Extract type-specific properties from WIT element
   */
  private extractTypeSpecificProperties(
    witElement: WitElement,
  ): Record<string, any> {
    const props: Record<string, any> = {};

    switch (witElement.type) {
      case WitElementType.Package:
        props.version = witElement.metadata?.version || "1.0.0";
        props.worlds = witElement.metadata?.worlds || [];
        props.interfaces = witElement.metadata?.interfaces || [];
        break;
      case WitElementType.World:
        props.imports = witElement.metadata?.imports || [];
        props.exports = witElement.metadata?.exports || [];
        props.components = witElement.metadata?.components || [];
        break;
      case WitElementType.Interface:
        props.interfaceType = witElement.metadata?.interfaceType || "export";
        props.functions = witElement.metadata?.functions || [];
        props.types = witElement.metadata?.types || [];
        props.resources = witElement.metadata?.resources || [];
        break;
      case WitElementType.Function:
        props.signature = witElement.metadata?.signature || "";
        props.parameters = witElement.metadata?.parameters || [];
        props.returnType = witElement.metadata?.returnType;
        props.isAsync = witElement.metadata?.isAsync || false;
        break;
      case WitElementType.Type:
        props.typeKind = witElement.metadata?.kind || "record";
        props.fields = witElement.metadata?.fields || [];
        props.variants = witElement.metadata?.variants || [];
        props.values = witElement.metadata?.values || [];
        break;
      case WitElementType.Resource:
        props.methods = witElement.metadata?.methods || [];
        props.constructor = witElement.metadata?.constructor || undefined;
        props.destructor = witElement.metadata?.destructor;
        props.statics = witElement.metadata?.statics || [];
        break;
      case WitElementType.Import:
        props.source = witElement.metadata?.source || "";
        props.namespace = witElement.metadata?.namespace || "";
        props.items = witElement.metadata?.items || [];
        break;
      case WitElementType.Export:
        props.target = witElement.metadata?.target || "";
        props.visibility = witElement.metadata?.visibility || "public";
        props.items = witElement.metadata?.items || [];
        break;
    }

    return props;
  }

  /**
   * Get edge style for connection type
   */
  private getEdgeStyleForType(type: WitConnectionType): string {
    const styles: Record<string, string> = {
      [WitConnectionType.Import]: "dashed",
      [WitConnectionType.Export]: "solid",
      [WitConnectionType.Uses]: "dotted",
      [WitConnectionType.Implements]: "solid",
      [WitConnectionType.Contains]: "solid",
      [WitConnectionType.TypeReference]: "dotted",
      [WitConnectionType.Dependency]: "dashed",
    };
    return styles[type] || "solid";
  }

  /**
   * Override setCanvas to setup hover event listeners
   */
  public setCanvas(canvas: HTMLCanvasElement): void {
    super.setCanvas(canvas);
    this.setupCanvasEventListeners();
    this.setupHoverEventListeners();
  }

  /**
   * Load WIT diagram and render it
   */
  public loadWitDiagram(witDiagram: WitDiagram): void {
    console.log("WitInterfaceRenderer: Loading WIT diagram...");

    const diagramModel = this.convertWitToDiagram(witDiagram);
    this.setDiagram(diagramModel);

    // Apply view configuration
    this.applyWitViewConfig(witDiagram.viewConfig || this.witViewConfig);

    // Trigger render
    this.render();

    console.log(
      `WitInterfaceRenderer: Loaded WIT diagram "${witDiagram.name}"`,
    );
  }

  /**
   * Export current diagram as WIT diagram
   */
  public exportWitDiagram(): WitDiagram | null {
    if (!this.witDiagramModel) {
      console.warn("WitInterfaceRenderer: No WIT diagram model to export");
      return null;
    }

    return this.convertDiagramToWit(this.witDiagramModel);
  }

  /**
   * Apply WIT view configuration
   */
  private applyWitViewConfig(viewConfig: WitViewConfig): void {
    this.witViewConfig = { ...this.witViewConfig, ...viewConfig };

    // Apply visibility filters
    if (this.currentDiagram) {
      Object.values(this.currentDiagram.elements).forEach((element) => {
        if (this.isNode(element)) {
          const node = element as Node;
          const witType = node.properties?.witType;

          // Set visibility based on view config
          node.properties = node.properties || {};
          node.properties.visible = this.shouldShowElementType(String(witType));
        }
      });
    }

    // Apply expansion level
    this.applyExpansionLevel(viewConfig.expandLevel);
  }

  /**
   * Check if element type should be visible
   */
  private shouldShowElementType(witType: string): boolean {
    switch (witType) {
      case WitElementType.Package:
        return this.witViewConfig.showPackages;
      case WitElementType.World:
        return this.witViewConfig.showWorlds;
      case WitElementType.Interface:
        return this.witViewConfig.showInterfaces;
      case WitElementType.Type:
        return this.witViewConfig.showTypes;
      case WitElementType.Function:
        return this.witViewConfig.showFunctions;
      case WitElementType.Resource:
        return this.witViewConfig.showResources;
      case WitElementType.Import:
      case WitElementType.Export:
        return true; // Always show import/export elements
      default:
        return true;
    }
  }

  /**
   * Apply expansion level to nodes
   */
  private applyExpansionLevel(level: number): void {
    this.expandedNodes.clear();

    if (this.currentDiagram) {
      Object.values(this.currentDiagram.elements).forEach((element) => {
        if (this.isNode(element)) {
          const node = element as Node;
          const witType = node.properties?.witType;

          // Expand nodes based on level
          if (this.shouldExpandAtLevel(String(witType), level)) {
            this.expandedNodes.add(node.id);
          }
        }
      });
    }
  }

  /**
   * Check if element should be expanded at given level
   */
  private shouldExpandAtLevel(witType: string, level: number): boolean {
    const expansionLevels: Record<string, number> = {
      [WitElementType.Package]: 1,
      [WitElementType.World]: 2,
      [WitElementType.Interface]: 3,
      [WitElementType.Function]: 4,
      [WitElementType.Type]: 4,
      [WitElementType.Resource]: 4,
    };

    const elementLevel = expansionLevels[witType] || 0;
    return level >= elementLevel;
  }

  /**
   * Create a new WIT element in the diagram
   */
  public createWitElement(
    type: WitElementType,
    name: string,
    position: { x: number; y: number },
  ): string {
    if (!this.witDiagramModel) {
      console.warn(
        "WitInterfaceRenderer: No diagram model available for element creation",
      );
      return "";
    }

    const id = `wit-${type}-${Date.now()}`;
    const witElement: WitElement = {
      id,
      type,
      name,
      position,
      size: this.getDefaultSizeForType(type),
      metadata: {},
    };

    const node = this.convertWitElementToNode(witElement);
    this.witDiagramModel.elements[id] = node;

    // Update current diagram
    if (this.currentDiagram) {
      this.currentDiagram.elements[id] = node;
    }

    // Notify of model change
    if (this.onWitModelChange && this.witDiagramModel) {
      this.onWitModelChange(this.witDiagramModel);
    }

    this.render();
    console.log(`WitInterfaceRenderer: Created ${type} element "${name}"`);

    return id;
  }

  /**
   * Delete a WIT element from the diagram
   */
  public deleteWitElement(elementId: string): boolean {
    if (!this.witDiagramModel || !this.witDiagramModel.elements[elementId]) {
      return false;
    }

    // Clear hover state if this element is hovered
    if (this.hoveredElementId === elementId) {
      this.clearHoverState();
    }

    // Remove from diagram model
    delete this.witDiagramModel.elements[elementId];

    // Remove from current diagram
    if (this.currentDiagram) {
      delete this.currentDiagram.elements[elementId];
    }

    // Remove from expanded nodes
    this.expandedNodes.delete(elementId);

    // Remove any connections to this element
    Object.values(this.witDiagramModel.elements).forEach((element) => {
      if (!this.isNode(element)) {
        const edge = element as Edge;
        if (edge.sourceId === elementId || edge.targetId === elementId) {
          delete this.witDiagramModel!.elements[edge.id];
          if (this.currentDiagram) {
            delete this.currentDiagram.elements[edge.id];
          }
        }
      }
    });

    // Notify of model change
    if (this.onWitModelChange && this.witDiagramModel) {
      this.onWitModelChange(this.witDiagramModel);
    }

    this.render();
    console.log(`WitInterfaceRenderer: Deleted element ${elementId}`);

    return true;
  }

  /**
   * Update WIT view configuration
   */
  public updateWitViewConfig(config: Partial<WitViewConfig>): void {
    this.witViewConfig = { ...this.witViewConfig, ...config };
    this.applyWitViewConfig(this.witViewConfig);
    this.render();
    console.log("WitInterfaceRenderer: Updated view configuration");
  }

  /**
   * Get current WIT view configuration
   */
  public getWitViewConfig(): WitViewConfig {
    return { ...this.witViewConfig };
  }

  /**
   * Validate WIT diagram structure
   */
  public validateWitDiagram(): {
    isValid: boolean;
    errors: string[];
    warnings: string[];
  } {
    if (!this.witDiagramModel) {
      return {
        isValid: false,
        errors: ["No diagram model available"],
        warnings: [],
      };
    }

    const errors: string[] = [];
    const warnings: string[] = [];
    const elements = Object.values(this.witDiagramModel.elements);

    // Check for orphaned elements
    const nodes = elements.filter((el) => this.isNode(el)) as Node[];
    const edges = elements.filter((el) => !this.isNode(el)) as Edge[];

    edges.forEach((edge) => {
      const sourceExists = nodes.some((node) => node.id === edge.sourceId);
      const targetExists = nodes.some((node) => node.id === edge.targetId);

      if (!sourceExists) {
        errors.push(
          `Edge ${edge.id} references non-existent source ${edge.sourceId}`,
        );
      }
      if (!targetExists) {
        errors.push(
          `Edge ${edge.id} references non-existent target ${edge.targetId}`,
        );
      }
    });

    // Check for duplicate names within the same type
    const namesByType = new Map<string, string[]>();
    nodes.forEach((node) => {
      const witType = node.properties?.witType?.toString() || "unknown";
      const name = node.label?.toString() || "unnamed";

      if (!namesByType.has(witType)) {
        namesByType.set(witType, []);
      }

      const names = namesByType.get(witType)!;
      if (names.includes(name)) {
        warnings.push(`Duplicate ${witType} name: "${name}"`);
      } else {
        names.push(name);
      }
    });

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Handle mouse move events for hover state management with debouncing
   */
  protected handleMouseMove(event: MouseEvent): void {
    const rect = (event.target as HTMLCanvasElement).getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    // Store current mouse position
    this.lastMousePosition = { x: event.clientX, y: event.clientY };

    // Clear previous debounce timeout
    if (this.mouseMoveDebounceTimeout) {
      clearTimeout(this.mouseMoveDebounceTimeout);
    }

    // Debounce hover detection for performance
    this.mouseMoveDebounceTimeout = window.setTimeout(() => {
      this.performHoverDetection(x, y, event.clientX, event.clientY);
    }, 16); // ~60fps debouncing

    // Call parent implementation
    super.handleMouseMove(event);
  }

  /**
   * Perform hover detection and state management
   */
  private performHoverDetection(
    canvasX: number,
    canvasY: number,
    screenX: number,
    screenY: number,
  ): void {
    const worldPos = this.screenToWorld(canvasX, canvasY);

    // Get element at position
    const element = this.getNodeAt(worldPos.x, worldPos.y);
    const newHoveredId = element?.id || null;

    // Check if hover state changed
    if (newHoveredId !== this.hoveredElementId) {
      this.hoveredElementId = newHoveredId;

      if (element) {
        // Set new hovered element
        this.hoveredElement = this.convertNodeToWitElement(element);
        this.showElementTooltip(element, { x: screenX, y: screenY });
        this.highlightRelatedElements(this.hoveredElement);
      } else {
        // Clear hover state
        this.hoveredElement = null;
        this.hideElementTooltip();
        this.clearRelatedHighlights();
      }

      // Trigger re-render for visual feedback
      this.render();
    } else if (this.hoveredElement && this.elementTooltip) {
      // Update tooltip position
      this.updateTooltipPosition({ x: screenX, y: screenY });
    }
  }

  /**
   * Show element tooltip with detailed information
   */
  private showElementTooltip(
    element: Node,
    mousePos: { x: number; y: number },
  ): void {
    // Clear any existing timeout
    if (this.tooltipTimeout) {
      clearTimeout(this.tooltipTimeout);
    }

    // Create tooltip after a short delay
    this.tooltipTimeout = window.setTimeout(() => {
      if (!this.elementTooltip) {
        this.elementTooltip = this.createTooltipElement();
        document.body.appendChild(this.elementTooltip);
      }

      // Update tooltip content
      this.updateTooltipContent(element);

      // Position tooltip using stored mouse position
      this.updateTooltipPosition(this.lastMousePosition || mousePos);

      // Show tooltip
      this.elementTooltip.classList.add("visible");
    }, 300); // 300ms delay for tooltip appearance
  }

  /**
   * Hide element tooltip
   */
  private hideElementTooltip(): void {
    // Clear timeout
    if (this.tooltipTimeout) {
      clearTimeout(this.tooltipTimeout);
      this.tooltipTimeout = null;
    }

    // Hide tooltip
    if (this.elementTooltip) {
      this.elementTooltip.classList.remove("visible");
    }
  }

  /**
   * Create tooltip element
   */
  private createTooltipElement(): HTMLElement {
    const tooltip = document.createElement("div");
    tooltip.className = "wit-element-tooltip";
    tooltip.style.cssText = `
            position: fixed;
            z-index: 10000;
            background: rgba(31, 41, 55, 0.95);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 8px;
            padding: 12px;
            font-size: 12px;
            color: #E5E7EB;
            pointer-events: none;
            opacity: 0;
            transition: opacity 0.2s ease;
            max-width: 300px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
        `;

    // Add visible state style
    const style = document.createElement("style");
    style.textContent = `
            .wit-element-tooltip.visible {
                opacity: 1;
            }
            .wit-element-tooltip h4 {
                margin: 0 0 8px 0;
                font-size: 14px;
                font-weight: 600;
                color: #FFFFFF;
            }
            .wit-element-tooltip .tooltip-section {
                margin: 8px 0;
            }
            .wit-element-tooltip .tooltip-label {
                font-weight: 500;
                color: #9CA3AF;
                margin-right: 4px;
            }
            .wit-element-tooltip .tooltip-value {
                color: #E5E7EB;
            }
            .wit-element-tooltip .tooltip-icon {
                display: inline-block;
                margin-right: 4px;
            }
        `;
    document.head.appendChild(style);

    return tooltip;
  }

  /**
   * Update tooltip position based on mouse position
   */
  private updateTooltipPosition(mousePos: Position): void {
    if (!this.elementTooltip) return;

    // Get tooltip dimensions
    const tooltipRect = this.elementTooltip.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    // Calculate position with offset from cursor
    let x = mousePos.x + 15; // 15px offset from cursor
    let y = mousePos.y - 10; // slight offset above cursor

    // Adjust horizontal position if tooltip would go off-screen
    if (x + tooltipRect.width > viewportWidth) {
      x = mousePos.x - tooltipRect.width - 15; // flip to left side
    }

    // Adjust vertical position if tooltip would go off-screen
    if (y + tooltipRect.height > viewportHeight) {
      y = mousePos.y - tooltipRect.height - 15; // move above cursor
    }

    // Ensure tooltip doesn't go off top or left edges
    x = Math.max(10, x);
    y = Math.max(10, y);

    // Apply position
    this.elementTooltip.style.left = `${x}px`;
    this.elementTooltip.style.top = `${y}px`;
  }

  /**
   * Update tooltip content based on element
   */
  private updateTooltipContent(element: Node): void {
    if (!this.elementTooltip) return;

    const witType = this.getWitNodeType(element);
    const icon = this.getNodeIcon(witType);
    const properties: WitElementProperties = element.properties || {};

    let content = `<h4><span class="tooltip-icon">${icon}</span>${
      element.label || "Unnamed"
    }</h4>`;

    // Add type-specific information
    content += '<div class="tooltip-section">';
    content += `<span class="tooltip-label">Type:</span><span class="tooltip-value">${witType}</span><br/>`;

    switch (witType) {
      case "interface":
        if (properties.interfaceType) {
          content += `<span class="tooltip-label">Interface Type:</span><span class="tooltip-value">${properties.interfaceType}</span><br/>`;
        }
        if (properties.functions?.length > 0) {
          content += `<span class="tooltip-label">Functions:</span><span class="tooltip-value">${properties.functions.length}</span><br/>`;
        }
        if (properties.types?.length > 0) {
          content += `<span class="tooltip-label">Types:</span><span class="tooltip-value">${properties.types.length}</span><br/>`;
        }
        if (properties.resources?.length > 0) {
          content += `<span class="tooltip-label">Resources:</span><span class="tooltip-value">${properties.resources.length}</span><br/>`;
        }
        break;

      case "function":
        if (properties.signature) {
          content += `<span class="tooltip-label">Signature:</span><span class="tooltip-value">${properties.signature}</span><br/>`;
        }
        if (properties.isAsync) {
          content += `<span class="tooltip-label">Async:</span><span class="tooltip-value">Yes</span><br/>`;
        }
        break;

      case "resource":
        if (properties.methods?.length > 0) {
          content += `<span class="tooltip-label">Methods:</span><span class="tooltip-value">${properties.methods.length}</span><br/>`;
        }
        break;

      case "package":
        if (properties.version) {
          content += `<span class="tooltip-label">Version:</span><span class="tooltip-value">${properties.version}</span><br/>`;
        }
        if (properties.worlds?.length > 0) {
          content += `<span class="tooltip-label">Worlds:</span><span class="tooltip-value">${properties.worlds.length}</span><br/>`;
        }
        break;

      case "world":
        if (properties.imports?.length > 0) {
          content += `<span class="tooltip-label">Imports:</span><span class="tooltip-value">${properties.imports.length}</span><br/>`;
        }
        if (properties.exports?.length > 0) {
          content += `<span class="tooltip-label">Exports:</span><span class="tooltip-value">${properties.exports.length}</span><br/>`;
        }
        break;
    }

    content += "</div>";

    // Add metadata if available
    if (properties.metadata && Object.keys(properties.metadata).length > 0) {
      content += '<div class="tooltip-section">';
      content += '<span class="tooltip-label">Metadata:</span><br/>';
      Object.entries(properties.metadata).forEach(([key, value]) => {
        content += `<span class="tooltip-label" style="margin-left: 12px;">${key}:</span><span class="tooltip-value">${value}</span><br/>`;
      });
      content += "</div>";
    }

    this.elementTooltip.innerHTML = content;
  }

  /**
   * Update tooltip position
   */
  private updateTooltipPosition(mousePos: { x: number; y: number }): void {
    if (!this.elementTooltip) return;

    const tooltip = this.elementTooltip;
    const padding = 10;

    // Calculate position
    let left = mousePos.x + padding;
    let top = mousePos.y + padding;

    // Get tooltip dimensions
    const rect = tooltip.getBoundingClientRect();
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;

    // Adjust if tooltip would go off-screen
    if (left + rect.width > windowWidth) {
      left = mousePos.x - rect.width - padding;
    }
    if (top + rect.height > windowHeight) {
      top = mousePos.y - rect.height - padding;
    }

    // Apply position
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
  }

  /**
   * Initialize and show the WIT icon legend
   */
  public initializeIconLegend(container?: HTMLElement): void {
    if (this.iconLegend) {
      this.destroyIconLegend();
    }

    // Only initialize legend if _showLegend is true
    if (!this._showLegend) {
      return;
    }

    this.iconLegend = container
      ? WitIconLegend.createEmbeddedLegend({
          collapsible: true,
          collapsed: false,
          showDescriptions: true,
          filterEnabled: true,
        })
      : WitIconLegend.createFloatingLegend({
          collapsible: true,
          collapsed: false,
          showDescriptions: true,
          filterEnabled: true,
        });

    if (container) {
      this._legendContainer = container;
      container.appendChild(this.iconLegend.getElement());
    } else {
      this._legendContainer = document.body;
      document.body.appendChild(this.iconLegend.getElement());
    }

    // Set up legend event listeners
    this.iconLegend
      .getElement()
      .addEventListener("legend-item-click", (e: CustomEvent) => {
        const { type } = e.detail;
        this.highlightElementsByType(type);
      });

    console.log("WitInterfaceRenderer: Icon legend initialized");
  }

  /**
   * Clear all hover state
   */
  private clearHoverState(): void {
    this.hoveredElement = null;
    this.hoveredElementId = null;
    this.hideElementTooltip();
    this.clearRelatedHighlights();

    // Trigger re-render to remove visual effects
    this.render();
  }

  /**
   * Setup canvas event listeners for hover management
   */
  public setupCanvasEventListeners(): void {
    if (this.canvas) {
      this.canvas.addEventListener(
        "mouseleave",
        this.handleMouseLeave.bind(this),
      );

      // Add keyboard navigation support for accessibility
      this.canvas.addEventListener("keydown", this.handleKeyDown.bind(this));

      // Make canvas focusable for keyboard navigation
      this.canvas.setAttribute("tabindex", "0");
      this.canvas.setAttribute("role", "application");
      this.canvas.setAttribute("aria-label", "WIT Interface Diagram");
    }
  }

  /**
   * Toggle the visibility of the icon legend
   */
  public toggleIconLegend(): void {
    if (!this.iconLegend) {
      this.initializeIconLegend();
    } else {
      this.iconLegend.toggle();
    }
  }

  /**
   * Show the icon legend
   */
  public showIconLegend(): void {
    if (!this.iconLegend) {
      this.initializeIconLegend();
    } else {
      this.iconLegend.expand();
    }
  }

  /**
   * Hide the icon legend
   */
  public hideIconLegend(): void {
    if (this.iconLegend) {
      this.iconLegend.collapse();
    }
  }

  /**
   * Destroy the icon legend
   */
  public destroyIconLegend(): void {
    if (this.iconLegend) {
      this.iconLegend.destroy();
      this.iconLegend = null;
      this._legendContainer = null;
    }
  }

  /**
   * Update legend to highlight specific element type
   */
  public highlightLegendType(type: WitElementType | null): void {
    if (this.iconLegend) {
      this.iconLegend.highlightType(type);
    }
  }

  /**
   * Highlight all elements of a specific type in the diagram
   */
  public highlightElementsByType(type: WitElementType): void {
    if (!this.witDiagramModel) return;

    // Clear existing highlights
    this.clearHighlights();

    // Find and highlight elements of the specified type
    Object.values(this.witDiagramModel.elements).forEach((element) => {
      const node = element as Node;
      if (node.metadata?.witType === type) {
        this.highlightElement(node.id, true);
      }
    });

    // Update legend highlight
    this.highlightLegendType(type);

    // Re-render to show highlights
    this.render();

    console.log(`WitInterfaceRenderer: Highlighted ${type} elements`);
  }

  /**
   * Clear all element highlights
   */
  public clearHighlights(): void {
    if (!this.witDiagramModel) return;

    Object.values(this.witDiagramModel.elements).forEach((element) => {
      const node = element as Node;
      if (node.metadata?.highlighted) {
        node.metadata.highlighted = false;
      }
    });

    // Clear legend highlight
    this.highlightLegendType(null);

    // Re-render to remove highlights
    this.render();
  }

  /**
   * Highlight/unhighlight a specific element
   */
  public highlightElement(elementId: string, highlight: boolean = true): void {
    if (!this.witDiagramModel || !this.witDiagramModel.elements[elementId]) {
      return;
    }

    const element = this.witDiagramModel.elements[elementId] as Node;
    if (!element.metadata) {
      element.metadata = {};
    }
    element.metadata.highlighted = highlight;
  }

  /**
   * Get the icon legend instance
   */
  public getIconLegend(): WitIconLegend | null {
    return this.iconLegend;
  }

  /**
   * Check if the icon legend is visible
   */
  public isIconLegendVisible(): boolean {
    return (
      this._showLegend &&
      this.iconLegend !== null &&
      !this.iconLegend.getElement().classList.contains("collapsed")
    );
  }

  /**
   * Toggle legend visibility
   */
  public toggleLegendVisibility(): void {
    this._showLegend = !this._showLegend;

    if (this._showLegend) {
      // Show legend - reinitialize if needed
      if (!this.iconLegend) {
        this.initializeIconLegend(this._legendContainer || undefined);
      } else {
        this.iconLegend.getElement().style.display = "block";
      }
    } else {
      // Hide legend
      if (this.iconLegend) {
        this.iconLegend.getElement().style.display = "none";
      }
    }
  }

  /**
   * Set legend visibility
   */
  public setLegendVisibility(visible: boolean): void {
    if (this._showLegend !== visible) {
      this.toggleLegendVisibility();
    }
  }

  /**
   * Create a standalone WIT element icon
   */
  public static createElementIcon(
    type: WitElementType,
    options?: Partial<
      import("./components/WitElementIcon.js").WitElementIconOptions
    >,
  ): WitElementIcon {
    return WitElementIcon.createIcon(type, options);
  }

  /**
   * Get all available WIT element types for legend
   */
  public static getAvailableElementTypes(): WitElementType[] {
    return WitElementIcon.getAvailableTypes() as WitElementType[];
  }

  /**
   * Enhanced render method that considers highlighted elements
   */
  protected renderNodeWithHighlight(
    ctx: CanvasRenderingContext2D,
    node: Node,
  ): void {
    const isHighlighted = node.metadata?.highlighted === true;

    if (isHighlighted) {
      // Draw highlight background
      const padding = 8;
      ctx.save();
      ctx.fillStyle = "rgba(101, 79, 240, 0.2)"; // Accent color with transparency
      ctx.strokeStyle = "rgba(101, 79, 240, 0.8)";
      ctx.lineWidth = 2;

      ctx.fillRect(
        node.position.x - padding,
        node.position.y - padding,
        node.size.width + padding * 2,
        node.size.height + padding * 2,
      );

      ctx.strokeRect(
        node.position.x - padding,
        node.position.y - padding,
        node.size.width + padding * 2,
        node.size.height + padding * 2,
      );

      ctx.restore();
    }

    // Call the original node rendering
    this.renderNodeWithContext(ctx, node);
  }

  /**
   * Setup hover-specific event listeners
   */
  private setupHoverEventListeners(): void {
    if (!this.canvas) return;

    // Mouse move with debouncing for performance
    this.canvas.addEventListener(
      "mousemove",
      this.handleMouseMoveInternal.bind(this),
    );
    this.canvas.addEventListener(
      "mouseleave",
      this.handleMouseLeave.bind(this),
    );

    // Keyboard navigation for accessibility
    this.canvas.addEventListener("keydown", this.handleKeyDown.bind(this));
    this.canvas.setAttribute("tabindex", "0"); // Make canvas focusable
  }

  /**
   * Handle mouse move events with debouncing
   */
  private handleMouseMoveInternal(event: MouseEvent): void {
    if (!this.canvas) return;

    const rect = this.canvas.getBoundingClientRect();
    const canvasX = event.clientX - rect.left;
    const canvasY = event.clientY - rect.top;
    const screenX = event.clientX;
    const screenY = event.clientY;

    // Store mouse position
    this.lastMousePosition = { x: screenX, y: screenY };

    // Debounce hover detection for performance (~60fps)
    if (this.mouseMoveDebounceTimeout) {
      clearTimeout(this.mouseMoveDebounceTimeout);
    }

    this.mouseMoveDebounceTimeout = window.setTimeout(() => {
      this.performHoverDetectionInternal(canvasX, canvasY, screenX, screenY);
    }, 16); // ~60fps
  }

  /**
   * Perform hover detection on canvas elements
   */
  private performHoverDetectionInternal(
    canvasX: number,
    canvasY: number,
    screenX: number,
    screenY: number,
  ): void {
    if (!this.witDiagramModel) return;

    let hoveredElementId: string | null = null;

    // Find element under mouse cursor
    Object.values(this.witDiagramModel.elements).forEach((element) => {
      const node = element as Node;
      if (this.isPointInElement(canvasX, canvasY, node)) {
        hoveredElementId = node.id;
      }
    });

    // Update hover state if changed
    if (hoveredElementId !== this.hoveredElementId) {
      this.setHoverState(hoveredElementId, { x: screenX, y: screenY });
    } else if (hoveredElementId && this.elementTooltip) {
      // Update tooltip position if still hovering same element
      this.updateTooltipPosition({ x: screenX, y: screenY });
    }
  }

  /**
   * Check if a point is within an element's bounds
   */
  private isPointInElement(x: number, y: number, node: Node): boolean {
    return (
      x >= node.position.x &&
      x <= node.position.x + node.size.width &&
      y >= node.position.y &&
      y <= node.position.y + node.size.height
    );
  }

  /**
   * Handle mouse leave events
   */
  private handleMouseLeave(_event: MouseEvent): void {
    this.setHoverState(null);
    this.lastMousePosition = null;
  }

  /**
   * Handle keyboard navigation for accessibility
   */
  private handleKeyDown(event: KeyboardEvent): void {
    if (!this.witDiagramModel) return;

    const elements = Object.values(this.witDiagramModel.elements) as Node[];
    if (elements.length === 0) return;

    let currentIndex = this.hoveredElementId
      ? elements.findIndex((el) => el.id === this.hoveredElementId)
      : -1;

    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        event.preventDefault();
        currentIndex = (currentIndex + 1) % elements.length;
        this.setHoverState(elements[currentIndex].id);
        break;

      case "ArrowLeft":
      case "ArrowUp":
        event.preventDefault();
        currentIndex =
          currentIndex <= 0 ? elements.length - 1 : currentIndex - 1;
        this.setHoverState(elements[currentIndex].id);
        break;

      case "Home":
        event.preventDefault();
        this.setHoverState(elements[0].id);
        break;

      case "End":
        event.preventDefault();
        this.setHoverState(elements[elements.length - 1].id);
        break;

      case "Escape":
        event.preventDefault();
        this.setHoverState(null);
        break;

      case "Enter":
      case " ":
        event.preventDefault();
        if (this.hoveredElementId) {
          // Trigger element interaction
          this.canvas?.dispatchEvent(
            new CustomEvent("element-interact", {
              detail: { elementId: this.hoveredElementId },
            }),
          );
        }
        break;
    }
  }

  /**
   * Set hover state for an element
   */
  public setHoverState(
    elementId: string | null,
    mousePos?: { x: number; y: number },
  ): void {
    const previousHoveredId = this.hoveredElementId;

    // Clear previous hover state
    if (previousHoveredId && previousHoveredId !== elementId) {
      this.clearElementHover(previousHoveredId);
    }

    this.hoveredElementId = elementId;

    if (elementId && this.witDiagramModel?.elements[elementId]) {
      const element = this.witDiagramModel.elements[elementId] as Node;
      this.applyHoverEffects(element);
      this.highlightRelatedElements(element);

      // Show tooltip with delay
      if (mousePos) {
        this.showElementTooltipInternal(element, mousePos);
      }
    } else {
      this.clearAllHoverEffects();
    }

    // Re-render to show changes
    this.render();
  }

  /**
   * Apply visual hover effects to an element
   */
  private applyHoverEffects(element: Node): void {
    if (!element.metadata) element.metadata = {};
    element.metadata.hovered = true;
    element.metadata.originalStyles = element.metadata.originalStyles || {};

    // Store original styles if not already stored
    const witType = element.metadata.witType as WitElementType;
    if (witType && !element.metadata.originalStyles.backgroundColor) {
      const visualStyle = WIT_VISUAL_STYLES[witType];
      element.metadata.originalStyles = {
        backgroundColor: visualStyle.backgroundColor,
        borderColor: visualStyle.borderColor,
        textColor: visualStyle.textColor,
      };
    }

    // Apply hover effects
    element.metadata.hoverEffects = {
      backgroundColor: this.brightenColor(
        element.metadata.originalStyles.backgroundColor || "#1C2333",
        0.15,
      ),
      borderColor: "#00FF88", // Green border for hover
      borderWidth: 3,
      shadow: "rgba(0, 255, 136, 0.4)",
      shadowBlur: 8,
    };
  }

  /**
   * Clear hover effects from an element
   */
  private clearElementHover(elementId: string): void {
    if (!this.witDiagramModel?.elements[elementId]) return;

    const element = this.witDiagramModel.elements[elementId] as Node;
    if (element.metadata) {
      element.metadata.hovered = false;
      delete element.metadata.hoverEffects;
    }
  }

  /**
   * Clear all hover effects and related highlights
   */
  private clearAllHoverEffects(): void {
    // Clear main hover effect
    if (this.hoveredElementId) {
      this.clearElementHover(this.hoveredElementId);
    }

    // Clear related element highlights
    this.clearRelatedHighlights();

    // Hide tooltip
    this.hideTooltip();
  }

  /**
   * Highlight elements related to the hovered element
   */
  private highlightRelatedElements(element: Node): void {
    this.clearRelatedHighlights();

    if (!element.metadata?.witType) return;

    // Find related elements based on WIT relationships
    Object.values(this.witDiagramModel?.elements || {}).forEach(
      (otherElement) => {
        const otherNode = otherElement as Node;
        if (otherNode.id === element.id) return;

        const isRelated = this.areElementsRelated(element, otherNode);
        if (isRelated) {
          this.relatedElements.add(otherNode.id);

          // Apply related element highlight
          if (!otherNode.metadata) otherNode.metadata = {};
          otherNode.metadata.relatedHighlight = {
            borderColor: "#4A9EFF", // Blue border for related elements
            borderWidth: 2,
            borderStyle: "dashed",
          };
        }
      },
    );
  }

  /**
   * Check if two elements are related in WIT context
   */
  private areElementsRelated(element1: Node, element2: Node): boolean {
    const type1 = element1.metadata?.witType as WitElementType;
    const type2 = element2.metadata?.witType as WitElementType;

    if (!type1 || !type2) return false;

    // Define WIT relationship rules
    const relationships: Record<WitElementType, WitElementType[]> = {
      package: ["world", "interface"],
      world: ["interface", "import", "export"],
      interface: ["function", "resource", "record", "variant"],
      function: ["record", "variant", "primitive"],
      record: ["primitive", "list", "option"],
      variant: ["primitive", "record"],
      resource: ["function"],
      import: ["interface", "function"],
      export: ["interface", "function"],
      primitive: [],
      list: ["primitive", "record"],
      tuple: ["primitive"],
      option: ["primitive", "record"],
      result: ["primitive", "record"],
      enum: [],
      flags: [],
    };

    return (
      relationships[type1]?.includes(type2) ||
      relationships[type2]?.includes(type1) ||
      false
    );
  }

  /**
   * Clear highlights from related elements
   */
  private clearRelatedHighlights(): void {
    this.relatedElements.forEach((elementId) => {
      const element = this.witDiagramModel?.elements[elementId] as Node;
      if (element?.metadata) {
        const metadata = element.metadata as WitNodeMetadata;
        delete metadata.relatedHighlight;
      }
    });
    this.relatedElements.clear();
  }

  /**
   * Show tooltip for an element
   */
  private showElementTooltipInternal(
    element: Node,
    mousePos: { x: number; y: number },
  ): void {
    // Clear existing tooltip timeout
    if (this.tooltipTimeout) {
      clearTimeout(this.tooltipTimeout);
    }

    // Show tooltip with delay
    this.tooltipTimeout = window.setTimeout(() => {
      this.createTooltipElementInternal();
      this.updateTooltipContentInternal(element);
      this.updateTooltipPositionInternal(mousePos);

      if (this.elementTooltip) {
        this.elementTooltip.style.display = "block";
        this.elementTooltip.style.opacity = "1";
      }
    }, 300); // 300ms delay
  }

  /**
   * Create tooltip DOM element
   */
  private createTooltipElementInternal(): void {
    if (this.elementTooltip) return;

    this.elementTooltip = document.createElement("div");
    this.elementTooltip.className = "wit-element-tooltip";
    this.elementTooltip.style.cssText = `
            position: fixed;
            background: var(--bg-primary, #0D1117);
            border: 1px solid var(--border-color, #2A3441);
            border-radius: 6px;
            padding: 12px;
            box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
            z-index: 10001;
            max-width: 300px;
            font-size: 13px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            opacity: 0;
            transform: translateY(-8px);
            transition: all 0.2s ease;
            pointer-events: none;
            display: none;
        `;

    document.body.appendChild(this.elementTooltip);
  }

  /**
   * Update tooltip content for an element
   */
  private updateTooltipContentInternal(element: Node): void {
    if (!this.elementTooltip) return;

    const witType = (element.metadata?.witType as WitElementType) || "unknown";
    const icon = WIT_ICONS[witType] || "❓";
    const name = element.label || element.id;

    // Get type-specific information
    const typeInfo = this.getElementTypeInfo(element);

    this.elementTooltip.innerHTML = `
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px; font-weight: 600; color: var(--text-primary, #E6EDF3);">
                <span style="font-size: 16px;">${icon}</span>
                <span>${name}</span>
            </div>
            <div style="color: var(--text-secondary, #7D8590); margin-bottom: 6px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">
                ${witType}
            </div>
            ${
              typeInfo
                ? `
                <div style="color: var(--text-secondary, #7D8590); line-height: 1.4;">
                    ${typeInfo}
                </div>
            `
                : ""
            }
        `;
  }

  /**
   * Get type-specific information for tooltip
   */
  private getElementTypeInfo(element: Node): string {
    const metadata = (element.metadata as WitNodeMetadata) || {};
    const witType = metadata.witType as WitElementType;

    switch (witType) {
      case WitElementType.Interface:
        const funcCount = (metadata as any).functionsCount || 0;
        const typeCount = (metadata as any).typesCount || 0;
        return `${funcCount} functions, ${typeCount} types`;

      case WitElementType.Function:
        const params = (metadata as any).parameterCount || 0;
        const returns = (metadata as any).returnCount || 0;
        return `${params} parameters, ${returns} return values`;

      case WitElementType.Record:
        const fields = (metadata as any).fieldsCount || 0;
        return `${fields} fields`;

      case WitElementType.Variant:
        const cases = (metadata as any).casesCount || 0;
        return `${cases} variant cases`;

      case WitElementType.Resource:
        const methods = (metadata as any).methodsCount || 0;
        return `${methods} methods`;

      case WitElementType.World:
        const imports = (metadata as any).importsCount || 0;
        const exports = (metadata as any).exportsCount || 0;
        return `${imports} imports, ${exports} exports`;

      default:
        return (metadata as any).description || "WIT element";
    }
  }

  /**
   * Update tooltip position
   */
  private updateTooltipPositionInternal(mousePos: {
    x: number;
    y: number;
  }): void {
    if (!this.elementTooltip) return;

    const tooltip = this.elementTooltip;
    const tooltipRect = tooltip.getBoundingClientRect();

    let left = mousePos.x + 12;
    let top = mousePos.y - tooltipRect.height - 12;

    // Adjust if tooltip goes off screen
    if (left + tooltipRect.width > window.innerWidth - 12) {
      left = mousePos.x - tooltipRect.width - 12;
    }

    if (top < 12) {
      top = mousePos.y + 12;
    }

    if (left < 12) {
      left = 12;
    }

    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
  }

  /**
   * Hide tooltip
   */
  private hideTooltip(): void {
    if (this.tooltipTimeout) {
      clearTimeout(this.tooltipTimeout);
      this.tooltipTimeout = null;
    }

    if (this.elementTooltip) {
      this.elementTooltip.style.opacity = "0";
      this.elementTooltip.style.transform = "translateY(-8px)";

      setTimeout(() => {
        if (this.elementTooltip) {
          this.elementTooltip.style.display = "none";
        }
      }, 200);
    }
  }

  /**
   * Brighten a color by a factor
   */
  private brightenColor(color: string, factor: number): string {
    // Handle CSS variables
    if (color.startsWith("var(")) {
      return color;
    }

    // Handle hex colors
    if (color.startsWith("#")) {
      const hex = color.slice(1);
      const num = parseInt(hex, 16);
      const r = Math.min(255, Math.floor((num >> 16) + factor * 255));
      const g = Math.min(255, Math.floor(((num >> 8) & 0x00ff) + factor * 255));
      const b = Math.min(255, Math.floor((num & 0x0000ff) + factor * 255));
      return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
    }

    return color;
  }

  /**
   * Enhanced render method that considers hover effects
   */
  protected renderNodeWithContext(
    ctx: CanvasRenderingContext2D,
    node: Node,
  ): void {
    const metadata = node.metadata as WitNodeMetadata;
    const isHovered = metadata?.hovered === true;
    const hasRelatedHighlight = (metadata as any)?.relatedHighlight;

    // Apply hover effects
    if (isHovered && (metadata as any)?.hoverEffects) {
      const effects = (metadata as any).hoverEffects;

      ctx.save();

      // Draw hover glow
      if (effects.shadow && effects.shadowBlur) {
        ctx.shadowColor = effects.shadow;
        ctx.shadowBlur = effects.shadowBlur;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
      }

      // Draw hover background
      ctx.fillStyle =
        effects.backgroundColor ||
        (metadata as any)?.originalStyles?.backgroundColor ||
        "#1C2333";
      ctx.fillRect(
        node.position?.x || 0,
        node.position?.y || 0,
        node.size?.width || 0,
        node.size?.height || 0,
      );

      // Draw hover border
      if (effects.borderColor && effects.borderWidth) {
        ctx.strokeStyle = effects.borderColor;
        ctx.lineWidth = effects.borderWidth;
        ctx.strokeRect(
          node.position?.x || 0,
          node.position?.y || 0,
          node.size?.width || 0,
          node.size?.height || 0,
        );
      }

      ctx.restore();
    }

    // Apply related element highlight
    if (hasRelatedHighlight) {
      ctx.save();

      if (hasRelatedHighlight.borderStyle === "dashed") {
        ctx.setLineDash([5, 5]);
      }

      ctx.strokeStyle = hasRelatedHighlight.borderColor || "#4A9EFF";
      ctx.lineWidth = hasRelatedHighlight.borderWidth || 2;
      ctx.strokeRect(
        node.position?.x || 0,
        node.position?.y || 0,
        node.size?.width || 0,
        node.size?.height || 0,
      );

      ctx.restore();
    }

    // Call parent rendering for the actual node content
    super.renderNode(ctx, node);
  }

  /**
   * Get the currently hovered element
   */
  public getHoveredElement(): Node | null {
    if (!this.hoveredElementId || !this.witDiagramModel) return null;
    return (
      (this.witDiagramModel.elements[this.hoveredElementId] as Node) || null
    );
  }

  /**
   * Get the currently hovered element ID
   */
  public getHoveredElementId(): string | null {
    return this.hoveredElementId;
  }

  /**
   * Check if a specific element is currently hovered
   */
  public isElementHovered(elementId: string): boolean {
    return this.hoveredElementId === elementId;
  }

  /**
   * Enhanced destroy method with hover state cleanup
   */
  public destroy(): void {
    // Clear timeouts
    if (this.tooltipTimeout) {
      clearTimeout(this.tooltipTimeout);
    }
    if (this.mouseMoveDebounceTimeout) {
      clearTimeout(this.mouseMoveDebounceTimeout);
    }

    // Remove tooltip
    if (this.elementTooltip) {
      this.elementTooltip.remove();
      this.elementTooltip = null;
    }

    // Clear hover state
    this.hoveredElementId = null;
    this.relatedElements.clear();
    this.lastMousePosition = null;

    // Clear icon legend
    this.destroyIconLegend();

    // Remove event listeners if canvas exists
    if (this.canvasElement) {
      this.canvasElement.removeEventListener(
        "mousemove",
        this.handleMouseMoveInternal.bind(this),
      );
      this.canvasElement.removeEventListener(
        "mouseleave",
        this.handleMouseLeave.bind(this),
      );
      this.canvasElement.removeEventListener(
        "keydown",
        this.handleKeyDown.bind(this),
      );
    }

    // Call parent destroy
    super.destroy?.();
  }
}
