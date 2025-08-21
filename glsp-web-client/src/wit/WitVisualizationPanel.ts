/**
 * WIT Visualization Panel
 * Floating panel for displaying WebAssembly Interface Types details
 */

import { McpService } from "../services/McpService.js";
import {
  FloatingPanel,
  FloatingPanelConfig,
  FloatingPanelEvents,
} from "../ui/FloatingPanel.js";

export interface WitComponentData {
  componentName: string;
  componentPath: string;
  witData?: WitAnalysis;
}

export interface WitAnalysis {
  interfaces: WitInterface[];
  worlds: WitWorld[];
  packages: WitPackage[];
  rawWit?: string;
}

export interface WitInterface {
  name: string;
  namespace?: string;
  package?: string;
  version?: string;
  type: "import" | "export";
  functions: WitFunction[];
  types: WitType[];
}

export interface WitFunction {
  name: string;
  params: WitParam[];
  results: WitParam[];
  isAsync?: boolean;
}

export interface WitParam {
  name: string;
  type: string;
}

export interface WitType {
  name: string;
  definition: WitTypeDefinition;
}

export interface WitTypeDefinition {
  kind: "record" | "variant" | "enum" | "flags" | "type" | "resource";
  fields?: Array<{ name: string; type: string }>;
  cases?: Array<{ name: string; type?: string }>;
  values?: string[];
  target?: string;
}

export interface WitWorld {
  name: string;
  imports: string[];
  exports: string[];
}

export interface WitPackage {
  name: string;
  version?: string;
  interfaces: string[];
  worlds: string[];
}

export class WitVisualizationPanel extends FloatingPanel {
  private mcpService: McpService;
  private currentComponent?: WitComponentData;
  private viewMode: "structure" | "raw" | "graph" = "structure";
  private selectedElement?: { type: string; name: string; data: any };

  constructor(mcpService: McpService) {
    const config: FloatingPanelConfig = {
      title: "WIT Interface Viewer",
      width: 800,
      height: 600,
      minWidth: 600,
      minHeight: 400,
      className: "wit-visualization-panel",
      initialPosition: { x: 200, y: 100 },
    };

    const events: FloatingPanelEvents = {
      onClose: () => this.onHide(),
    };

    super(config, events);

    this.mcpService = mcpService;
    this.setupUI();
    this.hide(); // Hidden by default
  }

  protected createContent(): string {
    return `
            <div class="wit-toolbar">
                <button class="wit-view-btn active" data-mode="structure">📊 Structure</button>
                <button class="wit-view-btn" data-mode="raw">📝 Raw WIT</button>
                <button class="wit-view-btn" data-mode="graph">🕸️ Graph</button>
                <input type="text" class="wit-search" placeholder="Search interfaces, types, functions...">
            </div>
            <div class="wit-content-container"></div>
        `;
  }

  private setupUI(): void {
    // Setup event handlers for the toolbar buttons
    const viewButtons = this.contentElement.querySelectorAll(".wit-view-btn");
    viewButtons.forEach((btn) => {
      btn.addEventListener("click", () => {
        const mode = (btn as HTMLElement).dataset.mode as typeof this.viewMode;
        this.setViewMode(mode);
      });
    });

    // Setup search handler
    const searchBox = this.contentElement.querySelector(
      ".wit-search",
    ) as HTMLInputElement;
    if (searchBox) {
      searchBox.oninput = (e) =>
        this.handleSearch((e.target as HTMLInputElement).value);
    }

    // Add styles
    this.addStyles();
  }

