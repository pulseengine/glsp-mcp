/**
 * Web-compatible workspace manager using browser storage
 */

export interface WebWorkspaceInfo {
  id: string;
  name: string;
  description: string;
  created: string;
  lastUsed: string;
  diagramsCount: number;
  componentsCount: number;
  isDefault: boolean;
}

export interface WorkspaceData {
  diagrams: any[];
  components: any[];
  settings: Record<string, any>;
}

export class WebWorkspaceManager {
  private static readonly STORAGE_KEY = "glsp_workspaces";
  private static readonly CURRENT_WORKSPACE_KEY = "glsp_current_workspace";
  private static readonly DEFAULT_WORKSPACE_ID = "default";

  /**
   * Get all available workspaces
   */
  public static getWorkspaces(): WebWorkspaceInfo[] {
    const stored = localStorage.getItem(this.STORAGE_KEY);
    if (!stored) {
      return [this.createDefaultWorkspace()];
    }

    try {
      const workspaces = JSON.parse(stored) as WebWorkspaceInfo[];
      // Ensure default workspace exists
      if (!workspaces.find((w) => w.id === this.DEFAULT_WORKSPACE_ID)) {
        workspaces.unshift(this.createDefaultWorkspace());
      }
      return workspaces;
    } catch (error) {
      console.error("Error parsing workspaces from storage:", error);
      return [this.createDefaultWorkspace()];
    }
  }

  /**
   * Get current workspace
   */
  public static getCurrentWorkspace(): WebWorkspaceInfo {
    const currentId =
      localStorage.getItem(this.CURRENT_WORKSPACE_KEY) ||
      this.DEFAULT_WORKSPACE_ID;
    const workspaces = this.getWorkspaces();
    return workspaces.find((w) => w.id === currentId) || workspaces[0];
  }

  /**
   * Set current workspace
   */
  public static setCurrentWorkspace(workspaceId: string): void {
    const workspaces = this.getWorkspaces();
    const workspace = workspaces.find((w) => w.id === workspaceId);

    if (!workspace) {
      throw new Error(`Workspace with ID '${workspaceId}' not found`);
    }

    // Update last used timestamp
    workspace.lastUsed = new Date().toISOString();
    this.saveWorkspaces(workspaces);

    localStorage.setItem(this.CURRENT_WORKSPACE_KEY, workspaceId);
  }

  /**
   * Create a new workspace
   */
  public static createWorkspace(
    name: string,
    description: string = "",
  ): WebWorkspaceInfo {
    const workspaces = this.getWorkspaces();

    // Check for duplicate names
    if (workspaces.find((w) => w.name === name)) {
      throw new Error(`Workspace with name '${name}' already exists`);
    }

    const newWorkspace: WebWorkspaceInfo = {
      id: this.generateWorkspaceId(),
      name,
      description,
      created: new Date().toISOString(),
      lastUsed: new Date().toISOString(),
      diagramsCount: 0,
      componentsCount: 0,
      isDefault: false,
    };

    workspaces.push(newWorkspace);
    this.saveWorkspaces(workspaces);

    // Initialize empty workspace data
    this.saveWorkspaceData(newWorkspace.id, {
      diagrams: [],
      components: [],
      settings: {},
    });

    return newWorkspace;
  }

  /**
   * Delete a workspace
   */
  public static deleteWorkspace(workspaceId: string): void {
    if (workspaceId === this.DEFAULT_WORKSPACE_ID) {
      throw new Error("Cannot delete the default workspace");
    }

    const workspaces = this.getWorkspaces();
    const index = workspaces.findIndex((w) => w.id === workspaceId);

    if (index === -1) {
      throw new Error(`Workspace with ID '${workspaceId}' not found`);
    }

    // Remove workspace
    workspaces.splice(index, 1);
    this.saveWorkspaces(workspaces);

    // Remove workspace data
    localStorage.removeItem(`glsp_workspace_data_${workspaceId}`);

    // If this was the current workspace, switch to default
    const currentId = localStorage.getItem(this.CURRENT_WORKSPACE_KEY);
    if (currentId === workspaceId) {
      this.setCurrentWorkspace(this.DEFAULT_WORKSPACE_ID);
    }
  }

  /**
   * Get workspace data
   */
  public static getWorkspaceData(workspaceId: string): WorkspaceData {
    const key = `glsp_workspace_data_${workspaceId}`;
    const stored = localStorage.getItem(key);

    if (!stored) {
      return {
        diagrams: [],
        components: [],
        settings: {},
      };
    }

    try {
      return JSON.parse(stored) as WorkspaceData;
    } catch (error) {
      console.error("Error parsing workspace data:", error);
      return {
        diagrams: [],
        components: [],
        settings: {},
      };
    }
  }

