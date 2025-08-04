import {
  CanvasRenderer,
  InteractionEvent,
} from "../renderer/canvas-renderer.js";
import { DiagramService } from "../services/DiagramService.js";
import { WasmComponentManager } from "../wasm/WasmComponentManager.js";
import { UIManager } from "./UIManager.js";
import { statusManager } from "../services/StatusManager.js";
import { McpService } from "../services/McpService.js";
import {
  InterfaceConnectionDialog,
  InterfaceConnectionOption,
} from "./dialogs/specialized/InterfaceConnectionDialog.js";
import {
  InterfaceCompatibilityChecker,
  WitInterface,
  WitFunction,
  WitType,
} from "../diagrams/interface-compatibility.js";
import { ViewModeManager } from "./ViewModeManager.js";

declare global {
  interface Window {
    app?: { uiManager?: import("./UIManager.js").UIManager };
    executeWasmCode?: (id: string) => void;
  }
}

export class InteractionManager {
  private renderer: CanvasRenderer;
  private diagramService: DiagramService;
  private mcpService: McpService;
  private wasmComponentManager?: WasmComponentManager;
  private uiManager?: UIManager;
  private viewModeManager?: ViewModeManager;
  private currentMode: string = "select";
  private currentNodeType: string = "";
  private currentEdgeType: string = "";
  private spacePressed: boolean = false;
  private originalMode: string = "select";
  private autoSaveTimeout?: number;
  private _pendingAutoSave = false; // TODO: Implement auto-save functionality

  constructor(
    renderer: CanvasRenderer,
    diagramService: DiagramService,
    mcpService: McpService,
  ) {
    this.renderer = renderer;
    this.diagramService = diagramService;
    this.mcpService = mcpService;
  }

  public setupEventHandlers(): void {
    this.renderer.addInteractionHandler((event: InteractionEvent) => {
      this.handleRendererInteraction(event);
    });

    document.addEventListener("keydown", (event) => {
      this.handleKeyboardShortcut(event);
      this.handleSpaceKeyDown(event);
    });

    document.addEventListener("keyup", (event) => {
      this.handleSpaceKeyUp(event);
    });

    // Listen for toolbar events
    window.addEventListener(
      "toolbar-mode-change",
      (event: Event & { detail?: { mode: string } }) => {
        this.currentMode = event.detail?.mode || "select";
        console.log("Mode changed to:", this.currentMode);

        // Get the current node/edge type from UIManager when mode changes
        if (this.currentMode === "create-node") {
          const uiManager = window.app?.uiManager;
          if (uiManager) {
            this.currentNodeType = uiManager.getCurrentNodeType();
          }
        } else if (this.currentMode === "create-edge") {
          const uiManager = window.app?.uiManager;
          if (uiManager) {
            this.currentEdgeType = uiManager.getCurrentEdgeType();
          }
        }

        // Update renderer mode
        if (this.currentMode === "pan") {
          this.renderer.setInteractionMode("pan");
        } else if (this.currentMode === "create-node") {
          this.renderer.setInteractionMode("create-node");
        } else if (this.currentMode === "create-edge") {
          this.renderer.setInteractionMode("create-edge");
        } else if (this.currentMode === "create-interface-link") {
          this.renderer.setInteractionMode("create-interface-link");
          // Ensure interface data is loaded when entering interface linking mode
          this.preloadWitDataForDiagram().catch(console.error);
        } else {
          this.renderer.setInteractionMode("select");
        }
      },
    );

    window.addEventListener(
      "toolbar-zoom",
      (event: Event & { detail?: { action: string; direction?: string } }) => {
        const direction = event.detail?.direction;
        if (direction === "in") {
          this.renderer.zoom(1.2);
        } else {
          this.renderer.zoom(0.8);
        }
      },
    );

    window.addEventListener("toolbar-fit-content", () => {
      this.renderer.fitToContent();
    });

    window.addEventListener("toolbar-reset-view", () => {
      this.renderer.resetView();
    });

    window.addEventListener("toolbar-apply-layout", async () => {
      const diagramId = this.diagramService.getCurrentDiagramId();
      if (diagramId) {
        await this.diagramService.applyLayout(diagramId, "hierarchical");
      }
    });

    window.addEventListener("toolbar-delete-selected", () => {
      this.deleteSelected().catch(console.error);
    });

    // Listen for edge creation type changes
    window.addEventListener(
      "edge-creation-type-change",
      (event: Event & { detail?: { creationType: string } }) => {
        const creationType = event.detail?.creationType;
        if (creationType) {
          console.log(
            "InteractionManager: Edge creation type changed to:",
            creationType,
          );
          this.renderer.setEdgeCreationType(creationType);
        }
      },
    );

    // Listen for toolbar edge type changes
    window.addEventListener(
      "toolbar-edge-type-change",
      (event: Event & { detail?: { edgeType: string } }) => {
        const edgeType = event.detail?.edgeType;
        if (edgeType) {
          console.log(
            "InteractionManager: Toolbar edge type changed to:",
            edgeType,
          );
          this.renderer.setEdgeCreationType(edgeType);
        }
      },
    );

    // Listen for diagram load events to pre-load WIT data
    window.addEventListener("diagram-loaded-preload-wit", () => {
      this.preloadWitDataForDiagram().catch(console.error);
    });
  }

  // Set the WASM component manager reference
  public setWasmComponentManager(manager: WasmComponentManager): void {
    this.wasmComponentManager = manager;
  }

  // Set the UI manager reference for updating properties panel
  public setUIManager(uiManager: UIManager): void {
    this.uiManager = uiManager;
  }

  // Set the view mode manager reference for checking current view mode
  public setViewModeManager(viewModeManager: ViewModeManager): void {
    this.viewModeManager = viewModeManager;
  }

  private async handleRendererInteraction(
    event: InteractionEvent,
  ): Promise<void> {
    const diagramId = this.diagramService.getCurrentDiagramId();
    if (!diagramId) return;

    switch (event.type) {
      case "click":
        await this.handleElementClick(event);
        // Update properties panel when element is clicked
        if (event.element && this.uiManager) {
          this.updatePropertiesPanel(event.element).catch(console.error);
        } else if (!event.element && this.uiManager) {
          // Clear selection when clicking empty canvas
          this.uiManager.clearSelectedElement();
        }
        break;
      case "drag-end":
        await this.handleDragEnd(event);
        break;
      case "canvas-click":
        await this.handleCanvasClick(event);
        break;
      case "edge-end":
        if (event.sourceElement && event.element) {
          const edgeType = this.currentEdgeType || "flow";
          await this.diagramService.createEdge(
            diagramId,
            edgeType,
            event.sourceElement.id,
            event.element.id,
          );
        }
        break;
      case "interface-click":
        await this.handleInterfaceClick(event);
        break;
      case "double-click":
        await this.handleComponentDoubleClick(event);
        break;
    }
  }