  private addStyles(): void {
    const style = document.createElement("style");
    style.textContent = `
            .wit-visualization-panel {
                font-family: var(--font-mono);
            }

            .wit-toolbar {
                display: flex;
                gap: 8px;
                padding: 12px;
                border-bottom: 1px solid var(--border);
                background: var(--bg-tertiary);
                align-items: center;
            }

            .wit-view-btn {
                padding: 6px 12px;
                background: var(--bg-secondary);
                border: 1px solid var(--border);
                border-radius: var(--radius-sm);
                color: var(--text-secondary);
                cursor: pointer;
                transition: all 0.2s ease;
                font-size: 13px;
            }

            .wit-view-btn:hover {
                background: var(--bg-primary);
                color: var(--text-primary);
                border-color: var(--accent-wasm);
            }

            .wit-view-btn.active {
                background: var(--accent-wasm);
                color: white;
                border-color: var(--accent-wasm);
            }

            .wit-search {
                flex: 1;
                padding: 6px 12px;
                background: var(--bg-secondary);
                border: 1px solid var(--border);
                border-radius: var(--radius-sm);
                color: var(--text-primary);
                font-size: 13px;
                outline: none;
            }

            .wit-search:focus {
                border-color: var(--accent-wasm);
                box-shadow: 0 0 0 2px rgba(101, 79, 240, 0.2);
            }

            .wit-content-container {
                flex: 1;
                padding: 16px;
                overflow: auto;
                background: var(--bg-primary);
            }

            /* Structure View Styles */
            .wit-structure {
                display: flex;
                gap: 16px;
                height: 100%;
            }

            .wit-tree {
                flex: 1;
                overflow: auto;
                background: var(--bg-secondary);
                border: 1px solid var(--border);
                border-radius: var(--radius-md);
                padding: 16px;
            }

            .wit-details {
                flex: 1;
                overflow: auto;
                background: var(--bg-secondary);
                border: 1px solid var(--border);
                border-radius: var(--radius-md);
                padding: 16px;
            }

            .wit-tree-item {
                padding: 6px 8px;
                margin: 2px 0;
                border-radius: var(--radius-sm);
                cursor: pointer;
                display: flex;
                align-items: center;
                gap: 8px;
                transition: all 0.2s ease;
                user-select: none;
            }

            .wit-tree-item:hover {
                background: var(--bg-tertiary);
            }

            .wit-tree-item.selected {
                background: var(--accent-wasm);
                color: white;
            }

            .wit-tree-item-icon {
                font-size: 16px;
                width: 20px;
                text-align: center;
            }

            .wit-tree-item-name {
                flex: 1;
                font-size: 13px;
            }

            .wit-tree-item-type {
                font-size: 11px;
                opacity: 0.7;
                padding: 2px 6px;
                background: rgba(0, 0, 0, 0.2);
                border-radius: var(--radius-sm);
            }

            .wit-tree-children {
                margin-left: 24px;
                border-left: 1px solid var(--border);
                padding-left: 8px;
            }

            /* Details Panel Styles */
            .wit-details-header {
                font-size: 18px;
                font-weight: bold;
                margin-bottom: 16px;
                padding-bottom: 12px;
                border-bottom: 1px solid var(--border);
                display: flex;
                align-items: center;
                gap: 12px;
            }

            .wit-details-section {
                margin-bottom: 20px;
            }

            .wit-details-section h4 {
                font-size: 14px;
                color: var(--text-secondary);
                margin-bottom: 8px;
            }

            .wit-function-signature {
                background: var(--bg-primary);
                border: 1px solid var(--border);
                border-radius: var(--radius-sm);
                padding: 12px;
                font-family: var(--font-mono);
                font-size: 12px;
                line-height: 1.6;
                white-space: pre-wrap;
            }

            .wit-type-definition {
                background: var(--bg-primary);
                border: 1px solid var(--border);
                border-radius: var(--radius-sm);
                padding: 12px;
                font-family: var(--font-mono);
                font-size: 12px;
            }

            /* Raw WIT View */
            .wit-raw-content {
                background: var(--bg-secondary);
                border: 1px solid var(--border);
                border-radius: var(--radius-md);
                padding: 16px;
                font-family: var(--font-mono);
                font-size: 13px;
                line-height: 1.6;
                white-space: pre-wrap;
                overflow: auto;
                height: 100%;
            }

            /* Graph View Placeholder */
            .wit-graph-placeholder {
                display: flex;
                align-items: center;
                justify-content: center;
                height: 100%;
                color: var(--text-dim);
                font-size: 16px;
                text-align: center;
            }
        `;
    document.head.appendChild(style);
  }

