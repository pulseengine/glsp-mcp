import { McpService } from "./services/McpService.js";
import { DiagramService } from "./services/DiagramService.js";
import { UIManager } from "./ui/UIManager.js";
import { InteractionManager } from "./ui/InteractionManager.js"; // Ready for interaction features
import { CanvasRenderer } from "./renderer/canvas-renderer.js";
import { AIService } from "./services/AIService.js";
import { WasmRuntimeManager } from "./wasm/WasmRuntimeManager.js";
import { statusManager } from "./services/StatusManager.js";
import { BaseDialog } from "./ui/dialogs/base/BaseDialog.js";
import { WitVisualizationPanel } from "./wit/WitVisualizationPanel.js";
import { ViewSwitcher } from "./ui/ViewSwitcher.js";
import { ViewModeManager } from "./ui/ViewModeManager.js";
// import { WasmViewTransformer } from "./ui/WasmViewTransformer.js"; // Unused import
import { WasmComponent } from "./types/wasm-component.js";
import { serviceContainer } from "./core/ServiceContainer.js";
import {
  registerServices,
  getService,
  getServiceHealthDashboard,
} from "./core/ServiceRegistration.js";
import { integrationTester } from "./core/IntegrationTesting.js";
import { testComponentLoading } from "./debug/ComponentLoadingTest.js";
import { animationSystem, MicroInteractions } from "./animation/index.js";

// Debug interface for window properties
interface WindowDebug {
  testOllama: () => Promise<boolean>;
  appController: AppController;
  wasmRuntime: WasmRuntimeManager;
  uploadWasm: () => void;
  testSidebar: () => void;
  theme: import("./ui/ThemeController.js").ThemeController;
  toggleSidebar: () => void;
  checkSidebar: () => void;
  testWasm: () => void;
  selectDialog: (config?: unknown) => void;
  getStatus: () => unknown;
  checkMCP: () => Promise<boolean>;
  headerIcons: import("./ui/HeaderIconManager.js").HeaderIconManager;
  testAIMinimize: () => void;
  debugDialogs: () => void;
  testComponentLoading?: () => void;
}

declare global {
  interface Window {
    debug?: Partial<WindowDebug>;
    [key: string]: unknown; // For dynamic properties like deletion flags
  }
}

export class AppController {
  // Service references - populated after initialization
  private mcpService!: McpService;
  private diagramService!: DiagramService;
  public uiManager!: UIManager;
  private renderer!: CanvasRenderer;
  private _interactionManager!: InteractionManager; // TODO: Implement interaction features - ready for activation
  private aiService!: AIService;
  private wasmRuntimeManager!: WasmRuntimeManager;
  private witVisualizationPanel!: WitVisualizationPanel;
  private viewSwitcher!: ViewSwitcher;
  private viewModeManager!: ViewModeManager;

  constructor(private canvas: HTMLCanvasElement) {
    // Register all services with the container
    registerServices(canvas);

    // Initialize all services asynchronously
    this.initializeServices();
  }

  /**
   * Initialize all services using the ServiceContainer
   */
  private async initializeServices(): Promise<void> {
    try {
      console.log(
        "AppController: Starting service container initialization...",
      );

      // Initialize all services through the container
      await serviceContainer.initializeAll();

      // Get service references
      this.mcpService = await getService<McpService>("mcpService");
      this.diagramService = await getService<DiagramService>("diagramService");
      this.uiManager = await getService<UIManager>("uiManager");
      this.renderer = await getService<CanvasRenderer>("canvasRenderer");
      this._interactionManager =
        await getService<InteractionManager>("interactionManager"); // Ready for interaction features
      this.aiService = await getService<AIService>("aiService");
      this.wasmRuntimeManager =
        await getService<WasmRuntimeManager>("wasmRuntimeManager");
      this.witVisualizationPanel = await getService<WitVisualizationPanel>(
        "witVisualizationPanel",
      );
      this.viewSwitcher = await getService<ViewSwitcher>("viewSwitcher");
      this.viewModeManager =
        await getService<ViewModeManager>("viewModeManager");

      // Continue with AppController-specific initialization
      await this.completeInitialization();

      console.log("AppController: All services initialized successfully");

      // Log service health dashboard
      const healthDashboard = getServiceHealthDashboard();
      console.log("Service Health Dashboard:", healthDashboard);
    } catch (error) {
      console.error("AppController: Failed to initialize services:", error);
      this.uiManager?.updateStatus("Failed to initialize application services");
      throw error;
    }
  }

  /**
   * Complete AppController-specific initialization after services are ready
   */
  private async completeInitialization(): Promise<void> {
    // Methods are available for future use - no longer need workaround
    // Setup drag and drop for WASM components
    this.setupCanvasDragAndDrop();

    // Setup MCP streaming for real-time updates
    this.setupMcpStreaming();

    // Setup UI event handlers
    this.setupUIEventHandlers();

    // Activate advanced interaction management
    this._interactionManager.setupEventHandlers();
    this._interactionManager.setUIManager(this.uiManager);
    this._interactionManager.setViewModeManager(this.viewModeManager);
    console.log("AppController: Advanced interaction system activated");

    // Setup AI model selection
    await this.setupAIModelSelection();

    // Setup debug utilities and mount UI first (before loading WASM components)
    this.setupDebugUtilities();

    // Connect WASM runtime to header icons
    this.wasmRuntimeManager.setHeaderIconManager(
      this.uiManager.getHeaderIconManager(),
    );

    // Initialize WASM component palette with MCP service
    await this.uiManager.initializeWasmComponentPalette(this.mcpService);

    // Initialize edge creation type
    const initialEdgeCreationType = this.uiManager.getCurrentEdgeCreationType();
    this.renderer.setEdgeCreationType(initialEdgeCreationType);
    console.log(
      "AppController: Initialized edge creation type:",
      initialEdgeCreationType,
    );

    // Load initial diagram if available (this will load WASM components after sidebar is ready)
    await this.loadInitialDiagram();

    // Log environment info
    this.logEnvironmentInfo();

    // Run integration tests in development mode
    if (
      process.env.NODE_ENV === "development" ||
      window.location.hostname === "localhost"
    ) {
      console.log("🧪 Running integration tests in development mode...");
      setTimeout(async () => {
        try {
          await integrationTester.runAllTests();
          const allPassed = integrationTester.allTestsPassed();

          if (allPassed) {
            console.log(
              "🎉 All integration tests passed! Component Execution Monitoring System is ready.",
            );
            this.uiManager?.updateStatus(
              "✅ Integration tests passed - System ready",
            );
          } else {
            console.warn(
              "⚠️ Some integration tests failed. Check console for details.",
            );
            this.uiManager?.updateStatus(
              "⚠️ Integration tests failed - Check console",
            );
          }
        } catch (error) {
          console.error("❌ Integration testing failed:", error);
          this.uiManager?.updateStatus("❌ Integration testing failed");
        }
      }, 2000); // Run tests after 2 seconds to allow full initialization
    }
  }

  /**
   * Setup UI event handlers
   */
  private setupUIEventHandlers(): void {
    // Setup toolbar event handlers
    this.uiManager.setupToolbarEventHandlers(async (newType: string) => {
      await this.handleDiagramTypeChange(newType);
    });

    // Setup AI panel event handlers
    this.uiManager.setupAIPanelEventHandlers(
      async (prompt: string) => await this.handleAICreateDiagram(prompt),
      async () => await this.handleAITestDiagram(),
      async () => await this.handleAIAnalyzeDiagram(),
      async () => await this.handleAIOptimizeLayout(),
    );

    // Setup diagram close event handler
    window.addEventListener("diagram-close-requested", () => {
      console.log("AppController: Diagram close requested - clearing canvas");
      this.renderer.clear();
    });
  }

