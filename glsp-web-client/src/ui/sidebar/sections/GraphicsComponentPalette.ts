import {
  GRAPHICS_NODE_TYPES,
  GraphicsNodeType,
} from "../../../graphics/GraphicsNodeTypes.js";
import { AnimatedButton } from "../../../animation/index.js";

export interface SidebarSection {
  id: string;
  title: string;
  icon: string;
  collapsible: boolean;
  collapsed: boolean;
  order: number;
  content: HTMLElement;
}

export interface GraphicsComponentPaletteOptions {
  onGraphicsNodeCreate?: (
    nodeType: GraphicsNodeType,
    position: { x: number; y: number },
  ) => void;
  onCategoryFilter?: (category: string) => void;
  showCategories?: boolean;
  showPreview?: boolean;
}

export class GraphicsComponentPalette {
  private options: GraphicsComponentPaletteOptions;
  private selectedCategory: string = "all";
  private draggedNodeType: GraphicsNodeType | null = null;

  constructor(options: GraphicsComponentPaletteOptions = {}) {
    this.options = {
      showCategories: true,
      showPreview: true,
      ...options,
    };
  }

  public createSection(): SidebarSection {
    const content = this.createPaletteContent();

    return {
      id: "graphics-palette",
      title: "Graphics Components",
      icon: "🎨",
      collapsible: true,
      collapsed: false,
      order: 2.5, // After toolbox, before properties
      content,
    };
  }

  private createPaletteContent(): HTMLElement {
    const container = document.createElement("div");
    container.className = "graphics-palette-container";
    container.style.cssText = `
            display: flex;
            flex-direction: column;
            gap: 12px;
            padding: 8px 0;
        `;

    // Add category filter if enabled
    if (this.options.showCategories) {
      const categoryFilter = this.createCategoryFilter();
      container.appendChild(categoryFilter);
    }

    // Add graphics components grid
    const componentsGrid = this.createComponentsGrid();
    container.appendChild(componentsGrid);

    // Add preview area if enabled
    if (this.options.showPreview) {
      const previewArea = this.createPreviewArea();
      container.appendChild(previewArea);
    }

    return container;
  }

  private createCategoryFilter(): HTMLElement {
    const filterContainer = document.createElement("div");
    filterContainer.className = "graphics-category-filter";
    filterContainer.style.cssText = `
            display: flex;
            flex-wrap: wrap;
            gap: 4px;
            margin-bottom: 8px;
        `;

    // Get unique categories
    const categories = [
      "all",
      ...Array.from(new Set(GRAPHICS_NODE_TYPES.map((type) => type.category))),
    ];

    categories.forEach((category) => {
      const button = document.createElement("button");
      button.className = `category-filter-btn ${
        category === this.selectedCategory ? "active" : ""
      }`;
      button.textContent = this.getCategoryDisplayName(category);
      button.style.cssText = `
                padding: 4px 8px;
                border: 1px solid var(--border);
                border-radius: var(--radius-sm);
                background: ${
                  category === this.selectedCategory
                    ? "var(--accent-wasm)"
                    : "var(--bg-secondary)"
                };
                color: ${
                  category === this.selectedCategory
                    ? "white"
                    : "var(--text-secondary)"
                };
                font-size: 11px;
                cursor: pointer;
                transition: all 0.2s ease;
            `;

      // Enhance button with animations
      this.enhanceButton(button as HTMLButtonElement, "category");

      button.addEventListener("click", () => {
        this.setSelectedCategory(category);
        this.updateCategoryButtons(filterContainer);
        this.updateComponentsGrid();
        this.options.onCategoryFilter?.(category);
      });

      button.addEventListener("mouseenter", () => {
        if (category !== this.selectedCategory) {
          button.style.background = "var(--bg-tertiary)";
          button.style.color = "var(--text-primary)";
        }
      });

      button.addEventListener("mouseleave", () => {
        if (category !== this.selectedCategory) {
          button.style.background = "var(--bg-secondary)";
          button.style.color = "var(--text-secondary)";
        }
      });

      filterContainer.appendChild(button);
    });

    return filterContainer;
  }

  private createComponentsGrid(): HTMLElement {
    const grid = document.createElement("div");
    grid.className = "graphics-components-grid";
    grid.style.cssText = `
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
            gap: 8px;
        `;

    this.updateComponentsGrid(grid);
    return grid;
  }