  public async showComponent(componentData: WitComponentData): Promise<void> {
    this.currentComponent = componentData;
    this.show();

    // Load WIT data if not already loaded
    if (!componentData.witData) {
      await this.loadWitData();
    }

    this.renderContent();
  }

  private async loadWitData(): Promise<void> {
    if (!this.currentComponent) return;

    try {
      // Fetch structured WIT data
      const witResource = await this.mcpService.readResource(
        `wasm://component/${this.currentComponent.componentName}/wit`,
      );

      if (witResource && witResource.contents && witResource.contents[0]) {
        const witData = JSON.parse(witResource.contents[0].text || "");
        this.currentComponent.witData = this.parseWitData(witData);
      }

      // Fetch raw WIT text
      const rawWitResource = await this.mcpService.readResource(
        `wasm://component/${this.currentComponent.componentName}/wit/raw`,
      );

      if (
        rawWitResource &&
        rawWitResource.contents &&
        rawWitResource.contents[0]
      ) {
        if (this.currentComponent.witData) {
          this.currentComponent.witData.rawWit =
            rawWitResource.contents[0].text;
        }
      }
    } catch (error) {
      console.error("Failed to load WIT data:", error);
      this.showError("Failed to load WIT data");
    }
  }

  private parseWitData(data: any): WitAnalysis {
    // Transform the data from the backend format to our format
    const analysis: WitAnalysis = {
      interfaces: [],
      worlds: [],
      packages: [],
    };

    // Parse interfaces
    if (data.interfaces) {
      analysis.interfaces = data.interfaces.map((iface: any) => ({
        name: iface.name,
        namespace: iface.namespace,
        package: iface.package,
        version: iface.version,
        type: iface.interface_type || "export",
        functions: iface.functions || [],
        types: iface.types || [],
      }));
    }

    // Parse worlds (if available)
    if (data.worlds) {
      analysis.worlds = data.worlds;
    }

    // Parse packages (if available)
    if (data.packages) {
      analysis.packages = data.packages;
    }

    return analysis;
  }

  private setViewMode(mode: typeof this.viewMode): void {
    this.viewMode = mode;

    // Update button states
    this.contentElement.querySelectorAll(".wit-view-btn").forEach((btn) => {
      const btnMode = (btn as HTMLElement).dataset.mode;
      btn.classList.toggle("active", btnMode === mode);
    });

    this.renderContent();
  }

  private renderContent(): void {
    const contentContainer = this.contentElement.querySelector(
      ".wit-content-container",
    ) as HTMLElement;
    if (!contentContainer) return;

    if (!this.currentComponent) {
      contentContainer.innerHTML =
        '<div class="wit-graph-placeholder">No component selected</div>';
      return;
    }

    switch (this.viewMode) {
      case "structure":
        this.renderStructureView(contentContainer);
        break;
      case "raw":
        this.renderRawView(contentContainer);
        break;
      case "graph":
        this.renderGraphView(contentContainer);
        break;
    }
  }

  private renderStructureView(contentContainer: HTMLElement): void {
    if (!this.currentComponent?.witData) {
      contentContainer.innerHTML =
        '<div class="wit-graph-placeholder">Loading WIT data...</div>';
      return;
    }

    const container = document.createElement("div");
    container.className = "wit-structure";

    // Tree view
    const tree = document.createElement("div");
    tree.className = "wit-tree";
    tree.appendChild(this.buildTree());

    // Details panel
    const details = document.createElement("div");
    details.className = "wit-details";
    details.innerHTML =
      '<div class="wit-graph-placeholder">Select an item to view details</div>';

    container.appendChild(tree);
    container.appendChild(details);

    contentContainer.innerHTML = "";
    contentContainer.appendChild(container);
  }