  /**
   * Setup debug utilities
   */
  private setupDebugUtilities(): void {
    // Development-only debug utilities
    if (
      process.env.NODE_ENV === "development" ||
      window.location.hostname === "localhost"
    ) {
      if (!window.debug) window.debug = {};
      window.debug.testOllama = () => this.aiService.testOllamaConnection();
      window.debug.appController = this;
      window.debug.wasmRuntime = this.wasmRuntimeManager;
      window.debug.uploadWasm = () => this.wasmRuntimeManager.showUploadPanel();
      window.debug.testSidebar = () => this.testSidebarIntegration();
      window.debug.theme = this.uiManager.getThemeController();
      window.debug.toggleSidebar = () => this.uiManager.toggleSidebar();
      window.debug.checkSidebar = () => ({
        sidebarCollapsed: this.uiManager.isSidebarCollapsed(),
        bodyClasses: document.body.className,
        collapseButton: document.querySelector(".sidebar-collapse-btn"),
        buttonVisible: document.querySelector(".sidebar-collapse-btn")
          ? window.getComputedStyle(
              document.querySelector(".sidebar-collapse-btn")!,
            ).display !== "none"
          : false,
      });
      window.debug.headerIcons = this.uiManager.getHeaderIconManager();
      window.debug.testAIMinimize = () => {
        this.uiManager.getHeaderIconManager().addIcon({
          id: "test-ai",
          title: "Test AI",
          icon: "🤖",
          color: "var(--accent-wasm)",
          onClick: () => {
            /* Test AI clicked */
          },
          onClose: () => {
            /* Test AI closed */
          },
        });
      };
      window.debug.debugDialogs = () => BaseDialog.debugDialogState();
      window.debug.testComponentLoading = testComponentLoading;
    }

    this.mountUI();
    this.setupViewModeManager();
    this.logEnvironmentInfo();
  }

  private mountUI(): void {
    console.log("AppController: Mounting UI elements");

    // Initialize modern sidebar
    const sidebarContainer = document.querySelector(".sidebar");
    if (sidebarContainer) {
      console.log("AppController: Initializing modern sidebar");
      // Clear existing sidebar content
      sidebarContainer.innerHTML = "";
      // Initialize modern sidebar with diagram type change handler
      this.uiManager.initializeModernSidebar(
        sidebarContainer as HTMLElement,
        async (newType: string) => await this.handleDiagramTypeChange(newType),
      );
      console.log("AppController: Modern sidebar initialized");

      // Now that sidebar is ready, load WASM components if we haven't already
      if (this.uiManager.isComponentLibraryReady()) {
        console.log("AppController: Sidebar ready, loading WASM components...");
        this.loadWasmComponentsToSidebar().catch((error) => {
          console.error("Failed to load WASM components to sidebar:", error);
        });
      }

      // Mount toolbar in sidebar for modern UI
      const toolbarContainer = document.getElementById("toolbar-container");
      if (toolbarContainer) {
        toolbarContainer.appendChild(this.uiManager.getToolbarElement());
        console.log("AppController: Toolbar mounted in modern UI sidebar");
      }
    } else {
      // Fallback to old UI
      console.log("AppController: Using legacy UI (sidebar not found)");
      const toolbarContainer = document.getElementById("toolbar-container");
      if (toolbarContainer) {
        toolbarContainer.appendChild(this.uiManager.getToolbarElement());
        console.log("AppController: Toolbar mounted");
      }

      const diagramListContainer = document.getElementById(
        "diagram-list-container",
      );
      if (diagramListContainer) {
        const diagramListElement = this.uiManager.getDiagramListElement();
        diagramListContainer.appendChild(diagramListElement);
        console.log("AppController: Diagram list mounted");
      }
    }

    // Always mount status bar
    const statusContainer = document.getElementById("status-container");
    if (statusContainer) {
      statusContainer.appendChild(this.uiManager.getStatusElement());
      console.log("AppController: Status bar mounted");
    }

    // Mount AI panel as floating element
    document.body.appendChild(this.uiManager.getAIPanelElement());
    console.log("AppController: AI panel mounted as floating element");

    // Mount WASM palette as floating element (only if not using modern sidebar)
    if (!sidebarContainer) {
      document.body.appendChild(this.wasmRuntimeManager.getPaletteElement());
      console.log("AppController: WASM palette mounted as floating element");
    } else {
      console.log(
        "AppController: Skipping WASM palette (using sidebar components instead)",
      );
    }

    // Mount WIT visualization panel
    document.body.appendChild(this.witVisualizationPanel.getElement());
    console.log("AppController: WIT visualization panel mounted");

    // Mount view switcher in header
    const viewSwitcherContainer = document.getElementById(
      "view-switcher-container",
    );
    if (viewSwitcherContainer) {
      viewSwitcherContainer.appendChild(this.viewSwitcher.getElement());
      this.viewSwitcher.setModeChangeHandler((mode) =>
        this.handleViewModeChange(mode),
      );
      console.log("AppController: View switcher mounted");
    }

    // Listen for theme changes to update canvas
    window.addEventListener("themeChanged", () => {
      this.renderer.updateTheme();
      console.log("AppController: Canvas theme updated");
    });
  }