  private updateComponentsGrid(grid?: HTMLElement): void {
    const gridElement =
      grid ||
      (document.querySelector(".graphics-components-grid") as HTMLElement);
    if (!gridElement) return;

    gridElement.innerHTML = "";

    const filteredTypes =
      this.selectedCategory === "all"
        ? GRAPHICS_NODE_TYPES
        : GRAPHICS_NODE_TYPES.filter(
            (type) => type.category === this.selectedCategory,
          );

    filteredTypes.forEach((nodeType) => {
      const componentItem = this.createComponentItem(nodeType);
      gridElement.appendChild(componentItem);
    });
  }

  private createComponentItem(nodeType: GraphicsNodeType): HTMLElement {
    const item = document.createElement("div");
    item.className = "graphics-component-item";
    item.draggable = true;
    item.style.cssText = `
            display: flex;
            flex-direction: column;
            align-items: center;
            padding: 12px 8px;
            border: 1px solid var(--border);
            border-radius: var(--radius-sm);
            background: var(--bg-secondary);
            cursor: grab;
            transition: all 0.2s ease;
            position: relative;
            overflow: hidden;
        `;

    // Add component icon and name
    const icon = document.createElement("div");
    icon.className = "component-icon";
    icon.textContent = nodeType.icon;
    icon.style.cssText = `
            font-size: 24px;
            margin-bottom: 6px;
            display: flex;
            align-items: center;
            justify-content: center;
            width: 40px;
            height: 40px;
            border-radius: var(--radius-sm);
            background: var(--bg-tertiary);
        `;

    const name = document.createElement("div");
    name.className = "component-name";
    name.textContent = nodeType.name;
    name.style.cssText = `
            font-size: 11px;
            font-weight: 500;
            color: var(--text-primary);
            text-align: center;
            line-height: 1.2;
            word-break: break-word;
        `;

    const category = document.createElement("div");
    category.className = "component-category";
    category.textContent = this.getCategoryDisplayName(nodeType.category);
    category.style.cssText = `
            font-size: 9px;
            color: var(--text-tertiary);
            text-transform: uppercase;
            margin-top: 2px;
        `;

    item.appendChild(icon);
    item.appendChild(name);
    item.appendChild(category);

    // Add hover effects
    item.addEventListener("mouseenter", () => {
      item.style.borderColor = "var(--accent-wasm)";
      item.style.background = "var(--bg-tertiary)";
      item.style.transform = "translateY(-1px)";
      item.style.boxShadow = "0 2px 8px rgba(101, 79, 240, 0.2)";
      this.showPreview(nodeType);
    });

    item.addEventListener("mouseleave", () => {
      item.style.borderColor = "var(--border)";
      item.style.background = "var(--bg-secondary)";
      item.style.transform = "translateY(0)";
      item.style.boxShadow = "none";
    });

    // Add drag and drop functionality
    item.addEventListener("dragstart", (e) => {
      this.draggedNodeType = nodeType;
      item.style.cursor = "grabbing";
      item.style.opacity = "0.7";

      // Create drag image
      const dragImage = this.createDragImage(nodeType);
      document.body.appendChild(dragImage);
      e.dataTransfer?.setDragImage(dragImage, 60, 30);

      // Set drag data
      e.dataTransfer!.effectAllowed = "copy";
      e.dataTransfer!.setData(
        "application/json",
        JSON.stringify({
          type: "graphics-node",
          nodeType: nodeType,
        }),
      );

      // Clean up drag image after a short delay
      setTimeout(() => {
        if (dragImage.parentNode) {
          dragImage.parentNode.removeChild(dragImage);
        }
      }, 100);
    });

    item.addEventListener("dragend", () => {
      this.draggedNodeType = null;
      item.style.cursor = "grab";
      item.style.opacity = "1";
    });

    // Add click handler for direct creation
    item.addEventListener("click", () => {
      // Create at default position (center of canvas)
      const position = { x: 300, y: 200 };
      this.options.onGraphicsNodeCreate?.(nodeType, position);

      // Visual feedback
      item.style.background = "var(--accent-success)";
      setTimeout(() => {
        item.style.background = "var(--bg-secondary)";
      }, 200);
    });

    // Add tooltip
    item.title = `${nodeType.name}\n${
      nodeType.description
    }\nCategory: ${this.getCategoryDisplayName(nodeType.category)}\nSize: ${
      nodeType.defaultSize.width
    }x${nodeType.defaultSize.height}`;

    return item;
  }