  private buildTree(): HTMLElement {
    const tree = document.createElement("div");
    const witData = this.currentComponent?.witData;
    if (!witData) return tree;

    // Component root
    const componentItem = this.createTreeItem(
      "📦",
      this.currentComponent?.componentName || "Component",
      "component",
      { component: this.currentComponent },
    );
    tree.appendChild(componentItem);

    const componentChildren = document.createElement("div");
    componentChildren.className = "wit-tree-children";

    // Add imports section
    const imports = witData.interfaces.filter((i) => i.type === "import");
    if (imports.length > 0) {
      const importsItem = this.createTreeItem("📥", "Imports", "section", null);
      componentChildren.appendChild(importsItem);

      const importsChildren = document.createElement("div");
      importsChildren.className = "wit-tree-children";
      imports.forEach((iface) => {
        importsChildren.appendChild(this.createInterfaceItem(iface));
      });
      componentChildren.appendChild(importsChildren);
    }

    // Add exports section
    const exports = witData.interfaces.filter((i) => i.type === "export");
    if (exports.length > 0) {
      const exportsItem = this.createTreeItem("📤", "Exports", "section", null);
      componentChildren.appendChild(exportsItem);

      const exportsChildren = document.createElement("div");
      exportsChildren.className = "wit-tree-children";
      exports.forEach((iface) => {
        exportsChildren.appendChild(this.createInterfaceItem(iface));
      });
      componentChildren.appendChild(exportsChildren);
    }

    tree.appendChild(componentChildren);
    return tree;
  }

  private createInterfaceItem(iface: WitInterface): HTMLElement {
    const item = this.createTreeItem("🔷", iface.name, "interface", iface);

    const children = document.createElement("div");
    children.className = "wit-tree-children";

    // Add functions
    if (iface.functions.length > 0) {
      iface.functions.forEach((func) => {
        children.appendChild(
          this.createTreeItem("🔧", func.name, "function", func),
        );
      });
    }

    // Add types
    if (iface.types.length > 0) {
      iface.types.forEach((type) => {
        const icon = this.getTypeIcon(type.definition.kind);
        children.appendChild(
          this.createTreeItem(icon, type.name, "type", type),
        );
      });
    }

    if (children.children.length > 0) {
      item.parentElement?.appendChild(children);
    }

    return item;
  }

  private createTreeItem(
    icon: string,
    name: string,
    type: string,
    data: any,
  ): HTMLElement {
    const item = document.createElement("div");
    item.className = "wit-tree-item";

    item.innerHTML = `
            <span class="wit-tree-item-icon">${icon}</span>
            <span class="wit-tree-item-name">${name}</span>
            <span class="wit-tree-item-type">${type}</span>
        `;

    item.onclick = () => this.selectElement(type, name, data);

    return item;
  }

  private getTypeIcon(kind: string): string {
    const icons: Record<string, string> = {
      record: "📋",
      variant: "🔀",
      enum: "📑",
      flags: "🚩",
      resource: "🔗",
      type: "📐",
    };
    return icons[kind] || "📐";
  }

  private selectElement(type: string, name: string, data: any): void {
    // Update selection
    this.contentElement.querySelectorAll(".wit-tree-item").forEach((item) => {
      item.classList.remove("selected");
    });
    (event?.currentTarget as HTMLElement)?.classList.add("selected");

    this.selectedElement = { type, name, data };
    this.renderDetails();
  }

  private renderDetails(): void {
    const detailsPanel = this.contentElement.querySelector(".wit-details");
    if (!detailsPanel || !this.selectedElement) return;

    const { type, name, data } = this.selectedElement;

    let content = `
            <div class="wit-details-header">
                <span>${this.getTypeIcon(type)}</span>
                <span>${name}</span>
            </div>
        `;

    switch (type) {
      case "interface":
        content += this.renderInterfaceDetails(data);
        break;
      case "function":
        content += this.renderFunctionDetails(data);
        break;
      case "type":
        content += this.renderTypeDetails(data);
        break;
      case "component":
        content += this.renderComponentDetails(data);
        break;
    }

    detailsPanel.innerHTML = content;
  }

  private renderInterfaceDetails(iface: WitInterface): string {
    return `
            <div class="wit-details-section">
                <h4>Interface Information</h4>
                <div class="wit-type-definition">
                    ${iface.package ? `Package: ${iface.package}<br>` : ""}
                    ${
                      iface.namespace ? `Namespace: ${iface.namespace}<br>` : ""
                    }
                    Type: ${iface.type}<br>
                    Functions: ${iface.functions.length}<br>
                    Types: ${iface.types.length}
                </div>
            </div>
        `;
  }

