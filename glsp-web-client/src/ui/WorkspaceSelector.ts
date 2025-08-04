import { detectEnvironment } from "../utils/environment.js";
import {
  WebWorkspaceManager,
  WebWorkspaceInfo,
} from "../workspace/WebWorkspaceManager.js";
import {
  workspaceOperationManager,
  WorkspaceOperationResult,
  OperationProgress,
} from "../workspace/WorkspaceOperationManager.js";
import { NotificationCenter } from "./NotificationCenter.js";
// Import CSS styles
import "./WorkspaceSelector.css";

interface WorkspaceInfo {
  path: string;
  name: string;
  last_used: string;
  diagrams_count: number;
  wasm_components_count: number;
}

interface WorkspaceCreateDialogOptions {
  name: string;
  description?: string;
}

interface WorkspaceOperationResult {
  success: boolean;
  message: string;
  data?: unknown;
  error?: Error;
}

interface WorkspaceOperation {
  id: string;
  type: "select" | "create" | "validate" | "browse";
  timestamp: Date;
  result?: WorkspaceOperationResult;
  retryable: boolean;
}

declare global {
  interface Window {
    __TAURI__: {
      invoke: (command: string, args?: any) => Promise<any>;
    };
  }
}

export class WorkspaceSelector {
  private container: HTMLElement;
  private isOpen = false;
  private currentWorkspace: string | null = null;
  private onWorkspaceSelected: (workspace: string) => void;
  private notificationCenter: NotificationCenter;
  private currentOperationId: string | null = null;
  private progressElement: HTMLElement | null = null;
  private operationInProgress = false;
  private lastOperationResult: WorkspaceOperationResult | null = null;
  private operationHistory: WorkspaceOperation[] = [];
  private currentOperation: WorkspaceOperation | null = null;

  constructor(
    container: HTMLElement,
    onWorkspaceSelected: (workspace: string) => void,
  ) {
    this.container = container;
    this.onWorkspaceSelected = onWorkspaceSelected;
    this.notificationCenter = NotificationCenter.getInstance();
    this.initialize();
  }

  private initialize(): void {
    this.createUI();
    this.loadCurrentWorkspace();
  }

  public createSidebarSection(): any {
    const env = detectEnvironment();

    // Show workspace selector in both desktop and web modes
    console.log(
      "WorkspaceSelector: Creating sidebar section for",
      env.platform,
    );

    // Create the workspace selector content
    const content = document.createElement("div");
    content.innerHTML = `
            <div class="workspace-selector-sidebar">
                <div class="current-workspace">
                    <div class="workspace-info">
                        <span class="workspace-icon">📁</span>
                        <div class="workspace-details">
                            <div id="workspace-name" class="workspace-name">Default Workspace</div>
                            <div id="workspace-path" class="workspace-path">/default/path</div>
                        </div>
                    </div>
                </div>
                <div class="workspace-actions">
                    <button id="browse-workspace" class="workspace-action-btn">
                        <span class="action-icon">🔍</span>
                        Browse...
                    </button>
                    <button id="create-workspace" class="workspace-action-btn">
                        <span class="action-icon">➕</span>
                        Create...
                    </button>
                    <button id="validate-workspace" class="workspace-action-btn">
                        <span class="action-icon">✓</span>
                        Validate
                    </button>
                    <div id="operation-feedback" class="operation-feedback hidden">
                        <div class="operation-progress">
                            <div class="progress-bar"></div>
                        </div>
                        <div class="operation-status"></div>
                    </div>
                </div>
                <div id="recent-workspaces" class="recent-workspaces">
                    <h4>Recent Workspaces</h4>
                    <div id="workspace-items" class="workspace-items">
                        <!-- Recent workspace items will be populated here -->
                    </div>
                </div>
            </div>
        `;

    // Set up container reference and attach event listeners
    this.container = content;
    this.attachEventListeners();
    this.loadRecentWorkspaces();
    this.loadCurrentWorkspace();

    return {
      id: "workspace",
      title: "Workspace",
      icon: "📁",
      collapsible: true,
      collapsed: false,
      order: 0, // Show at top
      content: content,
    };
  }

