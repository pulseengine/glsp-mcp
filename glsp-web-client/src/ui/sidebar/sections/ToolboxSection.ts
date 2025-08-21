import { SidebarSection } from "../SidebarComponent.js";

export interface Tool {
  id: string;
  name: string;
  icon: string;
  category: string;
  description?: string;
  action: () => void;
}

export class ToolboxSection {
  private tools: Map<string, Tool[]> = new Map();
  private selectedTool?: string;
  private onToolSelect?: (tool: Tool) => void;

  constructor(onToolSelect?: (tool: Tool) => void) {
    this.onToolSelect = onToolSelect;

    // Listen for edge type loading from diagram preferences
    window.addEventListener(
      "diagram-edge-type-loaded",
      (event: Event & { detail?: { edgeType: string } }) => {
        const edgeType = event.detail?.edgeType;
        if (edgeType) {
          // Select the corresponding edge tool in UI
          const edgeToolId = `edge-${edgeType}`;
          this.setSelectedTool(edgeToolId);
          console.log(
            "ToolboxSection: Updated UI selection for loaded edge type:",
            edgeType,
          );
        }
      },
    );
  }

  public addTool(tool: Tool): void {
    const categoryTools = this.tools.get(tool.category) || [];
    categoryTools.push(tool);
    this.tools.set(tool.category, categoryTools);
  }

  public removeTool(id: string): void {
    this.tools.forEach((tools, category) => {
      const filtered = tools.filter((t) => t.id !== id);
      if (filtered.length !== tools.length) {
        this.tools.set(category, filtered);
      }
    });
  }

  public createSection(): SidebarSection {
    return {
      id: "toolbox",
      title: "Toolbox",
      icon: "🛠️",
      collapsible: true,
      collapsed: false,
      order: 1,
      content: this.createContent(),
    };
  }

  private createContent(): HTMLElement {
    const container = document.createElement("div");
    container.className = "toolbox-container";
    container.style.cssText = `
            display: flex;
            flex-direction: column;
            gap: 12px;
        `;

    // Render tools by category
    this.tools.forEach((tools, category) => {
      const categoryElement = this.createCategoryElement(category, tools);
      container.appendChild(categoryElement);
    });

    return container;
  }

  private createCategoryElement(category: string, tools: Tool[]): HTMLElement {
    const element = document.createElement("div");
    element.className = "tool-category";
    element.style.cssText = `
            background: var(--bg-secondary, #151B2C);
            border-radius: 6px;
            padding: 8px;
        `;

    // Category header
    const header = document.createElement("div");
    header.textContent = category;
    header.style.cssText = `
            font-size: 12px;
            font-weight: 600;
            color: var(--text-secondary, #7D8590);
            margin-bottom: 8px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        `;
    element.appendChild(header);

    // Tool grid
    const grid = document.createElement("div");
    grid.className = "tool-grid";
    grid.style.cssText = `
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 6px;
        `;

    tools.forEach((tool) => {
      const toolButton = this.createToolButton(tool);
      grid.appendChild(toolButton);
    });

    element.appendChild(grid);
    return element;
  }