  /**
   * Save workspace data
   */
  public static saveWorkspaceData(
    workspaceId: string,
    data: WorkspaceData,
  ): void {
    const key = `glsp_workspace_data_${workspaceId}`;
    localStorage.setItem(key, JSON.stringify(data));

    // Update workspace stats
    this.updateWorkspaceStats(workspaceId);
  }

  /**
   * Import workspace from JSON
   */
  public static importWorkspace(name: string, data: any): WebWorkspaceInfo {
    const workspace = this.createWorkspace(name, "Imported workspace");

    try {
      const workspaceData: WorkspaceData = {
        diagrams: data.diagrams || [],
        components: data.components || [],
        settings: data.settings || {},
      };

      this.saveWorkspaceData(workspace.id, workspaceData);
      return workspace;
    } catch (error) {
      // Clean up if import fails
      this.deleteWorkspace(workspace.id);
      throw new Error(`Failed to import workspace: ${error}`);
    }
  }

  /**
   * Export workspace to JSON
   */
  public static exportWorkspace(workspaceId: string): any {
    const workspace = this.getWorkspaces().find((w) => w.id === workspaceId);
    if (!workspace) {
      throw new Error(`Workspace with ID '${workspaceId}' not found`);
    }

    const data = this.getWorkspaceData(workspaceId);

    return {
      workspace: {
        name: workspace.name,
        description: workspace.description,
        created: workspace.created,
        exported: new Date().toISOString(),
      },
      diagrams: data.diagrams,
      components: data.components,
      settings: data.settings,
    };
  }

  /**
   * Validate workspace integrity
   */
  public static validateWorkspace(workspaceId: string): {
    valid: boolean;
    issues: string[];
  } {
    const issues: string[] = [];

    try {
      const workspace = this.getWorkspaces().find((w) => w.id === workspaceId);
      if (!workspace) {
        issues.push("Workspace not found");
        return { valid: false, issues };
      }

      const data = this.getWorkspaceData(workspaceId);

      // Check data structure
      if (!Array.isArray(data.diagrams)) {
        issues.push("Invalid diagrams data structure");
      }

      if (!Array.isArray(data.components)) {
        issues.push("Invalid components data structure");
      }

      if (typeof data.settings !== "object") {
        issues.push("Invalid settings data structure");
      }

      // Validate diagram references
      data.diagrams.forEach((diagram, index) => {
        if (!diagram.id) {
          issues.push(`Diagram at index ${index} missing ID`);
        }
      });

      return { valid: issues.length === 0, issues };
    } catch (error) {
      issues.push(`Validation error: ${error}`);
      return { valid: false, issues };
    }
  }

  /**
   * Search workspaces
   */
  public static searchWorkspaces(query: string): WebWorkspaceInfo[] {
    const workspaces = this.getWorkspaces();
    const lowerQuery = query.toLowerCase();

    return workspaces.filter(
      (workspace) =>
        workspace.name.toLowerCase().includes(lowerQuery) ||
        workspace.description.toLowerCase().includes(lowerQuery),
    );
  }

  /**
   * Get workspace usage statistics
   */
  public static getUsageStats(): {
    totalWorkspaces: number;
    totalDiagrams: number;
    totalComponents: number;
    storageUsed: number;
  } {
    const workspaces = this.getWorkspaces();

    return {
      totalWorkspaces: workspaces.length,
      totalDiagrams: workspaces.reduce((sum, w) => sum + w.diagramsCount, 0),
      totalComponents: workspaces.reduce(
        (sum, w) => sum + w.componentsCount,
        0,
      ),
      storageUsed: this.calculateStorageUsage(),
    };
  }

  // Private helper methods

  private static createDefaultWorkspace(): WebWorkspaceInfo {
    return {
      id: this.DEFAULT_WORKSPACE_ID,
      name: "Default Workspace",
      description: "The default workspace for diagrams and components",
      created: new Date().toISOString(),
      lastUsed: new Date().toISOString(),
      diagramsCount: 0,
      componentsCount: 0,
      isDefault: true,
    };
  }

  private static generateWorkspaceId(): string {
    return `workspace_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private static saveWorkspaces(workspaces: WebWorkspaceInfo[]): void {
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(workspaces));
  }

  private static updateWorkspaceStats(workspaceId: string): void {
    const workspaces = this.getWorkspaces();
    const workspace = workspaces.find((w) => w.id === workspaceId);

    if (workspace) {
      const data = this.getWorkspaceData(workspaceId);
      workspace.diagramsCount = data.diagrams.length;
      workspace.componentsCount = data.components.length;
      workspace.lastUsed = new Date().toISOString();

      this.saveWorkspaces(workspaces);
    }
  }

  private static calculateStorageUsage(): number {
    let totalSize = 0;

    // Calculate size of all localStorage items with our prefixes
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (
        key &&
        (key.startsWith("glsp_") || key.startsWith("glsp_workspace_"))
      ) {
        const value = localStorage.getItem(key);
        if (value) {
          totalSize += new Blob([value]).size;
        }
      }
    }

    return totalSize;
  }
}