  private async loadWasmComponentsToSidebar(): Promise<void> {
    try {
      console.log("=== LOADING WASM COMPONENTS TO SIDEBAR ===");

      // Ensure sidebar is initialized before loading components
      if (!this.uiManager.isComponentLibraryReady()) {
        console.log("Sidebar not ready yet, skipping WASM component loading");
        return;
      }

      // Clear any existing error components first
      this.uiManager.clearWasmComponents();

      // Trigger component scan to ensure we have the latest data
      console.log("Triggering component scan...");
      const scanResult = await this.mcpService.callTool(
        "scan_wasm_components",
        {},
      );
      console.log("Scan result:", scanResult);

      // Use the scan result directly which contains detailed interface data
      if (
        scanResult &&
        scanResult.content &&
        scanResult.content[0] &&
        scanResult.content[0].text
      ) {
        console.log("Raw scan result text:", scanResult.content[0].text);

        // Parse the scan result which contains the full component data
        const scanData = JSON.parse(scanResult.content[0].text);
        console.log("Parsed scan data:", JSON.stringify(scanData, null, 2));

        const components = scanData.components || [];
        console.log(`Found ${components.length} WASM components from scan`);
        console.log(
          "First few components with interfaces:",
          components.slice(0, 3),
        );

        if (components.length === 0) {
          console.warn("Components array is empty!");
          const emptyComponentsData: WasmComponent = {
            id: "no-components",
            name: "No WASM components found",
            path: "",
            description: "Upload a component or check your backend connection",
            status: "error",
            category: "Status",
            interfaces: [],
            dependencies: [],
            metadata: {},
          };
          this.uiManager.addWasmComponentToLibrary(emptyComponentsData);
          return;
        }

        components.forEach((component: any, index: number) => {
          console.log(
            `Processing component ${index + 1}:`,
            JSON.stringify(component, null, 2),
          );

          // Extract component info from the MCP data
          const name = component.name || "Unknown Component";
          const status = component.fileExists ? "available" : "missing";

          const componentData: WasmComponent = {
            id: component.name || name,
            name: name,
            path: component.path || "",
            description: component.description || `WASM component: ${name}`,
            status: status,
            category: this.categorizeWasmComponent(component),
            interfaces: (component.interfaces || []).map((iface: any) => ({
              name: iface.name || "",
              interface_type:
                iface.interface_type === "import" ||
                iface.interface_type === "export"
                  ? iface.interface_type
                  : "import",
              functions: iface.functions || [],
            })),
            dependencies: component.dependencies || [],
            metadata: component.metadata || {},
          };

          console.log(`Adding component to sidebar:`, componentData);
          this.uiManager.addWasmComponentToLibrary(componentData);

          console.log(
            `✅ Added WASM component to sidebar: ${name} (${status})`,
          );
        });

        console.log(
          `🎉 Successfully loaded ${components.length} WASM components to sidebar`,
        );
      } else {
        console.warn("Invalid scan result structure:", {
          hasScanResult: !!scanResult,
          hasContent: !!scanResult?.content,
          hasText: !!scanResult?.content?.[0]?.text,
        });

        const noComponentsData: WasmComponent = {
          id: "no-components",
          name: "No WASM components found",
          path: "",
          description: "Upload a component or check your backend connection",
          status: "error",
          category: "Status",
          interfaces: [],
          dependencies: [],
          metadata: {},
        };
        this.uiManager.addWasmComponentToLibrary(noComponentsData);
      }
    } catch (error) {
      console.error("❌ Failed to load WASM components to sidebar:", error);
      console.error("Error details:", {
        message: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
      });

      // Add an error indicator component
      const errorData: WasmComponent = {
        id: "error-loading",
        name: "Error Loading Components",
        path: "",
        description: `Failed to connect to backend: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
        status: "error",
        category: "Status",
        interfaces: [],
        dependencies: [],
        metadata: {},
      };
      this.uiManager.addWasmComponentToLibrary(errorData);
    }
  }

  private categorizeWasmComponent(component: any): string {
    const name = component.name?.toLowerCase() || "";
    const path = component.path?.toLowerCase() || "";

    // Categorize based on component name and path patterns
    if (name.includes("camera") || path.includes("camera")) {
      return "Vision";
    } else if (
      name.includes("object-detection") ||
      name.includes("detection") ||
      path.includes("detection")
    ) {
      return "AI/ML";
    } else if (
      name.includes("adas") ||
      name.includes("vehicle") ||
      name.includes("automotive") ||
      path.includes("adas")
    ) {
      return "Automotive";
    } else if (
      name.includes("compute") ||
      name.includes("math") ||
      name.includes("calc")
    ) {
      return "Computation";
    } else if (
      name.includes("image") ||
      name.includes("media") ||
      name.includes("vision")
    ) {
      return "Media";
    } else if (name.includes("validate") || name.includes("data")) {
      return "Utilities";
    } else if (name.includes("crypto") || name.includes("security")) {
      return "Security";
    } else if (
      name.includes("ai") ||
      name.includes("ml") ||
      name.includes("neural")
    ) {
      return "AI/ML";
    } else {
      return "WASM Components";
    }
  }

  /**
   * Load initial diagram from available diagrams
   */
  private async loadInitialDiagram(): Promise<void> {
    // Load WASM components into the sidebar if modern sidebar is active
    await this.loadWasmComponentsToSidebar();

    // Load existing diagrams instead of creating a new one
    console.log("AppController: Loading available diagrams...");
    const diagrams = await this.diagramService.getAvailableDiagrams();
    console.log("AppController: Retrieved diagrams:", diagrams);

    // Update the diagram list UI
    this.uiManager.updateDiagramList(
      diagrams,
      this.loadDiagramCallback.bind(this),
      this.deleteDiagramCallback.bind(this),
    );

    // If there are existing diagrams, load the first one
    if (diagrams.length > 0) {
      console.log(
        "AppController: Loading first available diagram:",
        diagrams[0].id,
      );
      const firstDiagram = await this.diagramService.loadDiagram(
        diagrams[0].id,
      );
      if (firstDiagram) {
        this.renderer.setDiagram(firstDiagram);
        this.uiManager.updateStatus(`Loaded diagram: ${firstDiagram.name}`);
        console.log("AppController: Diagram loaded successfully");

        // Update the toolbar to show the correct node/edge types for this diagram type
        // Handle both camelCase and snake_case naming conventions
        const diagramType =
          firstDiagram.diagramType || firstDiagram.diagram_type || "workflow";
        console.log(
          "AppController: Updating toolbar for initial diagram type:",
          diagramType,
        );
        this.uiManager.updateToolbarContent(
          this.uiManager.getToolbarElement(),
          diagramType,
        );

        // Refresh WASM component interfaces if this is a WASM diagram
        if (diagramType === "wasm-component" && this.wasmRuntimeManager) {
          console.log("AppController: Refreshing WASM component interfaces...");
          try {
            await this.wasmRuntimeManager.refreshComponentInterfaces("all");
          } catch (error) {
            console.error("Failed to refresh component interfaces:", error);
          }
        }
      }
    } else {
      console.log("AppController: No existing diagrams found");
      this.uiManager.updateStatus(
        "No diagrams found - Create a new diagram to start",
      );
      // Clear the canvas to show empty state
      this.renderer.clear();
    }

    // Setup create new diagram button
    this.uiManager.setupCreateDiagramButton(async () => {
      await this.handleCreateNewDiagram();
    });
  }

  private async handleAICreateDiagram(prompt: string): Promise<void> {
    console.log("AI Create Diagram:", prompt);
    this.uiManager.addAIMessage(
      "AI",
      "🤖 Let me create that diagram for you...",
    );

    try {
      const currentDiagramId = this.diagramService.getCurrentDiagramId();
      const response = await this.aiService.createDiagramFromPrompt(
        prompt,
        currentDiagramId,
      );
      await this._handleAIDiagramResponse(response);
    } catch (error) {
      console.error("AI diagram creation failed:", error);
      this.uiManager.addAIMessage(
        "AI",
        `❌ Failed to create diagram: ${error}`,
      );
    }
  }

  private async handleAITestDiagram(): Promise<void> {
    console.log("AI Test Diagram Creation");
    this.uiManager.addAIMessage(
      "AI",
      "🧪 Creating a test workflow diagram for you...",
    );
    const testPrompt =
      "Create a simple workflow diagram with a start node, a process task called 'Review Document', a decision gateway asking 'Approved?', and two end nodes for approved and rejected paths.";
    await this.handleAICreateDiagram(testPrompt);
  }

  private async handleAIAnalyzeDiagram(): Promise<void> {
    console.log("AI Analyze Current Diagram");
    this.uiManager.addAIMessage("AI", "🔍 Analyzing your current diagram...");

    try {
      const diagramId = this.diagramService.getCurrentDiagramId();
      if (!diagramId) {
        this.uiManager.addAIMessage(
          "AI",
          "❌ No diagram loaded to analyze. Please create or load a diagram first.",
        );
        return;
      }

      const analysis = await this.aiService.analyzeDiagram(diagramId);
      this.uiManager.addAIMessage(
        "AI",
        `📊 **Diagram Analysis**\n\n${analysis}`,
      );
    } catch (error) {
      console.error("AI diagram analysis failed:", error);
      this.uiManager.addAIMessage(
        "AI",
        `❌ Failed to analyze diagram: ${error}`,
      );
    }
  }

  private async handleAIOptimizeLayout(): Promise<void> {
    console.log("AI Optimize Layout");
    this.uiManager.addAIMessage("AI", "🔧 Optimizing your diagram layout...");

    try {
      const diagramId = this.diagramService.getCurrentDiagramId();
      if (!diagramId) {
        this.uiManager.addAIMessage(
          "AI",
          "❌ No diagram loaded to optimize. Please create or load a diagram first.",
        );
        return;
      }

      // First apply hierarchical layout
      await this.diagramService.applyLayout(diagramId, "hierarchical");

      // Then get AI suggestions for further optimization
      const suggestions =
        await this.aiService.suggestLayoutImprovements(diagramId);
      this.uiManager.addAIMessage(
        "AI",
        `✅ **Layout Optimized**\n\n${suggestions}`,
      );
    } catch (error) {
      console.error("AI layout optimization failed:", error);
      this.uiManager.addAIMessage(
        "AI",
        `❌ Failed to optimize layout: ${error}`,
      );
    }
  }

  private async _handleAIDiagramResponse(
    response: import("./ai/diagram-agent.js").AgentResponse,
  ): Promise<void> {
    const statusIcon = response.success ? "✅" : "❌";
    let message = `${statusIcon} ${response.message}`;

    if (response.steps && response.steps.length > 0) {
      message += "\n\n**Steps taken:**";
      response.steps.forEach((step: string) => {
        message += `\n• ${step}`;
      });
    }

    if (response.errors && response.errors.length > 0) {
      message += "\n\n**Errors:**";
      response.errors.forEach((error: string) => {
        message += `\n❌ ${error}`;
      });
    }

    this.uiManager.addAIMessage("AI", message);

    if (response.success && response.diagramId) {
      await this.diagramService.loadDiagram(response.diagramId);
      this.renderer.setDiagram(
        this.diagramService.getDiagramState().getDiagram(response.diagramId)!,
      );
    }
  }

  private async setupAIModelSelection(): Promise<void> {
    try {
      console.log("AppController: Setting up AI model selection...");

      // Try to get available models
      const models = await this.aiService.getAvailableModels();
      const currentModel = this.aiService.getCurrentModel();

      console.log("AppController: Available models:", models);
      console.log("AppController: Current model:", currentModel);

      // Set up the model selection dropdown with change handler
      this.uiManager.updateAIModelSelect(models, currentModel, (modelName) => {
        console.log("AppController: Model changed to:", modelName);
        this.aiService.setCurrentModel(modelName);
        this.uiManager.addAIMessage("AI", `🤖 Switched to model: ${modelName}`);
      });
    } catch (error) {
      console.warn(
        "AppController: Failed to load AI models (Ollama may be offline):",
        error,
      );

      // Set up dropdown with offline state but keep the change handler for when it comes online
      this.uiManager.updateAIModelSelect([], "", (modelName) => {
        console.log("AppController: Model changed to:", modelName);
        this.aiService.setCurrentModel(modelName);
        this.uiManager.addAIMessage("AI", `🤖 Switched to model: ${modelName}`);
      });
    }
  }

  private async createNewDiagramOfType(diagramType: string): Promise<void> {
    try {
      console.log("Creating new diagram of type:", diagramType);
      const newDiagram = await this.diagramService.createNewDiagram(
        diagramType,
        `New ${diagramType} Diagram`,
      );
      if (newDiagram) {
        // Load the new diagram
        const loadedDiagram = await this.diagramService.loadDiagram(newDiagram);
        if (loadedDiagram) {
          this.renderer.setDiagram(loadedDiagram);
          this.uiManager.updateStatus(`Created new ${diagramType} diagram`);
          console.log("New diagram created and loaded:", newDiagram);

          // Refresh the diagram list (will use the callbacks from initialize())
          await this.refreshDiagramList();
        }
      }
    } catch (error) {
      console.error("Failed to create new diagram:", error);
      this.uiManager.updateStatus(`Failed to create ${diagramType} diagram`);
    }
  }

  private async refreshDiagramList(): Promise<void> {
    try {
      const diagrams = await this.diagramService.getAvailableDiagrams();
      console.log(
        "AppController: Refreshing diagram list with",
        diagrams.length,
        "diagrams",
      );

      // Use the same callbacks as the initial setup to avoid duplicate event handlers
      this.uiManager.updateDiagramList(
        diagrams,
        this.loadDiagramCallback.bind(this),
        this.deleteDiagramCallback.bind(this),
      );
    } catch (error) {
      console.error("Failed to refresh diagram list:", error);
    }
  }

  // Extract callbacks as class methods to reuse them
  private async loadDiagramCallback(diagramId: string): Promise<void> {
    console.log("AppController: Loading diagram:", diagramId);

    try {
      // Show animated loading feedback
      await this.showOperationSuccess("Loading diagram...");

      const loadedDiagram = await this.diagramService.loadDiagram(diagramId);

      if (loadedDiagram) {
        console.log(
          "AppController: Diagram loaded successfully:",
          loadedDiagram,
        );
        this.renderer.setDiagram(loadedDiagram);

        // Smooth zoom to fit the loaded diagram
        if (this.renderer.fitToView) {
          await this.renderer.fitToView(50, 800);
        }

        // Update the toolbar to show the correct node/edge types for this diagram type
        // Handle both camelCase and snake_case naming conventions
        const diagramType =
          loadedDiagram.diagramType || loadedDiagram.diagram_type || "workflow";
        console.log(
          "AppController: Updating toolbar for loaded diagram type:",
          diagramType,
        );
        this.uiManager.updateToolbarContent(
          this.uiManager.getToolbarElement(),
          diagramType,
        );

        // Show/hide view switcher based on diagram type
        this.viewSwitcher.showForDiagramType(diagramType);

        // Show success animation
        await this.showOperationSuccess(
          `Loaded diagram: ${loadedDiagram.name}`,
        );

        this.uiManager.updateStatus(`Loaded diagram: ${loadedDiagram.name}`);
      } else {
        console.warn("AppController: Failed to load diagram:", diagramId);
        await this.showOperationError(
          "Failed to load diagram",
          new Error("Diagram not found"),
        );
      }
    } catch (error) {
      console.error("AppController: Error loading diagram:", error);
      await this.showOperationError("Failed to load diagram", error as Error);
    }
  }

  private async deleteDiagramCallback(
    diagramId: string,
    diagramName: string,
  ): Promise<void> {
    // Prevent double deletion
    const deleteKey = `deleting-${diagramId}`;
    if (window[deleteKey]) {
      console.log("AppController: Delete already in progress for", diagramId);
      return;
    }
    window[deleteKey] = true;

    try {
      console.log(
        "AppController: Delete request for diagram:",
        diagramId,
        diagramName,
      );

      // Check if this is the current diagram being worked on
      const isCurrentDiagram =
        this.diagramService.isCurrentDiagramDeletable(diagramId);
      const hasUnsavedChanges = this.diagramService.hasUnsavedChanges();

      let confirmMessage =
        "This diagram and all its content will be permanently removed.";
      let confirmTitle = `Delete "${diagramName}"?`;

      // Enhanced warning for current diagram
      if (isCurrentDiagram) {
        confirmTitle = `⚠️ Delete Current Diagram "${diagramName}"?`;
        confirmMessage = `You are about to delete the diagram you are currently working on.\n\n`;

        if (hasUnsavedChanges) {
          confirmMessage += `⚠️ WARNING: You have unsaved changes that will be lost!\n\n`;
        }

        confirmMessage += `This action will:\n• Permanently delete the diagram from the server\n• Clear the current canvas\n• Remove all diagram content\n\nThis cannot be undone.`;
      }

      // Show confirmation dialog with enhanced messaging
      const confirmed = await this.uiManager.showDeleteConfirm(
        confirmTitle,
        confirmMessage,
      );

      if (!confirmed) {
        console.log("AppController: Diagram deletion cancelled by user");
        return;
      }

      console.log("AppController: User confirmed deletion, proceeding...");

      // If this is the current diagram, clear the canvas BEFORE calling the service
      // to prevent any visual artifacts during the deletion process
      if (isCurrentDiagram) {
        console.log(
          "AppController: Pre-clearing canvas for current diagram deletion",
        );
        this.renderer.clear(); // This sets currentDiagram = undefined and re-renders
      }

      const success = await this.diagramService.deleteDiagram(diagramId);
      console.log("AppController: Delete operation result:", success);

      if (success) {
        console.log("AppController: Diagram deleted successfully");

        // Canvas is already cleared if it was the current diagram
        if (isCurrentDiagram) {
          console.log(
            "AppController: Canvas was pre-cleared for current diagram",
          );
        }

        // Refresh the diagram list
        await this.refreshDiagramList();
        await this.uiManager.showSuccess(
          `Successfully deleted "${diagramName}"`,
        );
      } else {
        console.error(
          "AppController: Failed to delete diagram - server error or unknown tool",
        );
        await this.uiManager.showError(
          "Failed to delete diagram",
          "The server does not support diagram deletion yet. This feature needs to be implemented on the backend.",
        );
      }
    } finally {
      // Clear the lock
      delete window[deleteKey];
    }
  }

  private async handleCreateNewDiagram(): Promise<void> {
    try {
      // Get existing diagram names for validation
      const existingDiagrams = await this.diagramService.getAvailableDiagrams();
      const existingNames = existingDiagrams.map((d) => d.name);

      // Show professional diagram creation dialog
      const result =
        await this.uiManager.showDiagramTypeSelector(existingNames);

      if (!result) return; // User cancelled

      const { type: selectedType, name: diagramName } = result;

      console.log(
        "AppController: Creating new diagram:",
        selectedType.type,
        diagramName,
      );
      const createResult = await this.mcpService.createDiagram(
        selectedType.type,
        diagramName,
      );
      console.log("AppController: Create diagram result:", createResult);

      if (
        createResult.content &&
        createResult.content[0] &&
        createResult.content[0].text
      ) {
        // Extract the diagram ID from the response
        const match = createResult.content[0].text.match(/ID: ([a-f0-9-]+)/);
        if (match) {
          const diagramId = match[1];
          console.log("AppController: New diagram ID:", diagramId);

          // Load the newly created diagram
          const newDiagram = await this.diagramService.loadDiagram(diagramId);
          if (newDiagram) {
            this.renderer.setDiagram(newDiagram);
            console.log("AppController: Loaded new diagram successfully");

            // Update the toolbar to show the correct node/edge types for this diagram type
            console.log(
              "AppController: Updating toolbar for diagram type:",
              selectedType.type,
            );
            this.uiManager.updateToolbarContent(
              this.uiManager.getToolbarElement(),
              selectedType.type,
            );
          }
        }

        this.uiManager.updateStatus(`Created: ${diagramName}`);
        await this.uiManager.showSuccess(
          `Successfully created "${diagramName}"!`,
        );

        // Refresh the diagram list to show the new diagram
        await this.refreshDiagramList();
      } else {
        throw new Error("Invalid response from create diagram");
      }
    } catch (error) {
      console.error("Failed to create new diagram:", error);
      await this.uiManager.showError(
        "Failed to create diagram",
        error instanceof Error ? error.message : "Unknown error",
      );
    }
  }

  private setupCanvasDragAndDrop(): void {
    console.log("Setting up canvas drag and drop...");

    // Prevent default drag behaviors
    this.canvas.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.dataTransfer!.dropEffect = "copy";
    });

    this.canvas.addEventListener("drop", async (e) => {
      e.preventDefault();

      // Get the drag data
      const dragDataString = e.dataTransfer?.getData("application/json");
      if (!dragDataString) {
        console.log("No drag data received");
        return;
      }

      try {
        const dragData = JSON.parse(dragDataString);
        console.log("Canvas drop received:", dragData);

        // Only handle WASM component drops
        if (dragData.type !== "wasm-component") {
          console.log("Not a WASM component drop, ignoring");
          return;
        }

        // Get the drop position relative to the canvas
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        // Convert to world coordinates (account for canvas transform)
        const worldPos = this.renderer.screenToWorld(x, y);

        // Create a WASM component node at the drop position
        const nodeData = {
          type: "wasm-component",
          label: dragData.name,
          properties: {
            componentName: dragData.id,
            componentPath: dragData.path || "",
            category: dragData.category || "WASM Components",
            status: "unloaded",
            interfaces: dragData.interfaces || [],
          },
          x: worldPos.x,
          y: worldPos.y,
        };

        console.log(
          "Creating WASM node at position:",
          worldPos,
          "with data:",
          nodeData,
        );

        // Get current diagram ID
        const diagramId = this.diagramService.getCurrentDiagramId();
        if (!diagramId) {
          console.error("No active diagram to add component to");
          this.uiManager.updateStatus("Please create or load a diagram first");
          return;
        }

        // Create the node using the diagram service
        try {
          // Use the correct method signature with properties
          await this.diagramService.createNode(
            diagramId,
            nodeData.type, // nodeType
            { x: nodeData.x, y: nodeData.y }, // position
            nodeData.label, // label
            nodeData.properties, // properties (includes interfaces)
          );

          console.log("WASM component node created successfully");
          this.uiManager.updateStatus(`Added ${dragData.name} to diagram`);

          // The diagram service automatically refreshes the diagram after creating the node
          // Now update the renderer to show the new component immediately
          const currentDiagram = this.diagramService.getCurrentDiagram();
          if (currentDiagram) {
            console.log("Updating renderer with refreshed diagram");
            this.renderer.setDiagram(currentDiagram);
          }
        } catch (error) {
          console.error("Failed to create WASM component node:", error);
          this.uiManager.updateStatus("Failed to add component to diagram");
        }
      } catch (error) {
        console.error("Failed to parse drag data:", error);
      }
    });

    // Handle graphics node creation from palette
    window.addEventListener("graphics-node-create", async (event: Event) => {
      const customEvent = event as CustomEvent;
      console.log(
        "AppController: Graphics node creation event received:",
        customEvent.detail,
      );

      const { nodeType, position } = customEvent.detail;

      // Get current diagram ID
      const diagramId = this.diagramService.getCurrentDiagramId();
      if (!diagramId) {
        console.error("No active diagram to add graphics node to");
        this.uiManager.updateStatus("Please create or load a diagram first");
        return;
      }

      try {
        // Import graphics node types
        const { createDefaultGraphicsNodeProperties } = await import(
          "./graphics/GraphicsNodeTypes.js"
        );

        // Create properties for the graphics node
        const properties = createDefaultGraphicsNodeProperties(nodeType);

        // Create the graphics node
        await this.diagramService.createNode(
          diagramId,
          "graphics-node", // Use a generic graphics node type
          position,
          nodeType.name,
          {
            ...properties,
            graphicsType: nodeType.id,
            graphicsCategory: nodeType.category,
            icon: nodeType.icon,
            description: nodeType.description,
          },
        );

        console.log("Graphics node created successfully:", nodeType.name);

        // Show animated success feedback
        await this.showOperationSuccess(
          `Added ${nodeType.name} graphics component`,
        );

        // Update renderer
        const currentDiagram = this.diagramService.getCurrentDiagram();
        if (currentDiagram) {
          this.renderer.setDiagram(currentDiagram);
        }

        // Animate the newly created node (if visible)
        this.animateNewNode(position);
      } catch (error) {
        console.error("Failed to create graphics node:", error);

        // Show animated error feedback
        await this.showOperationError(
          "Failed to add graphics component",
          error as Error,
        );
      }
    });

    console.log("Canvas drag and drop setup complete");

    // Setup keyboard shortcuts for smooth diagram interactions
    this.setupKeyboardShortcuts();
  }

  /**
   * Setup keyboard shortcuts for enhanced diagram interactions with animations
   */
  private setupKeyboardShortcuts(): void {
    document.addEventListener("keydown", async (event: KeyboardEvent) => {
      // Skip if typing in input fields
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement ||
        (event.target as HTMLElement)?.contentEditable === "true"
      ) {
        return;
      }

      const isCtrlOrCmd = event.ctrlKey || event.metaKey;

      try {
        switch (event.key) {
          case "f":
          case "F":
            if (isCtrlOrCmd) {
              // Fit to view with smooth animation
              await this.handleFitToView();
              event.preventDefault();
            }
            break;

          case "0":
            if (isCtrlOrCmd) {
              // Reset zoom to 100% with animation
              await this.handleResetZoom();
              event.preventDefault();
            }
            break;

          case "+":
          case "=":
            if (isCtrlOrCmd) {
              // Zoom in with smooth animation
              await this.handleZoomIn();
              event.preventDefault();
            }
            break;

          case "-":
            if (isCtrlOrCmd) {
              // Zoom out with smooth animation
              await this.handleZoomOut();
              event.preventDefault();
            }
            break;

          case "Escape":
            // Cancel any active operations with smooth transitions
            await this.handleEscapeKey();
            event.preventDefault();
            break;
        }
      } catch (error) {
        console.error("Keyboard shortcut error:", error);
      }
    });

    console.log("Keyboard shortcuts setup complete");
  }

  /**
   * Handle fit to view with smooth animation
   */
  private async handleFitToView(): Promise<void> {
    if (!this.renderer.fitToView) {
      this.showFloatingNotification("Fit to view not available", "info");
      return;
    }

    try {
      this.showFloatingNotification("Fitting diagram to view...", "info");
      await this.renderer.fitToView(50, 1000); // 1 second animation
      await this.showOperationSuccess("Fitted diagram to view");
    } catch (error) {
      await this.showOperationError("Failed to fit to view", error as Error);
    }
  }

  /**
   * Handle reset zoom to 100% with animation
   */
  private async handleResetZoom(): Promise<void> {
    if (!this.renderer.zoomTo) {
      this.showFloatingNotification("Zoom controls not available", "info");
      return;
    }

    try {
      this.showFloatingNotification("Resetting zoom to 100%...", "info");
      await this.renderer.zoomTo(1.0, undefined, 600); // 600ms animation
      await this.showOperationSuccess("Reset zoom to 100%");
    } catch (error) {
      await this.showOperationError("Failed to reset zoom", error as Error);
    }
  }

  /**
   * Handle zoom in with animation
   */
  private async handleZoomIn(): Promise<void> {
    if (!this.renderer.zoomTo) return;

    try {
      const currentScale = (this.renderer as any).getOptions?.()?.scale || 1;
      const newScale = Math.min(currentScale * 1.2, 5.0); // Cap at 5x zoom
      await this.renderer.zoomTo(newScale, undefined, 400);
      this.showFloatingNotification(
        `Zoomed to ${Math.round(newScale * 100)}%`,
        "info",
      );
    } catch (error) {
      console.warn("Zoom in failed:", error);
    }
  }

  /**
   * Handle zoom out with animation
   */
  private async handleZoomOut(): Promise<void> {
    if (!this.renderer.zoomTo) return;

    try {
      const currentScale = (this.renderer as any).getOptions?.()?.scale || 1;
      const newScale = Math.max(currentScale / 1.2, 0.1); // Minimum 10% zoom
      await this.renderer.zoomTo(newScale, undefined, 400);
      this.showFloatingNotification(
        `Zoomed to ${Math.round(newScale * 100)}%`,
        "info",
      );
    } catch (error) {
      console.warn("Zoom out failed:", error);
    }
  }

  /**
   * Handle escape key to cancel operations
   */
  private async handleEscapeKey(): Promise<void> {
    // Clear any selections with smooth transition
    // Note: selectionManager would need to be properly initialized
    // this.selectionManager.clearSelection();

    // Stop any ongoing canvas animations
    if (
      (this.renderer as any).isCurrentlyAnimating &&
      (this.renderer as any).isCurrentlyAnimating()
    ) {
      // Cancel animations if possible
      console.log("Cancelling ongoing viewport animations");
    }

    this.showFloatingNotification("Cancelled operation", "info");
  }

  /**
   * Handle view mode changes - NEW: Uses ViewModeManager for proper view transformation
   */
  private async handleViewModeChange(mode: string): Promise<void> {
    console.log("AppController: View mode change requested to:", mode);

    const currentDiagram = this.diagramService.getCurrentDiagram();
    if (!currentDiagram) {
      this.uiManager.updateStatus("No diagram selected");
      return;
    }

    // Show user feedback
    this.uiManager.updateStatus(`Switching to ${mode} view...`);

    // Use ViewModeManager to handle the transformation
    const success = await this.viewModeManager.switchViewMode(mode);

    if (success) {
      // Update UI state based on successful view mode change
      this.updateUIForViewMode(mode);
      this.uiManager.updateStatus(`✅ ${this.getViewModeLabel(mode)} active`);
    } else {
      // Handle failure
      const currentMode = this.viewModeManager.getCurrentViewMode();
      this.uiManager.updateStatus(
        `❌ Failed to switch to ${mode} view - staying in ${currentMode}`,
      );

      // Reset view switcher to current mode
      this.viewSwitcher.setMode(currentMode);
    }
  }

  /**
   * Update UI elements based on current view mode
   */
  private updateUIForViewMode(mode: string): void {
    // Hide/show panels based on view mode
    switch (mode) {
      case "component":
        this.witVisualizationPanel.hide();
        this.canvas.style.display = "block";
        break;

      case "wit-interface":
        this.witVisualizationPanel.hide(); // We use canvas rendering now
        this.canvas.style.display = "block";
        break;

      case "wit-dependencies":
        this.witVisualizationPanel.hide();
        this.canvas.style.display = "block";
        break;
    }
  }

  /**
   * Get user-friendly label for view mode
   */
  private getViewModeLabel(mode: string): string {
    const config = this.viewModeManager.getViewModeConfig(mode);
    return config ? config.label : mode;
  }

  /**
   * Handle actual diagram type changes (different from view mode changes)
   */
  private async handleDiagramTypeChange(newType: string): Promise<void> {
    console.log("AppController: Diagram type change requested to:", newType);

    // Update the toolbar to reflect the new diagram type
    console.log("Updating toolbar content...");
    this.uiManager.updateToolbarContent(
      this.uiManager.getToolbarElement(),
      newType,
    );

    // Show/hide view switcher based on diagram type
    this.viewSwitcher.showForDiagramType(newType);

    // Show/hide WASM palette based on diagram type
    if (newType === "wasm-component") {
      await this.wasmRuntimeManager.showEnhancedPalette();
      console.log(
        "Enhanced WASM palette shown for wasm-component diagram type",
      );
    } else {
      this.wasmRuntimeManager.hidePalette();
      console.log("WASM palette hidden for non-wasm diagram type");
    }

    const currentDiagram = this.diagramService.getCurrentDiagram();
    if (!currentDiagram) {
      // No current diagram, create new one
      await this.createNewDiagramOfType(newType);
      return;
    }

    const currentType =
      currentDiagram.diagramType || currentDiagram.diagram_type;
    if (currentType === newType) {
      // Same type, no change needed
      return;
    }

    // Show user confirmation for diagram type change
    const userConfirmed = await this.confirmDiagramTypeChange(
      currentType || "unknown",
      newType,
    );
    if (userConfirmed) {
      await this.createNewDiagramOfType(newType);
    }
  }

  /**
   * Confirm diagram type change with user
   */
  private async confirmDiagramTypeChange(
    currentType: string,
    newType: string,
  ): Promise<boolean> {
    // For now, just log - in a real implementation, show a dialog
    console.log(
      `Confirming diagram type change from ${currentType} to ${newType}`,
    );
    return true; // Auto-confirm for now
  }

  /**
   * Legacy method for switching to WIT interface view
   * @deprecated Use ViewModeManager.switchViewMode('wit-interface') instead
   */
  // Deprecated - commented out to fix TS6133
  /*private async _switchToWitInterfaceView(currentDiagram: any): Promise<void> {
    const currentDiagramType =
      currentDiagram.diagramType || currentDiagram.diagram_type;

    // Show clear user feedback
    this.uiManager.updateStatus("Switching to Interface View...");

    if (currentDiagramType === "wasm-component") {
      // Create WIT interface diagram from WASM components
      await this.createTestWitDiagram();
    } else if (currentDiagramType === "wit-interface") {
      // Check if this WIT diagram actually has WIT elements
      const elements = Object.values(currentDiagram.elements);
      const hasWitElements = elements.some((element: any) => {
        const elementType = element.type || element.element_type;
        return this.isWitElementType(elementType);
      });

      if (!hasWitElements) {
        // Recreate with proper WIT elements
        await this.createTestWitDiagram();
      } else {
        // Already has WIT elements, just render
        this.canvas.style.display = "block";
        this.renderer.render();
        this.uiManager.updateStatus("Interface View active");
      }
    } else {
      this.uiManager.updateStatus(
        "Interface View only works with WASM component diagrams",
      );
    }
  }

  private isWitElementType(elementType: string): boolean {
    return [
      "wit-package",
      "wit-world",
      "wit-interface",
      "wit-function",
      "wit-type",
      "wit-record",
      "wit-variant",
      "wit-enum",
      "wit-flags",
      "wit-resource",
    ].includes(elementType);
  }*/

  /**
   * Legacy method for switching to WIT dependency view
   * @deprecated Use ViewModeManager.switchViewMode('wit-dependencies') instead
   */
  // Deprecated - commented out to fix TS6133
  /*private async _switchToWitDependencyView(
    _currentDiagram: any,
  ): Promise<void> {
    this.uiManager.updateStatus("WIT dependency view coming soon...");
    // TODO: Implement dependency graph visualization
  }*/

  /**
   * Legacy method for creating WIT interface diagrams from components
   * @deprecated Use WasmViewTransformer.transformToInterfaceView() instead
   */
  // Deprecated - commented out to fix TS6133
  /*private async _createWitInterfaceDiagramFromComponents(
    _componentDiagram: any,
  ): Promise<void> {
    try {
      console.log(
        "createWitInterfaceDiagramFromComponents: Component diagram:",
        _componentDiagram,
      );
      console.log("Component diagram elements:", _componentDiagram.elements);

      // Extract WASM components from the current diagram
      const allElements = Object.values(_componentDiagram.elements || {});
      console.log("All elements:", allElements);

      const wasmComponents = allElements.filter((element: any) => {
        const elementType = element.type || element.element_type;
        console.log("Element type:", elementType, "Element:", element);
        return (
          elementType === "wasm-component" || elementType === "host-component"
        );
      });

      console.log("Found WASM components:", wasmComponents);

      if (wasmComponents.length === 0) {
        console.log("No WASM components found, creating test WIT diagram...");
        // Fallback: Create a simple test WIT diagram to verify the rendering works
        await this.createTestWitDiagram();
        return;
      }

      // Create a new WIT interface diagram
      const witDiagramName = `${
        _componentDiagram.name || "Diagram"
      } - WIT Interfaces`;
      console.log("Creating WIT diagram with name:", witDiagramName);

      const diagramId = await this.diagramService.createNewDiagram(
        "wit-interface",
        witDiagramName,
      );
      console.log("Create diagram result:", diagramId);

      if (!diagramId) {
        console.error("Failed to create WIT interface diagram:", diagramId);
        this.uiManager.updateStatus("Failed to create WIT interface diagram");
        return;
      }

      console.log("Created WIT diagram with ID:", diagramId);

      // TODO: Store reference to source component diagram in the diagram metadata

      // Generate WIT interface nodes for each WASM component
      let x = 50;
      let y = 50;
      const spacing = 300;

      for (const component of wasmComponents) {
        await this.addWitInterfaceNodesForComponent(diagramId, component, x, y);
        x += spacing;
        if (x > 800) {
          x = 50;
          y += 200;
        }
      }

      // The diagram should already be loaded by createNewDiagram, just render
      console.log("Rendering WIT diagram...");
      this.renderer.render();

      this.uiManager.updateStatus(
        `Switched to WIT interface view (${wasmComponents.length} components)`,
      );
    } catch (error) {
      console.error("Failed to create WIT interface diagram:", error);
      this.uiManager.updateStatus("Failed to create WIT interface diagram");
    }
  }*/

  // Removed unused legacy function addWitInterfaceNodesForComponent
  // Functionality replaced by WasmViewTransformer.transformToInterfaceView()

  private async createTestWitDiagram(): Promise<void> {
    try {
      // Create a WIT interface diagram
      const diagramId = await this.diagramService.createNewDiagram(
        "wit-interface",
        "Interface View",
      );

      if (!diagramId) {
        this.uiManager.updateStatus("❌ Failed to create Interface View");
        return;
      }

      // Wait for diagram to load
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Verify diagram loaded
      const currentDiagram = this.diagramService.getCurrentDiagram();
      if (!currentDiagram || currentDiagram.id !== diagramId) {
        this.uiManager.updateStatus("❌ Failed to load Interface View");
        return;
      }

      // Create WIT interface nodes
      await this.diagramService.createNode(
        diagramId,
        "wit-package",
        { x: 150, y: 150 },
        "WASM Package",
        { interfaceCount: 2 },
      );

      await this.diagramService.createNode(
        diagramId,
        "wit-interface",
        { x: 400, y: 250 },
        "Main Interface",
        { functionCount: 5, typeCount: 3 },
      );

      // Wait for elements to be created and render
      await new Promise((resolve) => setTimeout(resolve, 200));
      this.renderer.render();

      this.uiManager.updateStatus(
        "✅ Interface View active - showing WIT structure",
      );
    } catch (error) {
      console.error("Failed to create test WIT diagram:", error);
      this.uiManager.updateStatus("Failed to create test WIT diagram");
    }
  }

  /**
   * Get the currently selected WASM component node
   */
  // private getSelectedWasmComponentNode(): import('./model/diagram.js').Node | null {
  //     const currentDiagram = this.diagramService.getCurrentDiagram();
  //     if (!currentDiagram) return null;

  //     // TODO: Implement getSelectedElements method in DiagramService
  //     // const selectedElements = this.diagramService.getSelectedElements();
  //     // if (selectedElements.length === 0) return null;

  //     // Find the first WASM component node
  //     // for (const elementId of selectedElements) {
  //     //     const element = currentDiagram.elements[elementId];
  //     //     if (element && (element.type === 'wasm-component' || element.element_type === 'wasm-component')) {
  //     //         return element as import('./model/diagram.js').Node;
  //     //     }
  //     // }

  //     return null;
  // }

  /**
   * Open WIT visualization for a WASM component
   */
  public async openWitVisualization(
    componentName: string,
    componentPath: string,
  ): Promise<void> {
    console.log("Opening WIT visualization for:", componentName);

    try {
      await this.witVisualizationPanel.showComponent({
        componentName,
        componentPath,
      });
    } catch (error) {
      console.error("Failed to open WIT visualization:", error);
      this.uiManager.updateStatus(
        `Failed to load WIT data for ${componentName}`,
      );
    }
  }

  /**
   * Handle double-click on WASM component nodes
   */
  public handleWasmComponentDoubleClick(
    node: import("./model/diagram.js").Node,
  ): void {
    if (node.properties?.componentName) {
      this.openWitVisualization(
        String(node.properties.componentName),
        String(node.properties.componentPath || ""),
      );
    }
  }

  public testSidebarIntegration(): void {
    console.log("=== SIDEBAR INTEGRATION TEST ===");
    console.log("Sidebar container:", document.querySelector(".sidebar"));
    console.log("UIManager sidebar:", this.uiManager);

    // Test adding another WASM component
    this.uiManager.addWasmComponentToLibrary({
      id: "test-component-" + Date.now(),
      name: "Test Component",
      path: "/tmp/test-component.wasm",
      description: "Runtime test component",
      interfaces: [
        {
          name: "test",
          interface_type: "export",
          functions: [],
        },
      ],
      dependencies: [],
      metadata: {},
      status: "available",
      category: "Testing",
    });

    console.log("Test component added");

    // Debug AI panel callback
    console.log("AI Panel events check:", this.uiManager.getAIPanelElement());
    console.log("Header icon manager:", this.uiManager.getHeaderIconManager());
  }

  /**
   * Set up ViewModeManager listeners and integration
   */
  private setupViewModeManager(): void {
    // Listen for view mode changes to update ViewSwitcher
    this.viewModeManager.addViewModeListener((newMode: string) => {
      this.viewSwitcher.setMode(newMode);
    });

    // Set up diagram change listener (will be added to DiagramService)
    // For now, we'll call this manually when diagrams change
    console.log("ViewModeManager setup complete");
  }

  /**
   * Get available view modes for current diagram
   */
  public getAvailableViewModes(): string[] {
    return this.viewModeManager.getAvailableViewModes().map((mode) => mode.id);
  }

  public getMcpService(): McpService {
    return this.mcpService;
  }

  public getAIService(): AIService {
    return this.aiService;
  }

  /**
   * Setup MCP streaming for real-time updates and connection health monitoring
   */
  private setupMcpStreaming(): void {
    console.log(
      "AppController: Setting up MCP streaming for real-time updates",
    );

    // Add connection health monitoring
    this.mcpService.addConnectionHealthListener((healthMetrics) => {
      console.log("AppController: Connection health update:", healthMetrics);

      // Update status manager with enhanced connection info
      if (healthMetrics.reconnecting) {
        statusManager.setMcpStatus(false); // Will trigger UI update
      } else {
        statusManager.setMcpStatus(healthMetrics.connected);
      }

      // Update UI with detailed health metrics
      // The UIManager will automatically get the health metrics when updating status
    });

    // Add stream listener for tool execution results
    this.mcpService.addStreamListener("tool-result", (data) => {
      console.log("AppController: Received tool execution result:", data);
      try {
        const result = data as {
          toolName: string;
          result: unknown;
          diagramId?: string;
        };
        if (
          result.diagramId &&
          result.diagramId === this.diagramService.getCurrentDiagramId()
        ) {
          // Reload the current diagram if it was affected by the tool execution
          this.diagramService.loadDiagram(result.diagramId).then(() => {
            console.log("AppController: Diagram reloaded after tool execution");
          });
        }
      } catch (error) {
        console.error("Error handling tool result stream:", error);
      }
    });

    // Add stream listener for status updates
    this.mcpService.addStreamListener("status-update", (data) => {
      console.log("AppController: Received status update:", data);
      try {
        const status = data as {
          message: string;
          type: "info" | "warning" | "error";
        };
        this.uiManager.updateStatus(status.message);
      } catch (error) {
        console.error("Error handling status update stream:", error);
      }
    });

    // Add stream listener for AI assistant updates
    this.mcpService.addStreamListener("ai-response", (data) => {
      console.log("AppController: Received AI response stream:", data);
      // This will be used when AI assistant gets streaming responses
    });

    // Add notification listeners for server-initiated updates
    this.mcpService.addNotificationListener(
      "server-message",
      (notification) => {
        console.log(
          "AppController: Received server message notification:",
          notification,
        );
        try {
          const params = notification.params as {
            message: string;
            type: "info" | "warning" | "error";
          };
          this.uiManager.updateStatus(params.message);

          // Show additional UI feedback for important messages
          if (params.type === "error") {
            console.error("Server error message:", params.message);
          } else if (params.type === "warning") {
            console.warn("Server warning message:", params.message);
          }
        } catch (error) {
          console.error("Error handling server-message notification:", error);
        }
      },
    );

    this.mcpService.addNotificationListener(
      "collaboration-update",
      (notification) => {
        console.log(
          "AppController: Received collaboration update notification:",
          notification,
        );
        try {
          const params = notification.params as {
            userId: string;
            action: string;
            diagramId?: string;
          };
          // This can be used for collaborative editing features
          console.log(
            `Collaboration: User ${params.userId} performed ${params.action}`,
          );
        } catch (error) {
          console.error(
            "Error handling collaboration-update notification:",
            error,
          );
        }
      },
    );

    console.log("AppController: MCP streaming and notification setup complete");
  }

  /**
   * Show animated success feedback for operations
   */
  private async showOperationSuccess(message: string): Promise<void> {
    try {
      // Update UI status
      this.uiManager.updateStatus(message);

      // Show success animation on the status element
      const statusElement = document.querySelector(".status-text");
      if (statusElement && statusElement instanceof HTMLElement) {
        await MicroInteractions.showSuccess(statusElement);
      }

      // Create floating success notification
      this.showFloatingNotification(message, "success");

      console.log(`✅ Operation Success: ${message}`);
    } catch (error) {
      console.warn("Failed to show success animation:", error);
      // Fallback to standard status update
      this.uiManager.updateStatus(message);
    }
  }

  /**
   * Show animated error feedback for operations
   */
  private async showOperationError(
    message: string,
    error: Error,
  ): Promise<void> {
    try {
      // Update UI status
      this.uiManager.updateStatus(message);

      // Show error animation on the status element
      const statusElement = document.querySelector(".status-text");
      if (statusElement && statusElement instanceof HTMLElement) {
        await MicroInteractions.shake(statusElement);
      }

      // Create floating error notification
      this.showFloatingNotification(message, "error");

      console.error(`❌ Operation Error: ${message}`, error);
    } catch (animError) {
      console.warn("Failed to show error animation:", animError);
      // Fallback to standard status update
      this.uiManager.updateStatus(message);
    }
  }

  /**
   * Animate a newly created node with scale-in effect
   */
  private async animateNewNode(position: {
    x: number;
    y: number;
  }): Promise<void> {
    try {
      // Create a temporary visual element to represent the new node
      const canvas = this.renderer.getCanvas();
      if (!canvas) return;

      const nodeIndicator = document.createElement("div");
      nodeIndicator.style.cssText = `
        position: absolute;
        left: ${position.x}px;
        top: ${position.y}px;
        width: 60px;
        height: 40px;
        background: rgba(74, 158, 255, 0.8);
        border: 2px solid #4A9EFF;
        border-radius: 8px;
        pointer-events: none;
        z-index: 1000;
        transform-origin: center;
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        font-size: 20px;
      `;
      nodeIndicator.textContent = "✨";

      // Position relative to canvas
      const canvasRect = canvas.getBoundingClientRect();
      nodeIndicator.style.left = `${canvasRect.left + position.x - 30}px`;
      nodeIndicator.style.top = `${canvasRect.top + position.y - 20}px`;

      document.body.appendChild(nodeIndicator);

      // Animate the indicator
      await animationSystem.animate(nodeIndicator, {
        type: "custom",
        duration: 800,
        easing: "cubic-bezier(0.34, 1.56, 0.64, 1)", // Bouncy easing
        customKeyframes: [
          { transform: "scale(0) rotate(0deg)", opacity: 0 },
          { transform: "scale(1.2) rotate(180deg)", opacity: 1 },
          { transform: "scale(1) rotate(360deg)", opacity: 1 },
        ],
      });

      // Fade out and remove
      await animationSystem.animate(nodeIndicator, {
        type: "fade",
        duration: 300,
        easing: "ease-out",
        customKeyframes: [{ opacity: 0 }],
      });

      nodeIndicator.remove();
    } catch (error) {
      console.warn("Failed to animate new node:", error);
    }
  }

  /**
   * Show floating notification with animation
   */
  private showFloatingNotification(
    message: string,
    type: "success" | "error" | "info" = "info",
  ): void {
    const notification = document.createElement("div");
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      padding: 12px 20px;
      border-radius: 8px;
      color: white;
      font-weight: 500;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      z-index: 10000;
      max-width: 300px;
      transform: translateX(400px);
      transition: transform 0.3s ease;
    `;

    // Set colors based on type
    switch (type) {
      case "success":
        notification.style.background =
          "linear-gradient(135deg, #28a745, #20c997)";
        notification.innerHTML = `✅ ${message}`;
        break;
      case "error":
        notification.style.background =
          "linear-gradient(135deg, #dc3545, #e83e8c)";
        notification.innerHTML = `❌ ${message}`;
        break;
      default:
        notification.style.background =
          "linear-gradient(135deg, #667eea, #764ba2)";
        notification.innerHTML = `ℹ️ ${message}`;
        break;
    }

    document.body.appendChild(notification);

    // Animate in
    setTimeout(() => {
      notification.style.transform = "translateX(0)";
    }, 100);

    // Auto-remove after 3 seconds
    setTimeout(() => {
      notification.style.transform = "translateX(400px)";
      setTimeout(() => notification.remove(), 300);
    }, 3000);
  }

  /**
   * Log environment information for debugging
   */
  private logEnvironmentInfo(): void {
    import("./utils/environment.js")
      .then(({ logEnvironmentInfo }) => {
        logEnvironmentInfo();
      })
      .catch((error) => {
        console.log("Failed to load environment info:", error);
      });
  }
}