  private createDragImage(nodeType: GraphicsNodeType): HTMLElement {
    const dragImage = document.createElement("div");
    dragImage.style.cssText = `
            position: absolute;
            top: -1000px;
            left: -1000px;
            width: 120px;
            height: 60px;
            background: var(--bg-secondary);
            border: 2px solid var(--accent-wasm);
            border-radius: var(--radius-sm);
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 8px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
            pointer-events: none;
            z-index: 10000;
        `;

    const icon = document.createElement("div");
    icon.textContent = nodeType.icon;
    icon.style.cssText = `
            font-size: 20px;
            width: 32px;
            height: 32px;
            background: var(--accent-wasm);
            border-radius: var(--radius-sm);
            display: flex;
            align-items: center;
            justify-content: center;
        `;

    const name = document.createElement("div");
    name.textContent = nodeType.name;
    name.style.cssText = `
            font-size: 12px;
            font-weight: 500;
            color: var(--text-primary);
            flex: 1;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        `;

    dragImage.appendChild(icon);
    dragImage.appendChild(name);

    return dragImage;
  }

  private createPreviewArea(): HTMLElement {
    const previewContainer = document.createElement("div");
    previewContainer.className = "graphics-preview-area";
    previewContainer.style.cssText = `
            border-top: 1px solid var(--border);
            padding: 12px 0 8px;
            margin-top: 8px;
            display: none;
        `;

    const previewTitle = document.createElement("div");
    previewTitle.className = "preview-title";
    previewTitle.textContent = "Preview";
    previewTitle.style.cssText = `
            font-size: 12px;
            font-weight: 600;
            color: var(--text-secondary);
            margin-bottom: 8px;
        `;

    const previewContent = document.createElement("div");
    previewContent.className = "preview-content";
    previewContent.style.cssText = `
            background: var(--bg-tertiary);
            border: 1px solid var(--border);
            border-radius: var(--radius-sm);
            padding: 12px;
            min-height: 80px;
            position: relative;
            overflow: hidden;
        `;

    const previewCanvas = document.createElement("canvas");
    previewCanvas.className = "preview-canvas";
    previewCanvas.width = 200;
    previewCanvas.height = 60;
    previewCanvas.style.cssText = `
            width: 100%;
            height: auto;
            border-radius: 4px;
            background: #0A0E1A;
        `;

    previewContent.appendChild(previewCanvas);
    previewContainer.appendChild(previewTitle);
    previewContainer.appendChild(previewContent);

    return previewContainer;
  }

  private showPreview(nodeType: GraphicsNodeType): void {
    if (!this.options.showPreview) return;

    const previewArea = document.querySelector(
      ".graphics-preview-area",
    ) as HTMLElement;
    const previewCanvas = document.querySelector(
      ".preview-canvas",
    ) as HTMLCanvasElement;

    if (!previewArea || !previewCanvas) return;

    previewArea.style.display = "block";

    const ctx = previewCanvas.getContext("2d");
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);