  private async handleCanvasClick(event: InteractionEvent): Promise<void> {
    const { position } = event;
    if (!position) return;

    let diagramId = this.diagramService.getCurrentDiagramId();
    if (!diagramId) {
      console.warn("No diagram loaded! Creating a new diagram...");
      const newDiagram = await this.diagramService.createNewDiagram(
        "workflow",
        "Untitled Diagram",
      );
      if (newDiagram) {
        diagramId = newDiagram;
        // Load the newly created diagram
        const loadedDiagram = await this.diagramService.loadDiagram(newDiagram);
        if (loadedDiagram && this.renderer) {
          this.renderer.setDiagram(loadedDiagram);
        }
      } else {
        console.error("Failed to create a new diagram! Cannot create node.");
        return;
      }
    }

    console.log("Canvas clicked at:", position, "Mode:", this.currentMode);

    if (this.currentMode === "create-node" && this.currentNodeType) {
      // Create a new node at the clicked position
      console.log(
        "Creating node:",
        this.currentNodeType,
        "at position:",
        position,
      );
      await this.diagramService.createNode(
        diagramId,
        this.currentNodeType,
        position,
        `New ${this.currentNodeType}`,
      );
      console.log("Created node:", this.currentNodeType);
    } else {
      console.log(
        "Canvas click ignored - mode:",
        this.currentMode,
        "nodeType:",
        this.currentNodeType,
      );
    }
  }

  private async handleElementClick(event: InteractionEvent): Promise<void> {
    const { element, position } = event;
    if (!element || !position) return;

    console.log("Element clicked:", element.id, "Mode:", this.currentMode);

    // Handle edge creation mode
    if (this.currentMode === "create-edge" && this.currentEdgeType) {
      // Tell renderer to start edge creation from this element
      this.renderer.startEdgeCreation(element, this.currentEdgeType);
      return;
    }

    // Check if this is a WASM component and if the click is on the load switch
    if (this.wasmComponentManager && element.bounds) {
      const isLoadSwitchClick = this.wasmComponentManager.isLoadSwitchClick(
        position,
        element,
      );

      if (isLoadSwitchClick) {
        console.log("Load switch clicked for component:", element.id);
        await this.wasmComponentManager.toggleComponentLoad(element.id);
        return; // Don't process other click actions for load switch
      }

      // Note: Removed automatic execution view opening to allow normal selection
      // The execution view can be opened from the properties panel instead
    }

    // Allow normal selection to proceed for all elements including WASM components
  }

  private async updatePropertiesPanel(
    element: import("../model/diagram.js").ModelElement,
  ): Promise<void> {
    if (!this.uiManager) return;

    const elementType = element.type || element.element_type || "unknown";
    const isNode =
      !elementType.includes("edge") &&
      !elementType.includes("flow") &&
      !elementType.includes("association") &&
      !elementType.includes("dependency") &&
      !elementType.includes("sequence-flow") &&
      !elementType.includes("message-flow") &&
      !elementType.includes("conditional-flow");

    console.log(
      "Updating properties panel for element:",
      element.id,
      "type:",
      elementType,
      "isNode:",
      isNode,
    );

    // Determine if this is a node or edge
    const objectType = isNode ? "node" : "edge";

    let additionalProperties = {};

    // For WASM components, fetch WIT information if not already available
    if (elementType === "wasm-component") {
      // Check if we already have interface data
      if (
        !element.properties?.interfaces ||
        element.properties.interfaces.length === 0
      ) {
        await this.fetchAndStoreWitInfo(element);
      }

      additionalProperties = {
        componentName: element.label || element.properties?.componentName,
        isLoaded: element.properties?.isLoaded || false,
        status: element.properties?.status || "unknown",
        interfaces: element.properties?.interfaces || [],
        witInfo: element.properties?.witInfo,
        witError: element.properties?.witError,
        // Include summary statistics for display
        importsCount: element.properties?.importsCount || 0,
        exportsCount: element.properties?.exportsCount || 0,
        totalFunctions: element.properties?.totalFunctions || 0,
        dependenciesCount: element.properties?.dependenciesCount || 0,
      };
    } else if (objectType === "edge") {
      additionalProperties = {
        sourceId: element.sourceId || element.properties?.sourceId,
        targetId: element.targetId || element.properties?.targetId,
        routingPoints: element.routingPoints,
      };
    }

    // Update the properties panel with element information
    this.uiManager.updateSelectedElement(element.id, objectType, {
      label: element.label || element.properties?.label || "Untitled",
      type: elementType,
      bounds: element.bounds,
      properties: element.properties || {},
      ...additionalProperties,
    });
  }