  private createUI(): void {
    const env = detectEnvironment();
    console.log("WorkspaceSelector: Environment detected:", env);
    console.log("WorkspaceSelector: Tauri API available:", !!window.__TAURI__);

    console.log("WorkspaceSelector: Creating UI for", env.platform, "mode");

    this.container.innerHTML = `
            <div class="workspace-selector">
                <button id="workspace-button" class="workspace-button">
                    <span class="workspace-icon">📁</span>
                    <span id="workspace-name">Default Workspace</span>
                    <span class="workspace-arrow">▼</span>
                </button>
                <div id="workspace-dropdown" class="workspace-dropdown hidden">
                    <div class="workspace-header">
                        <h3>Select Workspace</h3>
                        <div class="workspace-buttons">
                            <button id="browse-workspace" class="browse-button">
                                <span class="browse-icon">🔍</span>
                                Browse...
                            </button>
                            <button id="create-workspace" class="create-button">
                                <span class="create-icon">➕</span>
                                Create...
                            </button>
                            <button id="validate-workspace" class="validate-button">
                                <span class="validate-icon">✓</span>
                                Validate
                            </button>
                        </div>
                    </div>
                    <div id="operation-feedback" class="operation-feedback hidden">
                        <div class="operation-progress">
                            <div class="progress-bar"></div>
                        </div>
                        <div class="operation-status"></div>
                    </div>
                    <div class="workspace-list">
                        <div id="recent-workspaces" class="recent-workspaces">
                            <h4>Recent Workspaces</h4>
                            <div id="workspace-items" class="workspace-items">
                                <!-- Recent workspace items will be populated here -->
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;

    this.attachEventListeners();
    this.loadRecentWorkspaces();
  }

  private attachEventListeners(): void {
    const workspaceButton = this.container.querySelector(
      "#workspace-button",
    ) as HTMLButtonElement;
    const workspaceDropdown = this.container.querySelector(
      "#workspace-dropdown",
    ) as HTMLElement;
    const browseButton = this.container.querySelector(
      "#browse-workspace",
    ) as HTMLButtonElement;
    const createButton = this.container.querySelector(
      "#create-workspace",
    ) as HTMLButtonElement;
    const validateButton = this.container.querySelector(
      "#validate-workspace",
    ) as HTMLButtonElement;

    if (workspaceButton) {
      workspaceButton.addEventListener("click", () => {
        this.toggleDropdown();
      });
    }

    if (browseButton) {
      browseButton.addEventListener("click", () => {
        this.openWorkspaceDialog();
      });
    }

    if (createButton) {
      createButton.addEventListener("click", () => {
        this.createWorkspaceDialog();
      });
    }

    if (validateButton) {
      validateButton.addEventListener("click", () => {
        this.handleWorkspaceOperation(() => this.validateCurrentWorkspace());
      });
    }

    // Close dropdown when clicking outside
    document.addEventListener("click", (event) => {
      if (!this.container.contains(event.target as Node)) {
        this.closeDropdown();
      }
    });
  }

  private toggleDropdown(): void {
    const dropdown = this.container.querySelector(
      "#workspace-dropdown",
    ) as HTMLElement;
    if (dropdown) {
      if (this.isOpen) {
        this.closeDropdown();
      } else {
        this.openDropdown();
      }
    }
  }

  private openDropdown(): void {
    const dropdown = this.container.querySelector(
      "#workspace-dropdown",
    ) as HTMLElement;
    if (dropdown) {
      dropdown.classList.remove("hidden");
      this.isOpen = true;
      this.loadRecentWorkspaces(); // Refresh the list
    }
  }

  private closeDropdown(): void {
    const dropdown = this.container.querySelector(
      "#workspace-dropdown",
    ) as HTMLElement;
    if (dropdown) {
      dropdown.classList.add("hidden");
      this.isOpen = false;
    }
  }

  private async openWorkspaceDialog(): Promise<void> {
    return this.handleWorkspaceOperation(async () => {
      const env = detectEnvironment();
      if (env.isTauri) {
        const result = await window.__TAURI__.invoke(
          "select_workspace_directory",
        );
        if (result) {
          await this.selectWorkspace(result);
          return { success: true, message: "Workspace selected successfully" };
        } else {
          return { success: false, message: "No workspace selected" };
        }
      } else {
        // Show web workspace browser
        this.showWebWorkspaceBrowser();
        return { success: true, message: "Workspace browser opened" };
      }
    }, "browse");
  }

  private async selectWorkspace(workspaceIdentifier: string): Promise<void> {
    try {
      const env = detectEnvironment();
      if (env.isTauri) {
        // Set workspace directory using MCP (no server restart needed)
        const result = await window.__TAURI__.invoke(
          "set_workspace_directory",
          {
            workspacePath: workspaceIdentifier,
            createIfMissing: true,
          },
        );

        // Add to recent workspaces
        await window.__TAURI__.invoke("add_recent_workspace", {
          workspacePath: workspaceIdentifier,
        });

        // Rescan workspace to discover existing files
        try {
          await window.__TAURI__.invoke("rescan_workspace");
          console.log("Workspace rescan completed successfully");
        } catch (rescanError) {
          console.warn("Workspace rescan failed:", rescanError);
          // Continue with workspace selection even if rescan fails
          this.showError(
            "Warning: File rescan failed, some files may not be immediately visible",
          );
        }

        // Update UI
        this.currentWorkspace = workspaceIdentifier;
        this.updateWorkspaceDisplay();
        this.updateWindowTitle();

        // Close dropdown
        this.closeDropdown();

        // Notify parent component
        this.onWorkspaceSelected(workspaceIdentifier);

        this.showSuccess(`Workspace changed to: ${workspaceIdentifier}`);
      } else {
        // Web mode - workspaceIdentifier is workspace ID
        WebWorkspaceManager.setCurrentWorkspace(workspaceIdentifier);
        const workspace = WebWorkspaceManager.getCurrentWorkspace();

        // Update UI
        this.currentWorkspace = workspace.name;
        this.updateWorkspaceDisplay();
        this.updateWindowTitle();

        // Close dropdown
        this.closeDropdown();

        // Notify parent component
        this.onWorkspaceSelected(workspace.name);

        this.showSuccess(`Workspace changed to: ${workspace.name}`);
      }
    } catch (error) {
      console.error("Error selecting workspace:", error);
      this.showError(
        "Failed to select workspace: " + (error as any).message || error,
      );
    }
  }

  public async loadRecentWorkspaces(): Promise<void> {
    try {
      const env = detectEnvironment();
      if (env.isTauri) {
        const workspaces: WorkspaceInfo[] = await window.__TAURI__.invoke(
          "get_recent_workspaces",
        );
        this.displayRecentWorkspaces(workspaces);
      } else {
        const webWorkspaces = WebWorkspaceManager.getWorkspaces();
        this.displayWebWorkspaces(webWorkspaces);
      }
    } catch (error) {
      console.error("Error loading recent workspaces:", error);
    }
  }

  private displayRecentWorkspaces(workspaces: WorkspaceInfo[]): void {
    const workspaceItems = this.container.querySelector(
      "#workspace-items",
    ) as HTMLElement;
    if (!workspaceItems) return;

    if (workspaces.length === 0) {
      workspaceItems.innerHTML =
        '<p class="no-workspaces">No recent workspaces</p>';
      return;
    }

    workspaceItems.innerHTML = workspaces
      .map(
        (workspace) => `
            <div class="workspace-item" data-path="${workspace.path}">
                <div class="workspace-item-main">
                    <div class="workspace-item-name">${workspace.name}</div>
                    <div class="workspace-item-path">${workspace.path}</div>
                </div>
                <div class="workspace-item-stats">
                    <span class="stat">📊 ${workspace.diagrams_count} diagrams</span>
                    <span class="stat">📦 ${workspace.wasm_components_count} components</span>
                </div>
            </div>
        `,
      )
      .join("");

    // Add click listeners to workspace items
    workspaceItems.querySelectorAll(".workspace-item").forEach((item) => {
      item.addEventListener("click", () => {
        const path = item.getAttribute("data-path");
        if (path) {
          this.selectWorkspace(path);
        }
      });
    });
  }

  private displayWebWorkspaces(workspaces: WebWorkspaceInfo[]): void {
    const workspaceItems = this.container.querySelector(
      "#workspace-items",
    ) as HTMLElement;
    if (!workspaceItems) return;

    if (workspaces.length === 0) {
      workspaceItems.innerHTML =
        '<p class="no-workspaces">No workspaces found</p>';
      return;
    }

    workspaceItems.innerHTML = workspaces
      .map(
        (workspace) => `
            <div class="workspace-item" data-id="${workspace.id}">
                <div class="workspace-item-main">
                    <div class="workspace-item-name">${workspace.name}</div>
                    <div class="workspace-item-path">${
                      workspace.description || "Web workspace"
                    }</div>
                </div>
                <div class="workspace-item-stats">
                    <span class="stat">📊 ${
                      workspace.diagramsCount
                    } diagrams</span>
                    <span class="stat">📦 ${
                      workspace.componentsCount
                    } components</span>
                </div>
                ${
                  !workspace.isDefault
                    ? '<div class="workspace-item-actions"><button class="delete-workspace-btn" title="Delete workspace">🗑️</button></div>'
                    : ""
                }
            </div>
        `,
      )
      .join("");

    // Add click listeners to workspace items
    workspaceItems.querySelectorAll(".workspace-item").forEach((item) => {
      item.addEventListener("click", (e) => {
        if (
          (e.target as HTMLElement).classList.contains("delete-workspace-btn")
        ) {
          e.stopPropagation();
          const id = item.getAttribute("data-id");
          if (id) {
            this.deleteWebWorkspace(id);
          }
        } else {
          const id = item.getAttribute("data-id");
          if (id) {
            this.selectWorkspace(id);
          }
        }
      });
    });
  }

  private showWebWorkspaceBrowser(): void {
    const modal = document.createElement("div");
    modal.className = "workspace-modal";
    modal.innerHTML = `
            <div class="workspace-modal-content">
                <div class="workspace-modal-header">
                    <h3>Select Workspace</h3>
                    <button class="workspace-modal-close">×</button>
                </div>
                <div class="workspace-modal-body">
                    <div class="workspace-search">
                        <input type="text" id="workspace-search" placeholder="Search workspaces..." />
                    </div>
                    <div id="workspace-browser-list" class="workspace-browser-list">
                        <!-- Workspaces will be populated here -->
                    </div>
                </div>
                <div class="workspace-modal-footer">
                    <button id="create-new-workspace" class="btn-primary">Create New Workspace</button>
                    <button class="workspace-modal-close btn-secondary">Cancel</button>
                </div>
            </div>
        `;

    document.body.appendChild(modal);
    this.populateWorkspaceBrowser(modal);
    this.attachWorkspaceBrowserEvents(modal);
  }

  private showWebWorkspaceCreateDialog(): void {
    const modal = document.createElement("div");
    modal.className = "workspace-modal";
    modal.innerHTML = `
            <div class="workspace-modal-content">
                <div class="workspace-modal-header">
                    <h3>Create New Workspace</h3>
                    <button class="workspace-modal-close">×</button>
                </div>
                <div class="workspace-modal-body">
                    <form id="create-workspace-form">
                        <div class="form-group">
                            <label for="workspace-name">Workspace Name *</label>
                            <input type="text" id="workspace-name" required maxlength="50" />
                        </div>
                        <div class="form-group">
                            <label for="workspace-description">Description</label>
                            <textarea id="workspace-description" maxlength="200" rows="3"></textarea>
                        </div>
                    </form>
                </div>
                <div class="workspace-modal-footer">
                    <button id="create-workspace-confirm" class="btn-primary">Create Workspace</button>
                    <button class="workspace-modal-close btn-secondary">Cancel</button>
                </div>
            </div>
        `;

    document.body.appendChild(modal);
    this.attachWorkspaceCreateEvents(modal);

    // Focus on name input
    const nameInput = modal.querySelector(
      "#workspace-name",
    ) as HTMLInputElement;
    if (nameInput) {
      nameInput.focus();
    }
  }

  private populateWorkspaceBrowser(modal: HTMLElement): void {
    const list = modal.querySelector("#workspace-browser-list") as HTMLElement;
    const workspaces = WebWorkspaceManager.getWorkspaces();

    list.innerHTML = workspaces
      .map(
        (workspace) => `
            <div class="workspace-browser-item" data-id="${workspace.id}">
                <div class="workspace-info">
                    <div class="workspace-name">${workspace.name}</div>
                    <div class="workspace-description">${
                      workspace.description || "No description"
                    }</div>
                    <div class="workspace-meta">
                        <span>Created: ${new Date(
                          workspace.created,
                        ).toLocaleDateString()}</span>
                        <span>Last used: ${new Date(
                          workspace.lastUsed,
                        ).toLocaleDateString()}</span>
                    </div>
                </div>
                <div class="workspace-stats">
                    <div class="stat">📊 ${workspace.diagramsCount}</div>
                    <div class="stat">📦 ${workspace.componentsCount}</div>
                </div>
                ${
                  !workspace.isDefault
                    ? '<button class="delete-workspace-btn" title="Delete workspace">🗑️</button>'
                    : ""
                }
            </div>
        `,
      )
      .join("");
  }

  private attachWorkspaceBrowserEvents(modal: HTMLElement): void {
    // Close modal events
    modal.querySelectorAll(".workspace-modal-close").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.body.removeChild(modal);
      });
    });

    // Click outside to close
    modal.addEventListener("click", (e) => {
      if (e.target === modal) {
        document.body.removeChild(modal);
      }
    });

    // Search functionality
    const searchInput = modal.querySelector(
      "#workspace-search",
    ) as HTMLInputElement;
    if (searchInput) {
      searchInput.addEventListener("input", () => {
        this.filterWorkspaces(modal, searchInput.value);
      });
    }

    // Workspace selection
    modal.addEventListener("click", (e) => {
      const item = (e.target as HTMLElement).closest(".workspace-browser-item");
      if (
        item &&
        !(e.target as HTMLElement).classList.contains("delete-workspace-btn")
      ) {
        const id = item.getAttribute("data-id");
        if (id) {
          this.selectWorkspace(id);
          document.body.removeChild(modal);
        }
      }
    });

    // Delete workspace
    modal.addEventListener("click", (e) => {
      if (
        (e.target as HTMLElement).classList.contains("delete-workspace-btn")
      ) {
        const item = (e.target as HTMLElement).closest(
          ".workspace-browser-item",
        );
        const id = item?.getAttribute("data-id");
        if (id) {
          this.deleteWebWorkspace(id);
          this.populateWorkspaceBrowser(modal);
        }
      }
    });

    // Create new workspace
    const createBtn = modal.querySelector(
      "#create-new-workspace",
    ) as HTMLButtonElement;
    if (createBtn) {
      createBtn.addEventListener("click", () => {
        document.body.removeChild(modal);
        this.showWebWorkspaceCreateDialog();
      });
    }
  }

  private attachWorkspaceCreateEvents(modal: HTMLElement): void {
    // Close modal events
    modal.querySelectorAll(".workspace-modal-close").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.body.removeChild(modal);
      });
    });

    // Click outside to close
    modal.addEventListener("click", (e) => {
      if (e.target === modal) {
        document.body.removeChild(modal);
      }
    });

    // Form submission
    const form = modal.querySelector(
      "#create-workspace-form",
    ) as HTMLFormElement;
    const createBtn = modal.querySelector(
      "#create-workspace-confirm",
    ) as HTMLButtonElement;

    const handleCreate = () => {
      const nameInput = modal.querySelector(
        "#workspace-name",
      ) as HTMLInputElement;
      const descInput = modal.querySelector(
        "#workspace-description",
      ) as HTMLTextAreaElement;

      const name = nameInput.value.trim();
      const description = descInput.value.trim();

      if (!name) {
        this.showError("Workspace name is required");
        nameInput.focus();
        return;
      }

      try {
        const workspace = WebWorkspaceManager.createWorkspace(
          name,
          description,
        );
        this.selectWorkspace(workspace.id);
        document.body.removeChild(modal);
        this.showSuccess(`Created workspace: ${name}`, { workspace });
      } catch (error) {
        this.showError((error as Error).message, error as Error);
      }
    };

    if (createBtn) {
      createBtn.addEventListener("click", handleCreate);
    }

    if (form) {
      form.addEventListener("submit", (e) => {
        e.preventDefault();
        handleCreate();
      });
    }
  }

  private filterWorkspaces(modal: HTMLElement, query: string): void {
    const items = modal.querySelectorAll(".workspace-browser-item");
    const lowerQuery = query.toLowerCase();

    items.forEach((item) => {
      const name =
        item.querySelector(".workspace-name")?.textContent?.toLowerCase() || "";
      const description =
        item
          .querySelector(".workspace-description")
          ?.textContent?.toLowerCase() || "";

      if (name.includes(lowerQuery) || description.includes(lowerQuery)) {
        (item as HTMLElement).style.display = "block";
      } else {
        (item as HTMLElement).style.display = "none";
      }
    });
  }

  private deleteWebWorkspace(workspaceId: string): void {
    if (
      !confirm(
        "Are you sure you want to delete this workspace? This action cannot be undone.",
      )
    ) {
      return;
    }

    try {
      WebWorkspaceManager.deleteWorkspace(workspaceId);
      this.loadRecentWorkspaces(); // Refresh the list
      this.showSuccess("Workspace deleted successfully", { workspaceId });
    } catch (error) {
      this.showError((error as Error).message, error as Error);
    }
  }

  private async loadCurrentWorkspace(): Promise<void> {
    try {
      const env = detectEnvironment();
      if (env.isTauri) {
        // Get current workspace info from MCP server
        const workspaceInfo =
          await window.__TAURI__.invoke("get_workspace_info");
        this.currentWorkspace = workspaceInfo.path;
        this.updateWorkspaceDisplay();
        this.updateWindowTitle();
      } else {
        // Use web workspace manager
        const currentWorkspace = WebWorkspaceManager.getCurrentWorkspace();
        this.currentWorkspace = currentWorkspace.name;
        this.updateWorkspaceDisplay();
        this.updateWindowTitle();
      }
    } catch (error) {
      console.error("Error loading current workspace:", error);
      const env = detectEnvironment();
      if (env.isTauri) {
        // Fallback to app data directory if MCP call fails
        try {
          const appDataDir = await window.__TAURI__.invoke("get_app_data_dir");
          this.currentWorkspace = appDataDir;
          this.updateWorkspaceDisplay();
          this.updateWindowTitle();
        } catch (fallbackError) {
          console.error("Error loading app data directory:", fallbackError);
        }
      } else {
        // Web fallback - use default workspace
        this.currentWorkspace = "Default Workspace";
        this.updateWorkspaceDisplay();
        this.updateWindowTitle();
      }
    }
  }

  private updateWorkspaceDisplay(): void {
    const workspaceName = this.container.querySelector(
      "#workspace-name",
    ) as HTMLElement;
    const workspacePath = this.container.querySelector(
      "#workspace-path",
    ) as HTMLElement;

    if (workspaceName && this.currentWorkspace) {
      const name =
        this.currentWorkspace.split("/").pop() || "Default Workspace";
      workspaceName.textContent = name;
    }

    if (workspacePath && this.currentWorkspace) {
      // Show a shortened path for the sidebar
      const pathParts = this.currentWorkspace.split("/");
      const shortPath =
        pathParts.length > 3
          ? `.../${pathParts.slice(-2).join("/")}`
          : this.currentWorkspace;
      workspacePath.textContent = shortPath;
      workspacePath.title = this.currentWorkspace; // Full path on hover
    }
  }

  private updateWindowTitle(): void {
    if (this.currentWorkspace) {
      const workspaceName =
        this.currentWorkspace.split("/").pop() || "Default Workspace";
      document.title = `WASM Component Designer - ${workspaceName}`;
    } else {
      document.title = "WASM Component Designer";
    }
  }

  private showError(message: string, error?: Error): void {
    console.error(message, error);
    this.notificationCenter.addNotification({
      title: "Workspace Error",
      message,
      type: "error",
      category: "workspace",
      actions: this.currentOperation?.retryable
        ? [
            {
              label: "Retry",
              action: () => this.retryLastOperation(),
              style: "primary",
            },
          ]
        : undefined,
    });
  }

  private showSuccess(message: string, data?: unknown): void {
    console.log(message, data);
    this.notificationCenter.addNotification({
      title: "Workspace Success",
      message,
      type: "success",
      category: "workspace",
      autoHide: true,
      duration: 3000,
    });
  }

  private showProgress(message: string): void {
    const feedback = this.container.querySelector(
      "#operation-feedback",
    ) as HTMLElement;
    const status = this.container.querySelector(
      ".operation-status",
    ) as HTMLElement;

    if (feedback && status) {
      feedback.classList.remove("hidden");
      status.textContent = message;
      this.startProgressAnimation();
    }
  }

  private hideProgress(): void {
    const feedback = this.container.querySelector(
      "#operation-feedback",
    ) as HTMLElement;
    if (feedback) {
      feedback.classList.add("hidden");
      this.stopProgressAnimation();
    }
  }

  private startProgressAnimation(): void {
    const progressBar = this.container.querySelector(
      ".progress-bar",
    ) as HTMLElement;
    if (progressBar) {
      progressBar.style.animation = "progress-loading 2s ease-in-out infinite";
    }
  }

  private stopProgressAnimation(): void {
    const progressBar = this.container.querySelector(
      ".progress-bar",
    ) as HTMLElement;
    if (progressBar) {
      progressBar.style.animation = "none";
    }
  }

  private async handleWorkspaceOperation(
    operation: () => Promise<WorkspaceOperationResult | void>,
    type: WorkspaceOperation["type"] = "select",
  ): Promise<void> {
    if (this.operationInProgress) {
      this.showError("Another workspace operation is already in progress");
      return;
    }

    const operationId = this.generateOperationId();
    this.currentOperation = {
      id: operationId,
      type,
      timestamp: new Date(),
      retryable: true,
    };

    this.operationInProgress = true;
    this.showProgress(
      `${type.charAt(0).toUpperCase() + type.slice(1)}ing workspace...`,
    );

    try {
      const result = await operation();
      const operationResult: WorkspaceOperationResult = result || {
        success: true,
        message: "Operation completed successfully",
      };

      this.lastOperationResult = operationResult;
      this.currentOperation.result = operationResult;
      this.operationHistory.push(this.currentOperation);

      if (operationResult.success) {
        this.showSuccess(operationResult.message, operationResult.data);
      } else {
        this.showError(operationResult.message, operationResult.error);
      }
    } catch (error) {
      const operationResult: WorkspaceOperationResult = {
        success: false,
        message: `${type} operation failed: ${(error as Error).message}`,
        error: error as Error,
      };

      this.lastOperationResult = operationResult;
      this.currentOperation.result = operationResult;
      this.operationHistory.push(this.currentOperation);

      this.showError(operationResult.message, operationResult.error);
    } finally {
      this.operationInProgress = false;
      this.hideProgress();
      this.currentOperation = null;
    }
  }

  private retryLastOperation(): void {
    if (!this.currentOperation || this.operationInProgress) {
      return;
    }

    const lastOperation =
      this.operationHistory[this.operationHistory.length - 1];
    if (!lastOperation || !lastOperation.retryable) {
      this.showError("Last operation cannot be retried");
      return;
    }

    // Retry the operation based on its type
    switch (lastOperation.type) {
      case "browse":
        this.openWorkspaceDialog();
        break;
      case "create":
        this.createWorkspaceDialog();
        break;
      case "validate":
        this.handleWorkspaceOperation(
          () => this.validateCurrentWorkspace(),
          "validate",
        );
        break;
      case "select":
        if (this.currentWorkspace) {
          this.handleWorkspaceOperation(
            () => this.selectWorkspace(this.currentWorkspace!),
            "select",
          );
        }
        break;
      default:
        this.showError("Unknown operation type for retry");
    }
  }

  private generateOperationId(): string {
    return `workspace-op-${Date.now()}-${Math.random()
      .toString(36)
      .substr(2, 9)}`;
  }

  public getOperationHistory(): WorkspaceOperation[] {
    return [...this.operationHistory];
  }

  public clearOperationHistory(): void {
    this.operationHistory = [];
  }

  private async createWorkspaceDialog(): Promise<void> {
    return this.handleWorkspaceOperation(async () => {
      const env = detectEnvironment();
      if (env.isTauri) {
        const result = await window.__TAURI__.invoke(
          "select_workspace_directory",
        );
        if (result) {
          // Create workspace structure
          await window.__TAURI__.invoke("create_workspace_structure", {
            workspacePath: result,
          });
          await this.selectWorkspace(result);
          return {
            success: true,
            message: `Created workspace structure at: ${result}`,
            data: { path: result },
          };
        } else {
          return {
            success: false,
            message: "No directory selected for workspace creation",
          };
        }
      } else {
        // Show web workspace creation dialog
        this.showWebWorkspaceCreateDialog();
        return { success: true, message: "Workspace creation dialog opened" };
      }
    }, "create");
  }

  private async validateCurrentWorkspace(): Promise<WorkspaceOperationResult> {
    if (!this.currentWorkspace) {
      return {
        success: false,
        message: "No workspace selected",
        error: new Error("No workspace selected"),
      };
    }

    const env = detectEnvironment();
    if (env.isTauri) {
      const validationResult = await window.__TAURI__.invoke(
        "validate_workspace",
        {
          workspacePath: this.currentWorkspace,
        },
      );

      if (validationResult.valid) {
        return {
          success: true,
          message: "Workspace validation passed",
          data: validationResult,
        };
      } else {
        return {
          success: false,
          message:
            "Workspace validation failed: " +
            validationResult.issues?.join(", "),
          data: validationResult,
          error: new Error("Validation failed"),
        };
      }
    } else {
      // Web mode validation
      const currentWorkspace = WebWorkspaceManager.getCurrentWorkspace();
      const validationResult = WebWorkspaceManager.validateWorkspace(
        currentWorkspace.id,
      );

      if (validationResult.valid) {
        return {
          success: true,
          message: "Workspace validation passed",
          data: validationResult,
        };
      } else {
        return {
          success: false,
          message:
            "Workspace validation failed: " +
            validationResult.issues.join(", "),
          data: validationResult,
          error: new Error("Validation failed"),
        };
      }
    }
  }
}