    // Draw preview based on node type
    this.drawNodeTypePreview(
      ctx,
      nodeType,
      previewCanvas.width,
      previewCanvas.height,
    );
  }

  private drawNodeTypePreview(
    ctx: CanvasRenderingContext2D,
    nodeType: GraphicsNodeType,
    width: number,
    height: number,
  ): void {
    const centerX = width / 2;
    const centerY = height / 2;

    // Set common styles
    ctx.fillStyle = nodeType.properties.backgroundColor || "#0A0E1A";
    ctx.fillRect(0, 0, width, height);

    // Draw based on node type
    switch (nodeType.id) {
      case "sine-wave-visualizer":
        this.drawSineWavePreview(ctx, centerX, centerY, nodeType.properties);
        break;
      case "particle-system":
        this.drawParticlePreview(ctx, width, height, nodeType.properties);
        break;
      case "radar-visualization":
        this.drawRadarPreview(ctx, centerX, centerY, nodeType.properties);
        break;
      case "data-chart":
        this.drawChartPreview(ctx, width, height, nodeType.properties);
        break;
      case "status-indicator":
        this.drawStatusPreview(ctx, centerX, centerY, nodeType.properties);
        break;
      case "waveform-display":
        this.drawWaveformPreview(ctx, width, height, nodeType.properties);
        break;
      default:
        this.drawGenericPreview(ctx, centerX, centerY, nodeType);
    }
  }

  private drawSineWavePreview(
    ctx: CanvasRenderingContext2D,
    _centerX: number,
    centerY: number,
    props: any,
  ): void {
    ctx.strokeStyle = props.color || "#4A9EFF";
    ctx.lineWidth = 2;
    ctx.beginPath();

    const amplitude = 15;
    const frequency = 0.1;

    for (let x = 0; x < 200; x += 2) {
      const y = centerY + Math.sin(x * frequency) * amplitude;
      if (x === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.stroke();
  }

  private drawParticlePreview(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    props: any,
  ): void {
    const colors = props.particleColors || ["#4A9EFF", "#00D4AA", "#654FF0"];

    for (let i = 0; i < 8; i++) {
      const x = Math.random() * width;
      const y = Math.random() * height;
      const radius = Math.random() * 3 + 1;
      const color = colors[Math.floor(Math.random() * colors.length)];

      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawRadarPreview(
    ctx: CanvasRenderingContext2D,
    centerX: number,
    centerY: number,
    props: any,
  ): void {
    const radius = 25;

    // Draw radar circles
    ctx.strokeStyle = props.detectionColor || "#00D4AA";
    ctx.lineWidth = 1;
    for (let r = 10; r <= radius; r += 10) {
      ctx.beginPath();
      ctx.arc(centerX, centerY, r, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Draw sweep line
    ctx.strokeStyle = props.detectionColor || "#00D4AA";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.lineTo(centerX + radius, centerY - 10);
    ctx.stroke();
  }

  private drawChartPreview(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    props: any,
  ): void {
    ctx.strokeStyle = props.primaryColor || "#4A9EFF";
    ctx.lineWidth = 2;
    ctx.beginPath();

    const points = 10;
    for (let i = 0; i < points; i++) {
      const x = (i / (points - 1)) * (width - 20) + 10;
      const y = height - 10 - Math.random() * (height - 20);

      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.stroke();
  }

  private drawStatusPreview(
    ctx: CanvasRenderingContext2D,
    centerX: number,
    centerY: number,
    props: any,
  ): void {
    const colors = props.colors || { active: "#00D4AA" };
    const radius = 8;

    ctx.fillStyle = colors.active;
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.fill();

    // Add glow effect
    ctx.shadowColor = colors.active;
    ctx.shadowBlur = 10;
    ctx.fill();
  }

  private drawWaveformPreview(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    props: any,
  ): void {
    ctx.strokeStyle = props.color || "#654FF0";
    ctx.lineWidth = 1.5;
    ctx.beginPath();

    for (let x = 0; x < width; x += 3) {
      const y = height / 2 + (Math.random() - 0.5) * (height - 20);
      if (x === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.stroke();
  }

  private drawGenericPreview(
    ctx: CanvasRenderingContext2D,
    centerX: number,
    centerY: number,
    nodeType: GraphicsNodeType,
  ): void {
    // Draw a generic rectangle with icon
    ctx.fillStyle = "var(--accent-wasm)";
    ctx.fillRect(centerX - 30, centerY - 15, 60, 30);

    // Add icon text (simplified)
    ctx.fillStyle = "white";
    ctx.font = "16px Arial";
    ctx.textAlign = "center";
    ctx.fillText(nodeType.icon, centerX, centerY + 5);
  }

  private setSelectedCategory(category: string): void {
    this.selectedCategory = category;
  }

  private updateCategoryButtons(filterContainer: HTMLElement): void {
    const buttons = filterContainer.querySelectorAll(".category-filter-btn");
    buttons.forEach((button) => {
      const htmlButton = button as HTMLElement;
      const isActive =
        button.textContent ===
        this.getCategoryDisplayName(this.selectedCategory);
      button.className = `category-filter-btn ${isActive ? "active" : ""}`;
      htmlButton.style.background = isActive
        ? "var(--accent-wasm)"
        : "var(--bg-secondary)";
      htmlButton.style.color = isActive ? "white" : "var(--text-secondary)";
    });
  }

  /**
   * Enhance buttons with smooth animations
   */
  private enhanceButton(
    button: HTMLButtonElement,
    type: "category" | "component",
  ): void {
    try {
      const animationOptions = {
        hoverAnimation: type === "category" ? "glow" : "lift",
        clickAnimation: "press",
      } as const;

      new AnimatedButton(button, animationOptions);
    } catch (error) {
      console.warn("Failed to enhance button with animations:", error);
      // Button continues to work without animations
    }
  }

  private getCategoryDisplayName(category: string): string {
    switch (category) {
      case "all":
        return "All";
      case "visualization":
        return "Visual";
      case "chart":
        return "Charts";
      case "animation":
        return "Animated";
      case "sensor":
        return "Sensors";
      default:
        return category.charAt(0).toUpperCase() + category.slice(1);
    }
  }

  public getDraggedNodeType(): GraphicsNodeType | null {
    return this.draggedNodeType;
  }

  public clearDraggedNodeType(): void {
    this.draggedNodeType = null;
  }

  public getSelectedCategory(): string {
    return this.selectedCategory;
  }

  public refresh(): void {
    this.updateComponentsGrid();
  }
}