  private createToolButton(tool: Tool): HTMLElement {
    const button = document.createElement("button");
    button.className = "tool-button";
    button.title = tool.description || tool.name;
    button.dataset.toolId = tool.id;

    button.style.cssText = `
            aspect-ratio: 1;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 4px;
            background: var(--bg-primary, #0F1419);
            border: 1px solid var(--border-color, #2A3441);
            border-radius: 6px;
            color: var(--text-secondary, #7D8590);
            cursor: pointer;
            transition: all 0.2s ease;
            padding: 8px;
            font-size: 11px;
            ${
              this.selectedTool === tool.id
                ? `
                background: var(--accent-wasm, #654FF0);
                color: white;
                border-color: var(--accent-wasm, #654FF0);
            `
                : ""
            }
        `;

    // Tool icon
    const icon = document.createElement("div");
    icon.textContent = tool.icon;
    icon.style.cssText = `
            font-size: 20px;
            line-height: 1;
        `;
    button.appendChild(icon);

    // Tool name
    const name = document.createElement("div");
    name.textContent = tool.name;
    name.style.cssText = `
            font-size: 10px;
            text-align: center;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            width: 100%;
        `;
    button.appendChild(name);

    // Event handlers
    button.addEventListener("click", () => {
      this.selectTool(tool);
    });

    button.addEventListener("mouseenter", () => {
      if (this.selectedTool !== tool.id) {
        button.style.background = "var(--bg-tertiary, #1C2333)";
        button.style.borderColor = "var(--accent-wasm, #654FF0)";
        button.style.color = "var(--text-primary, #E6EDF3)";
      }
    });

    button.addEventListener("mouseleave", () => {
      if (this.selectedTool !== tool.id) {
        button.style.background = "var(--bg-primary, #0F1419)";
        button.style.borderColor = "var(--border-color, #2A3441)";
        button.style.color = "var(--text-secondary, #7D8590)";
      }
    });

    return button;
  }

  private selectTool(tool: Tool): void {
    // Update selected state
    const previousSelected = this.selectedTool;
    this.selectedTool = tool.id;

    // Update UI
    if (previousSelected) {
      const prevButton = document.querySelector(
        `[data-tool-id="${previousSelected}"]`,
      ) as HTMLElement;
      if (prevButton) {
        prevButton.style.background = "var(--bg-primary, #0F1419)";
        prevButton.style.color = "var(--text-secondary, #7D8590)";
        prevButton.style.borderColor = "var(--border-color, #2A3441)";
      }
    }

    const currentButton = document.querySelector(
      `[data-tool-id="${tool.id}"]`,
    ) as HTMLElement;
    if (currentButton) {
      currentButton.style.background = "var(--accent-wasm, #654FF0)";
      currentButton.style.color = "white";
      currentButton.style.borderColor = "var(--accent-wasm, #654FF0)";
    }

    // Execute tool action
    tool.action();
    this.onToolSelect?.(tool);
  }

  public getSelectedTool(): string | undefined {
    return this.selectedTool;
  }

  public setSelectedTool(toolId: string): void {
    const tool = this.findTool(toolId);
    if (tool) {
      this.selectTool(tool);
    }
  }

  private findTool(id: string): Tool | undefined {
    for (const tools of this.tools.values()) {
      const tool = tools.find((t) => t.id === id);
      if (tool) return tool;
    }
    return undefined;
  }
}

// Example tools
export const createDefaultTools = (): Tool[] => [
  // Selection tools
  {
    id: "select",
    name: "Select",
    icon: "👆",
    category: "Selection",
    description: "Select and move elements",
    action: () => console.log("Select tool activated"),
  },
  {
    id: "pan",
    name: "Pan",
    icon: "✋",
    category: "Selection",
    description: "Pan the canvas",
    action: () => console.log("Pan tool activated"),
  },
  {
    id: "zoom",
    name: "Zoom",
    icon: "🔍",
    category: "Selection",
    description: "Zoom in/out",
    action: () => console.log("Zoom tool activated"),
  },
  {
    id: "delete",
    name: "Delete",
    icon: "🗑️",
    category: "Selection",
    description: "Delete selected elements (Del/Backspace)",
    action: () =>
      window.dispatchEvent(new CustomEvent("toolbar-delete-selected")),
  },

  // Node tools
  {
    id: "node-task",
    name: "Task",
    icon: "📋",
    category: "Nodes",
    description: "Create a task node",
    action: () => console.log("Task node tool activated"),
  },
  {
    id: "node-decision",
    name: "Decision",
    icon: "🔀",
    category: "Nodes",
    description: "Create a decision node",
    action: () => console.log("Decision node tool activated"),
  },
  {
    id: "node-process",
    name: "Process",
    icon: "⚙️",
    category: "Nodes",
    description: "Create a process node",
    action: () => console.log("Process node tool activated"),
  },

  // Connection tools
  {
    id: "edge-direct",
    name: "Direct",
    icon: "➡️",
    category: "Connections",
    description: "Create a direct connection",
    action: () => console.log("Direct edge tool activated"),
  },
  {
    id: "edge-conditional",
    name: "Conditional",
    icon: "❓",
    category: "Connections",
    description: "Create a conditional connection",
    action: () => console.log("Conditional edge tool activated"),
  },
  {
    id: "edge-bidirectional",
    name: "Bidirectional",
    icon: "↔️",
    category: "Connections",
    description: "Create a bidirectional connection",
    action: () => console.log("Bidirectional edge tool activated"),
  },
  {
    id: "interface-linker",
    name: "Interface Linker",
    icon: "🔗",
    category: "Connections",
    description: "Link WASM interface ports with compatibility checking",
    action: () => {
      console.log("Interface Linker tool activated");
      window.dispatchEvent(
        new CustomEvent("toolbar-mode-change", {
          detail: { mode: "create-interface-link" },
        }),
      );
    },
  },

  // Edge type tools
  {
    id: "edge-straight",
    name: "Straight",
    icon: "—",
    category: "Edge Types",
    description: "Create straight line edges",
    action: () => {
      console.log("Straight edge type activated");
      window.dispatchEvent(
        new CustomEvent("toolbar-edge-type-change", {
          detail: { edgeType: "straight" },
        }),
      );
    },
  },
  {
    id: "edge-curved",
    name: "Curved",
    icon: "∿",
    category: "Edge Types",
    description: "Create curved edges with smooth bends",
    action: () => {
      console.log("Curved edge type activated");
      window.dispatchEvent(
        new CustomEvent("toolbar-edge-type-change", {
          detail: { edgeType: "curved" },
        }),
      );
    },
  },
  {
    id: "edge-orthogonal",
    name: "Orthogonal",
    icon: "┐",
    category: "Edge Types",
    description: "Create orthogonal edges with right angles",
    action: () => {
      console.log("Orthogonal edge type activated");
      window.dispatchEvent(
        new CustomEvent("toolbar-edge-type-change", {
          detail: { edgeType: "orthogonal" },
        }),
      );
    },
  },
  {
    id: "edge-bezier",
    name: "Bezier",
    icon: "∿",
    category: "Edge Types",
    description: "Create bezier curve edges",
    action: () => {
      console.log("Bezier edge type activated");
      window.dispatchEvent(
        new CustomEvent("toolbar-edge-type-change", {
          detail: { edgeType: "bezier" },
        }),
      );
    },
  },
];