  private renderFunctionDetails(func: WitFunction): string {
    const signature = this.formatFunctionSignature(func);
    return `
            <div class="wit-details-section">
                <h4>Function Signature</h4>
                <div class="wit-function-signature">${signature}</div>
            </div>
        `;
  }

  private renderTypeDetails(type: WitType): string {
    const definition = this.formatTypeDefinition(type);
    return `
            <div class="wit-details-section">
                <h4>Type Definition</h4>
                <div class="wit-type-definition">${definition}</div>
            </div>
        `;
  }

  private renderComponentDetails(data: any): string {
    const witData = data.component?.witData;
    if (!witData) return "<p>No WIT data available</p>";

    return `
            <div class="wit-details-section">
                <h4>Component Overview</h4>
                <div class="wit-type-definition">
                    Imports: ${
                      witData.interfaces.filter(
                        (i: WitInterface) => i.type === "import",
                      ).length
                    }<br>
                    Exports: ${
                      witData.interfaces.filter(
                        (i: WitInterface) => i.type === "export",
                      ).length
                    }<br>
                    Total Interfaces: ${witData.interfaces.length}<br>
                    Worlds: ${witData.worlds.length}<br>
                    Packages: ${witData.packages.length}
                </div>
            </div>
        `;
  }

  private formatFunctionSignature(func: WitFunction): string {
    const params = func.params.map((p) => `${p.name}: ${p.type}`).join(", ");
    const results =
      func.results.length > 0
        ? ` -> ${func.results.map((r) => r.type).join(", ")}`
        : "";
    return `${func.name}(${params})${results}${func.isAsync ? " async" : ""}`;
  }

  private formatTypeDefinition(type: WitType): string {
    const def = type.definition;
    switch (def.kind) {
      case "record":
        const fields =
          def.fields?.map((f) => `  ${f.name}: ${f.type}`).join("\n") || "";
        return `record ${type.name} {\n${fields}\n}`;
      case "variant":
        const cases =
          def.cases
            ?.map((c) => `  ${c.name}${c.type ? `: ${c.type}` : ""}`)
            .join("\n") || "";
        return `variant ${type.name} {\n${cases}\n}`;
      case "enum":
        const values = def.values?.map((v) => `  ${v}`).join("\n") || "";
        return `enum ${type.name} {\n${values}\n}`;
      case "flags":
        const flags = def.values?.map((v) => `  ${v}`).join("\n") || "";
        return `flags ${type.name} {\n${flags}\n}`;
      case "type":
        return `type ${type.name} = ${def.target || "unknown"}`;
      case "resource":
        return `resource ${type.name}`;
      default:
        return `${def.kind} ${type.name}`;
    }
  }

  private renderRawView(contentContainer: HTMLElement): void {
    const rawWit =
      this.currentComponent?.witData?.rawWit || "No raw WIT data available";
    contentContainer.innerHTML = `
            <pre class="wit-raw-content">${this.escapeHtml(rawWit)}</pre>
        `;
  }

  private renderGraphView(contentContainer: HTMLElement): void {
    contentContainer.innerHTML = `
            <div class="wit-graph-placeholder">
                <div>
                    <h3>Dependency Graph View</h3>
                    <p>Interactive dependency visualization coming soon...</p>
                    <p>This view will show:</p>
                    <ul style="text-align: left; display: inline-block;">
                        <li>Interface relationships</li>
                        <li>Type dependencies</li>
                        <li>Import/Export connections</li>
                        <li>Package boundaries</li>
                    </ul>
                </div>
            </div>
        `;
  }

  private handleSearch(query: string): void {
    // TODO: Implement search functionality
    console.log("Search query:", query);
  }

  private showError(message: string): void {
    const contentContainer = this.contentElement.querySelector(
      ".wit-content-container",
    ) as HTMLElement;
    if (contentContainer) {
      contentContainer.innerHTML = `
                <div class="wit-graph-placeholder">
                    <div style="color: var(--accent-error);">
                        <h3>Error</h3>
                        <p>${message}</p>
                    </div>
                </div>
            `;
    }
  }

  private escapeHtml(text: string): string {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }
}