  // Extract WIT fetching logic into a separate method
  private async fetchAndStoreWitInfo(
    element: import("../model/diagram.js").ModelElement,
  ): Promise<void> {
    // Log element type for debugging
    console.log(
      `Fetching WIT info for element: ${element.id}, type='${element.type}', element_type='${element.element_type}'`,
    );

    try {
      const diagramId = this.diagramService.getCurrentDiagramId();
      if (!diagramId) return;

      console.log("Fetching WIT info for WASM component:", element.id);
      const mcpClient = this.diagramService.getMcpClient();
      const witInfo = await mcpClient.callTool("get_component_wit_info", {
        diagramId: diagramId,
        elementId: element.id,
      });

      if (witInfo) {
        // Check if it's an error response
        if (witInfo.isError) {
          const errorMessage = witInfo.content[0].text;
          if (errorMessage.includes("not a WASM component")) {
            console.log(
              "Skipping WIT info - not a WASM component:",
              errorMessage,
            );
            return; // This is expected for non-WASM components
          } else {
            console.warn("Error fetching WIT info:", errorMessage);
            element.properties = {
              ...element.properties,
              interfaces: [],
              status: "error",
              witError: errorMessage,
            };
            return;
          }
        }

        // Parse the successful response
        const witData = JSON.parse(witInfo.content[0].text);
        console.log("WIT data received:", witData);

        // Convert WIT data to interface format expected by renderer
        const interfaces: Array<{
          name: string;
          type: "import" | "export";
          functions: Array<{ name: string }>;
        }> = [];

        // Add imports as input interfaces
        if (witData.imports) {
          witData.imports.forEach((imp) => {
            interfaces.push({
              name: imp.name || imp.interface_name || "import",
              interface_type: "import",
              type: "import",
              direction: "input",
              functions: imp.functions || [],
            });
          });
        }

        // Add exports as output interfaces
        if (witData.exports) {
          witData.exports.forEach((exp) => {
            interfaces.push({
              name: exp.name || exp.interface_name || "export",
              interface_type: "export",
              type: "export",
              direction: "output",
              functions: exp.functions || [],
            });
          });
        }

        console.log("Processed interfaces:", interfaces);

        // Update the element's properties with WIT data
        element.properties = {
          ...element.properties,
          interfaces: interfaces,
          witInfo: witData,
          status: "available",
          importsCount: witData.summary?.importsCount || 0,
          exportsCount: witData.summary?.exportsCount || 0,
          totalFunctions: witData.summary?.totalFunctions || 0,
          dependenciesCount: witData.summary?.dependenciesCount || 0,
        };

        console.log(
          "Updated element properties with interfaces:",
          element.properties.interfaces,
        );

        // Update the element in the backend to persist the interface data
        try {
          await mcpClient.callTool("update_element", {
            diagramId: diagramId,
            elementId: element.id,
            properties: {
              interfaces: interfaces,
              witInfo: witData,
              status: "available",
              importsCount: witData.summary?.importsCount || 0,
              exportsCount: witData.summary?.exportsCount || 0,
              totalFunctions: witData.summary?.totalFunctions || 0,
              dependenciesCount: witData.summary?.dependenciesCount || 0,
            },
          });
          console.log(
            "Persisted interface data to backend for element:",
            element.id,
          );

          // No need to reload entire diagram - just trigger a re-render
          if (this.renderer) {
            this.renderer.render();
            console.log("Re-rendered diagram with updated interfaces");
          }
        } catch (updateError) {
          console.error("Failed to persist interface data:", updateError);
        }
      } else {
        console.warn("Failed to fetch WIT info:", witInfo?.content[0]?.text);
        element.properties = {
          ...element.properties,
          interfaces: [],
          status: "error",
          witError: "Could not load WIT information",
        };
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const isFileNotFound =
        errorMessage.includes("file not found") ||
        errorMessage.includes("not found");
      const isJsonError =
        error instanceof SyntaxError && errorMessage.includes("JSON");

      // Handle different error types
      if (isJsonError) {
        console.log(
          `WIT info: Skipping non-WASM component ${element.id} (${
            element.label || "unnamed"
          })`,
        );
        // Don't set error properties for non-WASM components
        return;
      } else if (isFileNotFound) {
        console.log(
          `WIT info: Component file not found for ${element.id} (${
            element.label || "unnamed"
          }) - this is expected for placeholder components`,
        );
      } else {
        console.error("Error fetching WIT info:", error);
      }

      element.properties = {
        ...element.properties,
        interfaces: [],
        status: isFileNotFound ? "missing" : "error",
        witError: isFileNotFound
          ? "Component file not found"
          : "Error loading WIT information",
      };
    }

    // Trigger a re-render to show the updated interface circles
    this.renderer.render();
  }

  // Method to pre-fetch WIT data for all WASM components in a diagram
  public async preloadWitDataForDiagram(): Promise<void> {
    const currentDiagram = this.renderer.getCurrentDiagram();
    if (!currentDiagram?.elements) return;

    // Convert elements object to array and filter for WASM components without interface data
    const wasmComponents = Object.values(currentDiagram.elements).filter(
      (el: {
        type?: string;
        element_type?: string;
        properties?: { interfaces?: unknown[] };
      }) =>
        (el.type === "wasm-component" ||
          el.element_type === "wasm-component") &&
        (!el.properties?.interfaces || el.properties.interfaces.length === 0),
    );

    console.log(
      `Pre-loading WIT data for ${wasmComponents.length} WASM components`,
    );

    // Fetch WIT data for all components in parallel
    await Promise.allSettled(
      wasmComponents.map((component) => this.fetchAndStoreWitInfo(component)),
    );

    // Force re-render after loading interface data
    if (wasmComponents.length > 0) {
      this.renderer.render();
      console.log(`Completed pre-loading WIT data and re-rendered diagram`);
    }
  }

  private async openComponentExecutionView(elementId: string): Promise<void> {
    if (!this.wasmComponentManager) return;

    const loadedComponent =
      await this.wasmComponentManager.getComponent(elementId);
    if (!loadedComponent) return;

    // Create and open execution view modal
    this.createExecutionView(elementId, loadedComponent);
  }

  private createExecutionView(
    elementId: string,
    loadedComponent: import("../wasm/WasmComponentManager.js").WasmComponent,
  ): void {
    // Create modal overlay
    const modal = document.createElement("div");
    modal.className = "execution-view-modal";
    modal.innerHTML = `
            <div class="execution-view-content">
                <div class="execution-view-header">
                    <h2>🚀 ${loadedComponent.name} - Execution View</h2>
                    <button class="close-btn" onclick="this.closest('.execution-view-modal').remove()">✖</button>
                </div>
                <div class="execution-view-body">
                    <!-- Component Information Section -->
                    <div class="component-info">
                        <div class="info-grid">
                            <div class="info-item">
                                <strong>Component:</strong> ${loadedComponent.name}
                            </div>
                            <div class="info-item">
                                <strong>Status:</strong> <span class="status-badge status-ready">Ready</span>
                            </div>
                            <div class="info-item">
                                <strong>Loaded:</strong> ${loadedComponent.loadedAt}
                            </div>
                            <div class="info-item">
                                <strong>Path:</strong> <span class="component-path">${loadedComponent.path}</span>
                            </div>
                        </div>
                    </div>

                    <!-- Execution Metrics Dashboard -->
                    <div class="execution-metrics">
                        <h3>📊 Execution Metrics</h3>
                        <div class="metrics-grid">
                            <div class="metric-card">
                                <div class="metric-label">Memory Usage</div>
                                <div class="metric-value" id="memory-usage-${elementId}">0 KB</div>
                            </div>
                            <div class="metric-card">
                                <div class="metric-label">Execution Time</div>
                                <div class="metric-value" id="execution-time-${elementId}">0ms</div>
                            </div>
                            <div class="metric-card">
                                <div class="metric-label">Function Calls</div>
                                <div class="metric-value" id="function-calls-${elementId}">0</div>
                            </div>
                            <div class="metric-card">
                                <div class="metric-label">Last Execution</div>
                                <div class="metric-value" id="last-execution-${elementId}">Never</div>
                            </div>
                        </div>
                    </div>

                    <!-- Execution Controls -->
                    <div class="execution-controls">
                        <h3>🎮 Execution Controls</h3>
                        <div class="controls-grid">
                            <button class="control-btn primary" onclick="window.startComponentExecution('${elementId}')">
                                ▶️ Start Execution
                            </button>
                            <button class="control-btn secondary" onclick="window.stopComponentExecution('${elementId}')">
                                ⏹️ Stop Execution
                            </button>
                            <button class="control-btn secondary" onclick="window.resetComponentState('${elementId}')">
                                🔄 Reset State
                            </button>
                            <button class="control-btn secondary" onclick="window.inspectComponentState('${elementId}')">
                                🔍 Inspect State
                            </button>
                        </div>
                    </div>

                    <div class="javascript-examples">
                        <h3>📝 JavaScript Examples</h3>
                        <div class="code-examples" id="code-examples-${elementId}">
                            <div class="loading-container" style="background: #1e1e1e; padding: 20px; display: flex; align-items: center; justify-content: center;">
                                <div class="loading-pulse">
                                    <span style="background: #654FF0;"></span>
                                    <span style="background: #654FF0;"></span>
                                    <span style="background: #654FF0;"></span>
                                </div>
                                <span style="color: #7D8590; margin-left: 12px;">Generating JavaScript examples...</span>
                            </div>
                        </div>
                    </div>

                    <div class="execution-console">
                        <h3>💻 Interactive Console</h3>
                        <div class="console-output" id="console-${elementId}">
                            <div class="console-welcome">🚀 Component execution console ready. Type JavaScript commands to interact with the component.</div>
                        </div>
                        <div class="console-input">
                            <input type="text" placeholder="Enter JavaScript to execute..." id="console-input-${elementId}">
                            <button onclick="window.executeWasmCode('${elementId}')">Run</button>
                        </div>
                    </div>
                </div>
            </div>
        `;

    // Style the modal
    Object.assign(modal.style, {
      position: "fixed",
      top: "0",
      left: "0",
      width: "100%",
      height: "100%",
      backgroundColor: "rgba(0, 0, 0, 0.8)",
      zIndex: "10000",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
    });

    // Add CSS for the modal content
    const style = document.createElement("style");
    style.textContent = `
            .execution-view-content {
                background: white;
                border-radius: 12px;
                width: 90%;
                max-width: 800px;
                max-height: 80%;
                display: flex;
                flex-direction: column;
                box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
            }
            .execution-view-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 20px;
                border-bottom: 1px solid #eee;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                border-radius: 12px 12px 0 0;
            }
            .execution-view-header h2 {
                margin: 0;
                font-size: 1.2rem;
            }
            .close-btn {
                background: rgba(255, 255, 255, 0.2);
                border: none;
                color: white;
                width: 30px;
                height: 30px;
                border-radius: 50%;
                cursor: pointer;
                font-size: 14px;
            }
            .execution-view-body {
                padding: 20px;
                overflow-y: auto;
                flex: 1;
            }
            .component-info {
                background: #f8f9fa;
                padding: 15px;
                border-radius: 8px;
                margin-bottom: 20px;
            }
            .info-grid {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 12px;
            }
            .info-item {
                padding: 8px 0;
            }
            .status-badge {
                padding: 4px 8px;
                border-radius: 12px;
                font-size: 11px;
                font-weight: 600;
                text-transform: uppercase;
            }
            .status-ready {
                background: #d4edda;
                color: #155724;
            }
            .component-path {
                font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
                font-size: 11px;
                background: #e9ecef;
                padding: 2px 6px;
                border-radius: 4px;
            }
            .execution-metrics {
                margin-bottom: 20px;
            }
            .metrics-grid {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
                gap: 12px;
                margin-top: 12px;
            }
            .metric-card {
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                padding: 16px;
                border-radius: 8px;
                text-align: center;
            }
            .metric-label {
                font-size: 11px;
                text-transform: uppercase;
                opacity: 0.8;
                margin-bottom: 8px;
            }
            .metric-value {
                font-size: 18px;
                font-weight: 600;
            }
            .execution-controls {
                margin-bottom: 20px;
            }
            .controls-grid {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
                gap: 12px;
                margin-top: 12px;
            }
            .control-btn {
                padding: 12px 16px;
                border: none;
                border-radius: 6px;
                font-size: 13px;
                font-weight: 500;
                cursor: pointer;
                transition: all 0.2s ease;
            }
            .control-btn.primary {
                background: #28a745;
                color: white;
            }
            .control-btn.primary:hover {
                background: #218838;
            }
            .control-btn.secondary {
                background: #6c757d;
                color: white;
            }
            .control-btn.secondary:hover {
                background: #5a6268;
            }
            .console-welcome {
                color: #0ff;
                font-style: italic;
                padding: 5px 0;
                border-bottom: 1px solid #333;
                margin-bottom: 10px;
            }
            .javascript-examples {
                margin-bottom: 20px;
            }
            .code-examples {
                background: #1e1e1e;
                color: #d4d4d4;
                padding: 15px;
                border-radius: 8px;
                font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
                font-size: 12px;
                max-height: 300px;
                overflow-y: auto;
            }
            .execution-console {
                border: 1px solid #ddd;
                border-radius: 8px;
                overflow: hidden;
            }
            .console-output {
                background: #000;
                color: #0f0;
                padding: 15px;
                min-height: 150px;
                max-height: 200px;
                overflow-y: auto;
                font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
                font-size: 12px;
            }
            .console-input {
                display: flex;
                padding: 10px;
                background: #f8f9fa;
            }
            .console-input input {
                flex: 1;
                padding: 8px;
                border: 1px solid #ddd;
                border-radius: 4px;
                margin-right: 10px;
            }
            .console-input button {
                background: #007bff;
                color: white;
                border: none;
                padding: 8px 16px;
                border-radius: 4px;
                cursor: pointer;
            }
        `;

    document.head.appendChild(style);
    document.body.appendChild(modal);

    // Generate JavaScript examples
    this.generateJavaScriptExamples(elementId, loadedComponent);

    // Set up console execution
    this.setupConsoleExecution(elementId, loadedComponent);

    // Set up execution monitoring
    this.setupExecutionMonitoring(elementId, loadedComponent);

    // Set up execution controls
    this.setupExecutionControls(elementId, loadedComponent);
  }

  private generateJavaScriptExamples(
    elementId: string,
    loadedComponent: import("../wasm/WasmComponentManager.js").WasmComponent,
  ): void {
    const examplesContainer = document.getElementById(
      `code-examples-${elementId}`,
    );
    if (!examplesContainer) return;

    // Generate examples based on component interfaces
    const examples = this.createJavaScriptExamples(loadedComponent);

    examplesContainer.innerHTML = examples;
  }

  private createJavaScriptExamples(
    loadedComponent: import("../wasm/WasmComponentManager.js").WasmComponent,
  ): string {
    // Generate examples based on actual component interfaces when available

    const componentName = loadedComponent.name;
    const examples = `
// 🚀 Example 1: Initialize ${componentName}
const ${componentName.replace(/-/g, "_")} = await wasmComponent.instantiate();
console.log('Component initialized:', ${componentName.replace(/-/g, "_")});

// 📡 Example 2: Call main processing function
const sensorData = {
    timestamp: Date.now(),
    data: [1.0, 2.0, 3.0, 4.0]
};

const result = await ${componentName.replace(/-/g, "_")}.process(sensorData);
console.log('Processing result:', result);

// 🔧 Example 3: Check component status
const status = await ${componentName.replace(/-/g, "_")}.getStatus();
console.log('Component status:', status);

// 🎯 Example 4: Configure component
await ${componentName.replace(/-/g, "_")}.configure({
    mode: 'production',
    sensitivity: 0.8,
    debug: false
});

// 🔄 Example 5: Process continuous data stream
const processStream = async () => {
    for (let i = 0; i < 10; i++) {
        const data = generateRandomSensorData();
        const output = await ${componentName.replace(/-/g, "_")}.process(data);
        console.log(\`Step \${i + 1}:\`, output);
        await sleep(100); // Wait 100ms between calls
    }
};

// Helper functions
function generateRandomSensorData() {
    return {
        timestamp: Date.now(),
        data: Array.from({length: 4}, () => Math.random() * 10)
    };
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
        `;

    return examples;
  }

  private setupConsoleExecution(
    elementId: string,
    loadedComponent: import("../wasm/WasmComponentManager.js").WasmComponent,
  ): void {
    // Make the execution function globally available
    window.executeWasmCode = (id: string) => {
      if (id !== elementId) return;

      const input = document.getElementById(
        `console-input-${elementId}`,
      ) as HTMLInputElement;
      const output = document.getElementById(`console-${elementId}`);

      if (!input || !output) return;

      const code = input.value.trim();
      if (!code) return;

      // Add the input to console output
      output.innerHTML += `<div style="color: #fff;">> ${code}</div>`;

      try {
        // Create a safe execution context
        const result = this.executeWasmCode(code, loadedComponent);
        output.innerHTML += `<div style="color: #0f0;">${result}</div>`;
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        output.innerHTML += `<div style="color: #f00;">Error: ${errorMessage}</div>`;
      }

      // Clear input and scroll to bottom
      input.value = "";
      output.scrollTop = output.scrollHeight;
    };

    // Handle Enter key in input
    const input = document.getElementById(
      `console-input-${elementId}`,
    ) as HTMLInputElement;
    if (input) {
      input.addEventListener("keypress", (e) => {
        if (e.key === "Enter") {
          window.executeWasmCode?.(elementId);
        }
      });
    }
  }

  private executeWasmCode(
    code: string,
    loadedComponent: import("../wasm/WasmComponentManager.js").WasmComponent,
  ): string {
    // Safely execute JavaScript code with access to the loaded WASM component
    // Create a safe execution context with the loaded component
    const context = {
      wasmComponent: loadedComponent,
      componentName: loadedComponent.name,
      console: {
        log: (...args: unknown[]) => JSON.stringify(args),
      },
    };

    // Simple evaluation (in a real implementation, this should be more secure)
    const func = new Function(
      "context",
      `
            const { wasmComponent, componentName, console } = context;
            return ${code};
        `,
    );

    const result = func(context);
    return JSON.stringify(result, null, 2);
  }

  private handleKeyboardShortcut(event: KeyboardEvent): void {
    const diagramId = this.diagramService.getCurrentDiagramId();
    if (!diagramId) return;

    if (event.ctrlKey || event.metaKey) {
      switch (event.key) {
        case "n":
          event.preventDefault();
          this.createNewDiagram();
          break;
        case "s":
          event.preventDefault();
          this.diagramService.saveDiagram(diagramId);
          break;
        case "=":
        case "+":
          event.preventDefault();
          this.renderer.zoom(1.2);
          break;
        case "-":
          event.preventDefault();
          this.renderer.zoom(0.8);
          break;
        case "0":
          event.preventDefault();
          this.renderer.fitToContent();
          break;
        case "r":
          event.preventDefault();
          this.renderer.resetView();
          break;
        case "a":
          event.preventDefault();
          this.selectAll();
          break;
        case "w":
          event.preventDefault();
          this.closeDiagram();
          break;
      }
    }

    switch (event.key) {
      case "Delete":
      case "Backspace":
        event.preventDefault();
        this.deleteSelected();
        break;
      case "Escape":
        event.preventDefault();
        this.clearSelection();
        break;
      case " ":
        // Space key for pan mode - this is handled separately in mouse events
        break;
    }
  }

  private async createNewDiagram(): Promise<void> {
    try {
      console.log("Creating new diagram via keyboard shortcut...");
      const newDiagram = await this.diagramService.createNewDiagram(
        "workflow",
        "New Diagram",
      );
      if (newDiagram) {
        const loadedDiagram = await this.diagramService.loadDiagram(newDiagram);
        if (loadedDiagram) {
          this.renderer.setDiagram(loadedDiagram);
          console.log("New diagram created:", newDiagram);
        }
      }
    } catch (error) {
      console.error("Failed to create new diagram:", error);
    }
  }

  private selectAll(): void {
    try {
      console.log("Select all triggered via keyboard shortcut");
      const currentDiagram = this.renderer.getCurrentDiagram();
      if (currentDiagram && currentDiagram.elements) {
        // Select all elements in the current diagram
        const allElementIds = Object.keys(currentDiagram.elements);
        this.renderer.selectionManager.selectAll(allElementIds);
        this.renderer.renderImmediate();
      }
    } catch (error) {
      console.error("Failed to select all:", error);
    }
  }

  private async deleteSelected(): Promise<void> {
    try {
      const diagramId = this.diagramService.getCurrentDiagramId();
      if (!diagramId) return;

      console.log("Delete selected triggered via keyboard shortcut");

      // Get selected elements from the renderer
      const renderer = this.renderer as {
        selectedElements?: unknown[];
        diagram?: unknown;
      };
      if (
        !renderer.selectionManager ||
        !renderer.selectionManager.getSelectedElements
      ) {
        console.log("No selection manager available");
        return;
      }

      // Get the current diagram from the renderer
      const currentDiagram = renderer.getCurrentDiagram
        ? renderer.getCurrentDiagram()
        : renderer.currentDiagram;
      if (!currentDiagram || !currentDiagram.elements) {
        console.log("No diagram or elements available");
        return;
      }

      // Get selected elements
      const selectedElements = renderer.selectionManager.getSelectedElements(
        currentDiagram.elements,
      );
      if (!selectedElements || selectedElements.length === 0) {
        console.log("No elements selected to delete");
        return;
      }

      console.log(`Deleting ${selectedElements.length} selected element(s)`);

      // Set saving status before deletion
      statusManager.setDiagramSyncStatus("saving");

      // Delete each selected element
      let deleteCount = 0;
      for (const element of selectedElements) {
        if (element.id) {
          try {
            await this.mcpService.callTool("delete_element", {
              diagramId,
              elementId: element.id,
            });
            console.log(`Deleted element: ${element.id}`);
            deleteCount++;
          } catch (error) {
            console.error(`Failed to delete element ${element.id}:`, error);
          }
        }
      }

      // Clear selection after deletion
      if (renderer.selectionManager.clearSelection) {
        renderer.selectionManager.clearSelection();
      }

      // Reload the diagram to reflect changes
      const updatedDiagram = await this.diagramService.loadDiagram(diagramId);
      if (updatedDiagram) {
        this.renderer.setDiagram(updatedDiagram);
      }

      // Update status to show the diagram is saved (following the same pattern as createNode/createEdge)
      if (deleteCount > 0) {
        statusManager.setDiagramSaved();
        console.log(
          `Successfully deleted ${deleteCount} element(s) and saved to server`,
        );
      } else {
        statusManager.setDiagramSyncStatus(
          "error",
          "Failed to delete elements",
        );
      }
    } catch (error) {
      console.error("Failed to delete selected elements:", error);
      statusManager.setDiagramSyncStatus(
        "error",
        error instanceof Error ? error.message : "Unknown error",
      );
    }
  }

  private clearSelection(): void {
    try {
      console.log("Clear selection triggered via keyboard shortcut");
      this.renderer.selectionManager.clearSelection();
      this.renderer.renderImmediate();
    } catch (error) {
      console.error("Failed to clear selection:", error);
    }
  }

  private closeDiagram(): void {
    try {
      console.log("Close diagram triggered via keyboard shortcut (Ctrl+W)");
      statusManager.clearCurrentDiagram();
      window.dispatchEvent(new CustomEvent("diagram-close-requested"));
      // Force header icon update
      window.dispatchEvent(new CustomEvent("force-header-icon-update"));
    } catch (error) {
      console.error("Failed to close diagram:", error);
    }
  }

  private async handleDragEnd(_event: InteractionEvent): Promise<void> {
    try {
      const diagramId = this.diagramService.getCurrentDiagramId();
      if (!diagramId) return;

      // Get current diagram and its elements from the renderer
      const renderer = this.renderer as {
        selectedElements?: unknown[];
        diagram?: unknown;
      };
      if (
        renderer.selectionManager &&
        renderer.selectionManager.getSelectedElements
      ) {
        // Get the current diagram from the renderer
        const currentDiagram = renderer.getCurrentDiagram
          ? renderer.getCurrentDiagram()
          : renderer.currentDiagram;
        if (!currentDiagram || !currentDiagram.elements) {
          console.log("No diagram or elements available for auto-save");
          return;
        }

        // Get selected elements with full data including positions
        const selectedElements = renderer.selectionManager.getSelectedElements(
          currentDiagram.elements,
        );

        if (selectedElements && selectedElements.length > 0) {
          console.log(
            `Scheduling auto-save for ${selectedElements.length} moved element(s)`,
          );

          // Debounce the auto-save to prevent excessive server requests
          this.scheduleAutoSave(diagramId, selectedElements);
        }
      }
    } catch (error) {
      console.error("Failed to auto-save element positions after drag:", error);
    }
  }

  private scheduleAutoSave(
    diagramId: string,
    selectedElements: import("../model/diagram.js").ModelElement[],
  ): void {
    // Clear any existing timeout
    if (this.autoSaveTimeout) {
      clearTimeout(this.autoSaveTimeout);
    }

    // Check if we're in interface view mode - skip auto-save since it's a transformed view
    if (this.viewModeManager) {
      const currentViewMode = this.viewModeManager.getCurrentViewMode();
      if (
        currentViewMode === "wit-interface" ||
        currentViewMode === "wit-dependencies"
      ) {
        console.log(
          `Skipping auto-save in ${currentViewMode} mode - this is a transformed view`,
        );
        return;
      }
    }

    // Mark that an auto-save is pending
    this.pendingAutoSave = true;

    // Schedule auto-save with 500ms debounce
    this.autoSaveTimeout = window.setTimeout(async () => {
      try {
        console.log(
          `Auto-saving positions for ${selectedElements.length} moved element(s)`,
        );
        await this.diagramService.updateSelectedElementPositions(
          diagramId,
          selectedElements as import("../services/DiagramService.js").ElementWithBounds[],
        );
        this.pendingAutoSave = false;
      } catch (error) {
        console.error("Debounced auto-save failed:", error);
        this.pendingAutoSave = false;
      }
    }, 500); // 500ms debounce delay
  }

  private handleSpaceKeyDown(event: KeyboardEvent): void {
    // Only trigger if not in an input field and space not already pressed
    if (
      event.target instanceof HTMLInputElement ||
      event.target instanceof HTMLTextAreaElement ||
      event.target instanceof HTMLSelectElement ||
      this.spacePressed
    ) {
      return;
    }

    if (event.code === "Space") {
      event.preventDefault();
      this.spacePressed = true;
      this.originalMode = this.currentMode;
      this.currentMode = "pan";
      this.renderer.setInteractionMode("pan");
      console.log("Space pressed - entering temporary pan mode");
    }
  }

  private handleSpaceKeyUp(event: KeyboardEvent): void {
    if (event.code === "Space" && this.spacePressed) {
      event.preventDefault();
      this.spacePressed = false;
      this.currentMode = this.originalMode;
      this.renderer.setInteractionMode(this.originalMode);
      console.log("Space released - returning to", this.originalMode, "mode");
    }
  }

  private async handleInterfaceClick(event: InteractionEvent): Promise<void> {
    if (!event.interfaceInfo) return;

    const { interfaceInfo } = event;

    // Get current diagram for finding compatible interfaces
    const diagramId = this.diagramService.getCurrentDiagramId();
    if (!diagramId) return;

    const currentDiagram = this.renderer.getCurrentDiagram();
    if (!currentDiagram) return;

    // Convert interface info to WitInterface format
    const sourceInterface: WitInterface = {
      name: interfaceInfo.interface.name || "unknown",
      interface_type: interfaceInfo.interfaceType,
      functions: interfaceInfo.interface.functions || [],
      types: interfaceInfo.interface.types || [],
    };

    // Find all available interfaces in the diagram
    const availableInterfaces: Array<{
      componentId: string;
      interface: WitInterface;
    }> = [];

    Object.values(currentDiagram.elements).forEach((element) => {
      const elementType = element.type || element.element_type;
      if (
        elementType === "wasm-component" &&
        element.id !== interfaceInfo.componentId
      ) {
        const interfaces = element.properties?.interfaces || [];
        interfaces.forEach(
          (iface: {
            name?: string;
            interface_type?: string;
            functions?: unknown[];
            types?: unknown[];
          }) => {
            const witInterface: WitInterface = {
              name: iface.name || "unknown",
              interface_type:
                (iface.interface_type as "import" | "export") || "export",
              functions: (iface.functions as WitFunction[]) || [],
              types: (iface.types as WitType[]) || [],
            };
            availableInterfaces.push({
              componentId: element.id,
              interface: witInterface,
            });
          },
        );
      }
    });

    // Find compatible interfaces
    const compatibleInterfaces =
      InterfaceCompatibilityChecker.findCompatibleInterfaces(
        sourceInterface,
        availableInterfaces,
      );

    if (compatibleInterfaces.length === 0) {
      console.log("No compatible interfaces found");
      // TODO: Show a notification to the user
      return;
    }

    // Prepare dialog options
    const connectionOptions: InterfaceConnectionOption[] =
      compatibleInterfaces.map((result) => ({
        componentId: result.componentId,
        componentName:
          currentDiagram.elements[result.componentId]?.label?.toString() ||
          currentDiagram.elements[
            result.componentId
          ]?.properties?.componentName?.toString() ||
          result.componentId,
        interface: result.interface,
        compatibility: result.compatibility,
      }));

    // Show interface connection dialog
    const dialog = new InterfaceConnectionDialog({
      sourceComponentId: interfaceInfo.componentId,
      sourceComponentName:
        currentDiagram.elements[interfaceInfo.componentId]?.label?.toString() ||
        currentDiagram.elements[
          interfaceInfo.componentId
        ]?.properties?.componentName?.toString() ||
        interfaceInfo.componentId,
      sourceInterface: sourceInterface,
      availableInterfaces: connectionOptions,
      position: interfaceInfo.connectorPosition,
    });

    // Handle connection creation
    dialog.onConnection(async (selectedOption) => {
      // Validate connection before creating
      if (
        this.validateInterfaceConnection(
          sourceInterface,
          selectedOption.interface,
        )
      ) {
        await this.createInterfaceConnection(
          interfaceInfo.componentId,
          sourceInterface,
          selectedOption.componentId,
          selectedOption.interface,
          selectedOption.compatibility,
        );
      }
    });

    dialog.show();
  }

  private async handleComponentDoubleClick(
    event: InteractionEvent,
  ): Promise<void> {
    if (!event.element) return;

    console.log(
      "handleComponentDoubleClick: Processing double-click for element:",
      event.element.id,
    );

    // Check if this is a WASM component
    const isWasmComponent =
      event.element.type === "wasm-component" ||
      event.element.element_type === "wasm-component" ||
      event.element.properties?.componentType === "wasm-component";

    if (isWasmComponent) {
      console.log(
        "handleComponentDoubleClick: Opening execution view for WASM component:",
        event.element.id,
      );
      await this.openComponentExecutionView(event.element.id);
    } else {
      console.log(
        "handleComponentDoubleClick: Element is not a WASM component, ignoring",
      );
    }
  }

  private validateInterfaceConnection(
    sourceInterface: WitInterface,
    targetInterface: WitInterface,
  ): boolean {
    // Check basic connectivity rules
    if (
      !InterfaceCompatibilityChecker.canConnect(
        sourceInterface,
        targetInterface,
      )
    ) {
      this.showConnectionError(
        "Connection not allowed: Export interfaces can only connect to Import interfaces",
      );
      return false;
    }

    // Check compatibility score
    const compatibility = InterfaceCompatibilityChecker.checkCompatibility(
      sourceInterface,
      targetInterface,
    );
    if (!compatibility.isValid) {
      const issues = compatibility.issues.join(", ");
      this.showConnectionError(`Interface compatibility issues: ${issues}`);
      return false;
    }

    return true;
  }

  private async createInterfaceConnection(
    sourceComponentId: string,
    sourceInterface: WitInterface,
    targetComponentId: string,
    targetInterface: WitInterface,
    compatibility?: import("../diagrams/interface-compatibility.js").InterfaceCompatibility,
  ): Promise<void> {
    const diagramId = this.diagramService.getCurrentDiagramId();
    if (!diagramId) return;

    try {
      statusManager.setDiagramSyncStatus("saving");

      // Create edge with interface metadata
      await this.mcpService.createEdge(
        diagramId,
        "interface-connection",
        sourceComponentId,
        targetComponentId,
        `${sourceInterface.name} → ${targetInterface.name}`,
      );

      // TODO: Add interface-specific metadata to the edge
      console.log("Interface connection created:", {
        source: {
          component: sourceComponentId,
          interface: sourceInterface.name,
        },
        target: {
          component: targetComponentId,
          interface: targetInterface.name,
        },
      });

      // Reload diagram to show the new connection
      await this.diagramService.loadDiagram(diagramId);
      statusManager.setDiagramSaved();

      // Show success notification
      this.showConnectionSuccess(
        sourceInterface,
        targetInterface,
        compatibility,
      );
    } catch (error) {
      console.error("Failed to create interface connection:", error);
      statusManager.setDiagramSyncStatus(
        "error",
        error instanceof Error ? error.message : "Unknown error",
      );
      this.showConnectionError(
        `Failed to create connection: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      );
    }
  }

  private showConnectionSuccess(
    sourceInterface: WitInterface,
    targetInterface: WitInterface,
    compatibility?: import("../diagrams/interface-compatibility.js").InterfaceCompatibility,
  ): void {
    const compatibilityScore = compatibility
      ? ` (${compatibility.score}% compatible)`
      : "";
    const message = `✅ Connected "${sourceInterface.name}" → "${targetInterface.name}"${compatibilityScore}`;

    // Show temporary success notification
    this.showNotification(message, "success");
    console.log("Interface connection created successfully:", {
      source: sourceInterface.name,
      target: targetInterface.name,
      compatibility: compatibility,
    });
  }

  private showConnectionError(message: string): void {
    // Show temporary error notification
    this.showNotification(`❌ ${message}`, "error");
    console.error("Interface connection error:", message);
  }

  private showNotification(message: string, type: "success" | "error"): void {
    // Create temporary notification element
    const notification = document.createElement("div");
    notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 12px 20px;
            border-radius: 6px;
            color: white;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            font-size: 14px;
            font-weight: 500;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
            z-index: 10000;
            max-width: 400px;
            animation: slideInRight 0.3s ease-out;
            background: ${type === "success" ? "#28a745" : "#dc3545"};
        `;

    notification.textContent = message;
    document.body.appendChild(notification);

    // Add animation keyframes
    if (!document.getElementById("notification-styles")) {
      const style = document.createElement("style");
      style.id = "notification-styles";
      style.textContent = `
                @keyframes slideInRight {
                    from { transform: translateX(100%); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                }
                @keyframes slideOutRight {
                    from { transform: translateX(0); opacity: 1; }
                    to { transform: translateX(100%); opacity: 0; }
                }
            `;
      document.head.appendChild(style);
    }

    // Auto-remove after 4 seconds
    setTimeout(() => {
      notification.style.animation = "slideOutRight 0.3s ease-in forwards";
      setTimeout(() => {
        document.body.removeChild(notification);
      }, 300);
    }, 4000);
  }

  private setupExecutionMonitoring(
    elementId: string,
    loadedComponent: import("../wasm/WasmComponentManager.js").WasmComponent,
  ): void {
    // Initialize metrics tracking
    const componentMetrics = {
      memoryUsage: 0,
      executionTime: 0,
      functionCalls: 0,
      lastExecution: null as Date | null,
      isRunning: false,
    };

    // Store metrics globally for access by control functions
    (window as any)[`componentMetrics_${elementId}`] = componentMetrics;

    // Start monitoring loop
    const updateMetrics = () => {
      if (componentMetrics.isRunning) {
        // Simulate metric updates (in real implementation, get from WASM runtime)
        componentMetrics.memoryUsage += Math.random() * 10;
        componentMetrics.executionTime += 16; // Assume 16ms per frame

        // Update UI
        const memoryElement = document.getElementById(
          `memory-usage-${elementId}`,
        );
        const timeElement = document.getElementById(
          `execution-time-${elementId}`,
        );
        const callsElement = document.getElementById(
          `function-calls-${elementId}`,
        );
        const lastExecElement = document.getElementById(
          `last-execution-${elementId}`,
        );

        if (memoryElement)
          memoryElement.textContent = `${Math.round(
            componentMetrics.memoryUsage,
          )} KB`;
        if (timeElement)
          timeElement.textContent = `${componentMetrics.executionTime}ms`;
        if (callsElement)
          callsElement.textContent = componentMetrics.functionCalls.toString();
        if (lastExecElement && componentMetrics.lastExecution) {
          lastExecElement.textContent =
            componentMetrics.lastExecution.toLocaleTimeString();
        }
      }

      // Continue monitoring if component is still loaded
      if (document.getElementById(`memory-usage-${elementId}`)) {
        setTimeout(updateMetrics, 1000); // Update every second
      }
    };

    // Start monitoring
    updateMetrics();
  }

  private setupExecutionControls(
    elementId: string,
    loadedComponent: import("../wasm/WasmComponentManager.js").WasmComponent,
  ): void {
    // Set up global control functions
    (window as any).startComponentExecution = async (id: string) => {
      if (id !== elementId) return;

      const metrics = (window as any)[`componentMetrics_${id}`];
      if (metrics && !metrics.isRunning) {
        try {
          metrics.isRunning = true;
          metrics.lastExecution = new Date();
          console.log(
            `Starting real server-side execution for component: ${loadedComponent.name}`,
          );

          // Update console
          const consoleOutput = document.getElementById(`console-${id}`);
          if (consoleOutput) {
            const message = document.createElement("div");
            message.style.color = "#0f0";
            message.textContent = `> Starting server execution for ${loadedComponent.name}...`;
            consoleOutput.appendChild(message);
            consoleOutput.scrollTop = consoleOutput.scrollHeight;
          }

          // Execute component on server via MCP
          const executionResult = await this.executeComponentOnServer(
            loadedComponent,
            id,
          );

          if (executionResult) {
            // Update metrics with real data
            metrics.memoryUsage = executionResult.memory_usage_mb || 0;
            metrics.executionTime = executionResult.duration_ms || 0;
            metrics.functionCalls += 1;

            // Display results in console
            if (consoleOutput) {
              const resultMessage = document.createElement("div");
              resultMessage.style.color = executionResult.success
                ? "#0f0"
                : "#f00";
              resultMessage.textContent = `> ${
                executionResult.success ? "Success" : "Error"
              }: ${
                executionResult.output || executionResult.error || "No output"
              }`;
              consoleOutput.appendChild(resultMessage);
              consoleOutput.scrollTop = consoleOutput.scrollHeight;
            }
          }
        } catch (error) {
          console.error("Component execution failed:", error);

          // Update console with error
          const consoleOutput = document.getElementById(`console-${id}`);
          if (consoleOutput) {
            const errorMessage = document.createElement("div");
            errorMessage.style.color = "#f00";
            errorMessage.textContent = `> Execution failed: ${
              error instanceof Error ? error.message : "Unknown error"
            }`;
            consoleOutput.appendChild(errorMessage);
            consoleOutput.scrollTop = consoleOutput.scrollHeight;
          }
        } finally {
          metrics.isRunning = false;
        }
      }
    };

    (window as any).stopComponentExecution = (id: string) => {
      if (id !== elementId) return;

      const metrics = (window as any)[`componentMetrics_${id}`];
      if (metrics) {
        metrics.isRunning = false;
        console.log(
          `Stopping execution for component: ${loadedComponent.name}`,
        );

        // Update console
        const consoleOutput = document.getElementById(`console-${id}`);
        if (consoleOutput) {
          const message = document.createElement("div");
          message.style.color = "#ff0";
          message.textContent = `> Execution stopped for ${loadedComponent.name}`;
          consoleOutput.appendChild(message);
          consoleOutput.scrollTop = consoleOutput.scrollHeight;
        }
      }
    };

    (window as any).resetComponentState = (id: string) => {
      if (id !== elementId) return;

      const metrics = (window as any)[`componentMetrics_${id}`];
      if (metrics) {
        metrics.memoryUsage = 0;
        metrics.executionTime = 0;
        metrics.functionCalls = 0;
        metrics.lastExecution = null;
        metrics.isRunning = false;
        console.log(`Reset state for component: ${loadedComponent.name}`);

        // Update console
        const consoleOutput = document.getElementById(`console-${id}`);
        if (consoleOutput) {
          const message = document.createElement("div");
          message.style.color = "#0ff";
          message.textContent = `> Component state reset for ${loadedComponent.name}`;
          consoleOutput.appendChild(message);
          consoleOutput.scrollTop = consoleOutput.scrollHeight;
        }
      }
    };

    (window as any).inspectComponentState = (id: string) => {
      if (id !== elementId) return;

      const metrics = (window as any)[`componentMetrics_${id}`];
      if (metrics) {
        const stateInfo = {
          name: loadedComponent.name,
          path: loadedComponent.path,
          loadedAt: loadedComponent.loadedAt,
          metrics: {
            memoryUsage: `${Math.round(metrics.memoryUsage)} KB`,
            executionTime: `${metrics.executionTime}ms`,
            functionCalls: metrics.functionCalls,
            isRunning: metrics.isRunning,
            lastExecution: metrics.lastExecution?.toISOString() || "Never",
          },
        };

        console.log("Component State Inspection:", stateInfo);

        // Update console with detailed state info
        const consoleOutput = document.getElementById(`console-${id}`);
        if (consoleOutput) {
          const message = document.createElement("div");
          message.style.color = "#0ff";
          message.innerHTML = `
                        > Component State Inspection:<br>
                        &nbsp;&nbsp;Name: ${stateInfo.name}<br>
                        &nbsp;&nbsp;Status: ${
                          stateInfo.metrics.isRunning ? "Running" : "Stopped"
                        }<br>
                        &nbsp;&nbsp;Memory: ${stateInfo.metrics.memoryUsage}<br>
                        &nbsp;&nbsp;Execution Time: ${
                          stateInfo.metrics.executionTime
                        }<br>
                        &nbsp;&nbsp;Function Calls: ${
                          stateInfo.metrics.functionCalls
                        }<br>
                        &nbsp;&nbsp;Last Execution: ${
                          stateInfo.metrics.lastExecution
                        }
                    `;
          consoleOutput.appendChild(message);
          consoleOutput.scrollTop = consoleOutput.scrollHeight;
        }
      }
    };
  }

  /**
   * Execute component on server via MCP and return execution result
   */
  private async executeComponentOnServer(
    component: WasmComponent,
    executionId: string,
  ): Promise<ExecutionResult | null> {
    try {
      // Create execution parameters matching server expectations
      const executionParams = {
        componentName: component.name,
        method: "main", // Default method for WASM components
        args: {},
        timeout_ms: 30000, // 30 second timeout
        max_memory_mb: 512, // 512MB memory limit
      };

      // Execute component via MCP tool
      const executeResult = await this.mcpService.callTool(
        "execute_wasm_component",
        executionParams,
      );

      if (!executeResult.success) {
        console.error("Component execution failed:", executeResult.error);
        return null;
      }

      // Extract execution ID from server response
      const responseText = executeResult.result || "";
      const executionIdMatch = responseText.match(/ID:\s*([a-f0-9-]+)/);
      const serverExecutionId = executionIdMatch
        ? executionIdMatch[1]
        : executionId;

      console.log(`Server assigned execution ID: ${serverExecutionId}`);

      // Monitor execution progress
      let isComplete = false;
      const progressMonitor = setInterval(async () => {
        if (isComplete) return;

        try {
          const progressResource = await this.mcpService.readResource(
            `wasm://executions/${serverExecutionId}/progress`,
          );
          if (progressResource?.content) {
            const progress = JSON.parse(progressResource.content);
            console.log(
              `Execution ${serverExecutionId} progress:`,
              progress.stage,
              `${(progress.progress * 100).toFixed(1)}%`,
            );

            // Stop monitoring when complete or failed
            if (progress.stage === "Complete" || progress.stage === "Error") {
              isComplete = true;
              clearInterval(progressMonitor);
            }
          }
        } catch (error) {
          console.warn("Failed to read execution progress:", error);
        }
      }, 1000); // Check progress every second

      // Wait for execution to complete or timeout after 45 seconds
      const timeout = setTimeout(() => {
        isComplete = true;
        clearInterval(progressMonitor);
      }, 45000);

      // Wait for completion
      return new Promise((resolve) => {
        const checkCompletion = setInterval(async () => {
          if (isComplete) {
            clearInterval(checkCompletion);
            clearTimeout(timeout);

            try {
              // Get final execution result
              const resultResource = await this.mcpService.readResource(
                `wasm://executions/${serverExecutionId}/result`,
              );
              if (resultResource?.content) {
                const result = JSON.parse(resultResource.content);
                resolve({
                  execution_id: result.execution_id,
                  success: result.success,
                  result: result.result,
                  error: result.error,
                  duration_ms: result.execution_time_ms,
                  memory_usage_mb: result.memory_usage_mb,
                  output_data: result.output_data,
                  graphics_output: result.graphics_output,
                  completed_at: result.completed_at,
                });
              } else {
                resolve(null);
              }
            } catch (error) {
              console.error("Failed to read execution result:", error);
              resolve(null);
            }
          }
        }, 1000);
      });
    } catch (error) {
      console.error("Server execution failed:", error);
      return null;
    }
  }
}

/**
 * Execution result from server-side WASM execution
 */
interface ExecutionResult {
  execution_id: string;
  success: boolean;
  result?: any;
  error?: string;
  duration_ms: number;
  memory_usage_mb: number;
  output_data?: any;
  graphics_output?: any;
  completed_at: string;
}
