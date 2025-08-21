import { SidebarSection } from "../SidebarComponent.js";
import { diagramTypeRegistry } from "../../../diagrams/diagram-type-registry.js";
import {
  statusManager,
  StatusListener,
  CombinedStatus,
  DiagramSyncStatus,
} from "../../../services/StatusManager.js";

export class DiagramControlsSection {
  private currentDiagramType: string = "workflow";
  private onDiagramTypeChange?: (type: string) => void;
  private element?: HTMLElement;
  private statusListener?: StatusListener;
  private currentDiagramElement?: HTMLElement;
  private timeUpdateInterval?: number;

  constructor(onDiagramTypeChange?: (type: string) => void) {
    this.onDiagramTypeChange = onDiagramTypeChange;

    // Listen to status changes
    this.statusListener = (status: CombinedStatus) => {
      this.updateCurrentDiagramDisplay(status);
      this.startTimeUpdateTimer();
    };
    statusManager.addListener(this.statusListener);
  }

  public destroy(): void {
    if (this.statusListener) {
      statusManager.removeListener(this.statusListener);
    }
    if (this.timeUpdateInterval) {
      clearInterval(this.timeUpdateInterval);
    }
  }

  public setDiagramType(type: string): void {
    this.currentDiagramType = type;
    this.refresh();
  }

  public createSection(): SidebarSection {
    this.element = this.createContent();
    return {
      id: "diagram-controls",
      title: "Diagram Controls",
      icon: "⚙️",
      collapsible: false,
      collapsed: false,
      order: 0,
      content: this.element,
    };
  }

  private createContent(): HTMLElement {
    const container = document.createElement("div");
    container.className = "diagram-controls-container";
    container.style.cssText = `
            display: flex;
            flex-direction: column;
            gap: 12px;
        `;

    // Current diagram status
    this.currentDiagramElement = this.createCurrentDiagramStatus();
    container.appendChild(this.currentDiagramElement);

    // Diagram type selector
    const typeSection = this.createDiagramTypeSelector();
    container.appendChild(typeSection);

    // View controls
    const viewSection = this.createViewControls();
    container.appendChild(viewSection);

    return container;
  }

  private createDiagramTypeSelector(): HTMLElement {
    const section = document.createElement("div");
    section.className = "diagram-type-section";
    section.style.cssText = `
            background: var(--bg-secondary, #151B2C);
            border-radius: 6px;
            padding: 12px;
        `;

    // Label
    const label = document.createElement("label");
    label.textContent = "Diagram Type";
    label.style.cssText = `
            display: block;
            font-size: 13px;
            font-weight: 600;
            color: var(--text-primary, #E6EDF3);
            margin-bottom: 8px;
        `;
    section.appendChild(label);

    // Select dropdown
    const select = document.createElement("select");
    select.className = "diagram-type-select";
    select.style.cssText = `
            width: 100%;
            padding: 8px 12px;
            background: var(--bg-primary, #0F1419);
            border: 1px solid var(--border-color, #2A3441);
            border-radius: 6px;
            color: var(--text-primary, #E6EDF3);
            font-size: 14px;
            cursor: pointer;
            transition: all 0.2s ease;
        `;

    // Populate options
    const availableTypes = diagramTypeRegistry.getAvailableTypes();
    availableTypes.forEach((type) => {
      const option = document.createElement("option");
      option.value = type.type;
      option.textContent = type.label;
      option.selected = type.type === this.currentDiagramType;
      select.appendChild(option);
    });

    // Event handler - Only handle ACTUAL diagram type changes
    select.addEventListener("change", (e) => {
      const newType = (e.target as HTMLSelectElement).value;
      const currentType = this.currentDiagramType;

      // Only proceed if it's a real diagram type change
      if (newType !== currentType) {
        this.currentDiagramType = newType;
        console.log(
          `DiagramControlsSection: Actual diagram type change from ${currentType} to ${newType}`,
        );

        // This should only be called for true diagram type changes (workflow -> bpmn)
        // NOT for view mode changes (component -> wit-interface)
        this.onDiagramTypeChange?.(newType);
      }
    });

    select.addEventListener("focus", () => {
      select.style.borderColor = "var(--accent-wasm, #654FF0)";
    });

    select.addEventListener("blur", () => {
      select.style.borderColor = "var(--border-color, #2A3441)";
    });

    section.appendChild(select);
    return section;
  }

  private createViewControls(): HTMLElement {
    const section = document.createElement("div");
    section.className = "view-controls-section";
    section.style.cssText = `
            background: var(--bg-secondary, #151B2C);
            border-radius: 6px;
            padding: 12px;
        `;

    // Label
    const label = document.createElement("label");
    label.textContent = "View Controls";
    label.style.cssText = `
            display: block;
            font-size: 13px;
            font-weight: 600;
            color: var(--text-primary, #E6EDF3);
            margin-bottom: 8px;
        `;
    section.appendChild(label);

    // Control buttons grid
    const grid = document.createElement("div");
    grid.style.cssText = `
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 6px;
        `;

    const controls = [
      {
        id: "zoom-in",
        icon: "🔍+",
        label: "Zoom In",
        action: "toolbar-zoom",
        data: { direction: "in" },
      },
      {
        id: "zoom-out",
        icon: "🔍-",
        label: "Zoom Out",
        action: "toolbar-zoom",
        data: { direction: "out" },
      },
      {
        id: "fit-content",
        icon: "⊞",
        label: "Fit Content",
        action: "toolbar-fit-content",
      },
      {
        id: "reset-view",
        icon: "🏠",
        label: "Reset View",
        action: "toolbar-reset-view",
      },
    ];

    controls.forEach((control) => {
      const button = document.createElement("button");
      button.className = "view-control-btn";
      button.title = control.label;
      button.style.cssText = `
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                gap: 2px;
                padding: 8px 4px;
                background: var(--bg-primary, #0F1419);
                border: 1px solid var(--border-color, #2A3441);
                border-radius: 4px;
                color: var(--text-secondary, #7D8590);
                cursor: pointer;
                transition: all 0.2s ease;
                font-size: 11px;
            `;

      // Icon
      const icon = document.createElement("div");
      icon.textContent = control.icon;
      icon.style.fontSize = "16px";
      button.appendChild(icon);

      // Label
      const labelDiv = document.createElement("div");
      labelDiv.textContent = control.label.split(" ")[0]; // First word only
      labelDiv.style.fontSize = "9px";
      button.appendChild(labelDiv);

      // Event handlers
      button.addEventListener("click", () => {
        window.dispatchEvent(
          new CustomEvent(control.action, {
            detail: control.data || {},
          }),
        );
      });

      button.addEventListener("mouseenter", () => {
        button.style.background = "var(--bg-tertiary, #1C2333)";
        button.style.borderColor = "var(--accent-wasm, #654FF0)";
        button.style.color = "var(--text-primary, #E6EDF3)";
      });

      button.addEventListener("mouseleave", () => {
        button.style.background = "var(--bg-primary, #0F1419)";
        button.style.borderColor = "var(--border-color, #2A3441)";
        button.style.color = "var(--text-secondary, #7D8590)";
      });

      grid.appendChild(button);
    });

    section.appendChild(grid);

    // Add interface names toggle for WASM components
    const toggleContainer = document.createElement("div");
    toggleContainer.style.cssText = `
            margin-top: 12px;
            padding-top: 12px;
            border-top: 1px solid var(--border-color, #2A3441);
        `;

    const toggleLabel = document.createElement("label");
    toggleLabel.style.cssText = `
            display: flex;
            align-items: center;
            justify-content: space-between;
            cursor: pointer;
            font-size: 12px;
            color: var(--text-primary, #E6EDF3);
        `;

    const labelText = document.createElement("span");
    labelText.textContent = "Show Interface Names";
    toggleLabel.appendChild(labelText);

    const toggleSwitch = document.createElement("input");
    toggleSwitch.type = "checkbox";
    toggleSwitch.id = "show-interface-names";
    toggleSwitch.checked =
      localStorage.getItem("showInterfaceNames") === "true";
    toggleSwitch.style.cssText = `
            cursor: pointer;
            width: 16px;
            height: 16px;
        `;

    // Handle toggle change
    toggleSwitch.addEventListener("change", (e) => {
      const checked = (e.target as HTMLInputElement).checked;
      localStorage.setItem("showInterfaceNames", checked.toString());
      window.dispatchEvent(
        new CustomEvent("toggle-interface-names", {
          detail: { show: checked },
        }),
      );
    });

    toggleLabel.appendChild(toggleSwitch);
    toggleContainer.appendChild(toggleLabel);
    section.appendChild(toggleContainer);

    return section;
  }

  private createCurrentDiagramStatus(): HTMLElement {
    const section = document.createElement("div");
    section.className = "current-diagram-status";
    section.style.cssText = `
            background: var(--bg-secondary, #151B2C);
            border-radius: 6px;
            padding: 12px;
            border-left: 3px solid var(--accent-wasm, #654FF0);
        `;

    const status = statusManager.getCombinedStatus();
    this.populateCurrentDiagramStatus(section, status);

    return section;
  }

  private populateCurrentDiagramStatus(
    section: HTMLElement,
    status: CombinedStatus,
  ): void {
    section.innerHTML = "";

    // Header with label
    const header = document.createElement("div");
    header.style.cssText = `
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 8px;
        `;

    const label = document.createElement("div");
    label.textContent = "Current Diagram";
    label.style.cssText = `
            font-size: 13px;
            font-weight: 600;
            color: var(--text-primary, #E6EDF3);
        `;
    header.appendChild(label);

    // Header right side with sync status and close button
    const headerRight = document.createElement("div");
    headerRight.style.cssText = `
            display: flex;
            align-items: center;
            gap: 8px;
        `;

    // Sync status indicator
    const syncIcon = this.getSyncStatusIcon(status.diagram.syncStatus);
    const syncElement = document.createElement("div");
    syncElement.innerHTML = syncIcon.icon;
    syncElement.title = syncIcon.tooltip;
    syncElement.style.cssText = `
            font-size: 16px;
            color: ${syncIcon.color};
        `;
    headerRight.appendChild(syncElement);

    // Close button (only show if there's a current diagram)
    if (status.diagram.currentDiagramName) {
      const closeButton = document.createElement("button");
      closeButton.innerHTML = "×";
      closeButton.title = "Close current diagram";
      closeButton.style.cssText = `
                background: none;
                border: none;
                color: var(--text-secondary, #7D8590);
                cursor: pointer;
                padding: 2px 4px;
                border-radius: 3px;
                font-size: 16px;
                line-height: 1;
                transition: all 0.2s ease;
            `;

      closeButton.addEventListener("click", () => {
        console.log(
          "DiagramControlsSection: User clicked close diagram button",
        );
        statusManager.clearCurrentDiagram();
        // Dispatch event to clear canvas
        window.dispatchEvent(new CustomEvent("diagram-close-requested"));
        // Force header icon update
        window.dispatchEvent(new CustomEvent("force-header-icon-update"));
      });

      closeButton.addEventListener("mouseenter", () => {
        closeButton.style.background = "var(--accent-error, #F85149)";
        closeButton.style.color = "white";
      });

      closeButton.addEventListener("mouseleave", () => {
        closeButton.style.background = "none";
        closeButton.style.color = "var(--text-secondary, #7D8590)";
      });

      headerRight.appendChild(closeButton);
    }

    header.appendChild(headerRight);

    section.appendChild(header);

    // Diagram name or no diagram message
    const nameElement = document.createElement("div");
    if (status.diagram.currentDiagramName) {
      nameElement.textContent = status.diagram.currentDiagramName;
      nameElement.style.cssText = `
                font-size: 14px;
                font-weight: 500;
                color: var(--text-primary, #E6EDF3);
                margin-bottom: 4px;
                word-wrap: break-word;
            `;
    } else {
      nameElement.textContent = "No diagram loaded";
      nameElement.style.cssText = `
                font-size: 14px;
                color: var(--text-secondary, #7D8590);
                font-style: italic;
                margin-bottom: 4px;
            `;
    }
    section.appendChild(nameElement);

    // Status details
    const detailsElement = document.createElement("div");
    detailsElement.style.cssText = `
            font-size: 12px;
            color: var(--text-secondary, #7D8590);
            display: flex;
            flex-direction: column;
            gap: 2px;
        `;

    if (status.diagram.currentDiagramId) {
      // Last saved info or status
      if (status.diagram.lastSaved) {
        const timeAgo = this.getTimeAgo(status.diagram.lastSaved);
        const savedElement = document.createElement("div");
        savedElement.textContent = `Last saved: ${timeAgo}`;
        detailsElement.appendChild(savedElement);
      } else if (status.diagram.hasUnsavedChanges) {
        const statusElement = document.createElement("div");
        statusElement.textContent = "Modified (not saved)";
        statusElement.style.color = "var(--text-secondary, #7D8590)";
        detailsElement.appendChild(statusElement);
      } else {
        const statusElement = document.createElement("div");
        statusElement.textContent = "Loaded from server";
        statusElement.style.color = "var(--text-secondary, #7D8590)";
        detailsElement.appendChild(statusElement);
      }

      // Unsaved changes warning
      if (status.diagram.hasUnsavedChanges) {
        const unsavedElement = document.createElement("div");
        unsavedElement.textContent = "⚠️ Unsaved changes";
        unsavedElement.style.color = "var(--accent-warning, #F7CC33)";
        detailsElement.appendChild(unsavedElement);
      }

      // Error message
      if (status.diagram.errorMessage) {
        const errorElement = document.createElement("div");
        errorElement.textContent = `❌ ${status.diagram.errorMessage}`;
        errorElement.style.color = "var(--accent-error, #F85149)";
        detailsElement.appendChild(errorElement);
      }
    }

    section.appendChild(detailsElement);
  }

  private getSyncStatusIcon(status: DiagramSyncStatus): {
    icon: string;
    color: string;
    tooltip: string;
  } {
    switch (status) {
      case "synced":
        return {
          icon: "✅",
          color: "var(--accent-success, #3FB950)",
          tooltip: "Saved",
        };
      case "saving":
        return {
          icon: "🔄",
          color: "var(--accent-wasm, #654FF0)",
          tooltip: "Saving...",
        };
      case "unsaved":
        return {
          icon: "⚠️",
          color: "var(--accent-warning, #F7CC33)",
          tooltip: "Unsaved changes",
        };
      case "error":
        return {
          icon: "❌",
          color: "var(--accent-error, #F85149)",
          tooltip: "Sync error",
        };
      case "loading":
        return {
          icon: "⏳",
          color: "var(--text-secondary, #7D8590)",
          tooltip: "Loading...",
        };
      case "none":
      default:
        return {
          icon: "⭕",
          color: "var(--text-secondary, #7D8590)",
          tooltip: "No diagram",
        };
    }
  }

  private getTimeAgo(date: Date): string {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSecs = Math.floor(diffMs / 1000);
    const diffMins = Math.floor(diffSecs / 60);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    // Show seconds for first minute
    if (diffSecs < 5) return "just now";
    if (diffSecs < 60) return `${diffSecs}s ago`;

    // Show minutes for first hour
    if (diffMins < 60) return `${diffMins}m ago`;

    // Show hours for first day
    if (diffHours < 24) return `${diffHours}h ago`;

    // Show days for first week
    if (diffDays < 7) return `${diffDays}d ago`;

    // Show full date for older saves
    return (
      date.toLocaleDateString() +
      " " +
      date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    );
  }

  private startTimeUpdateTimer(): void {
    // Clear existing timer
    if (this.timeUpdateInterval) {
      clearInterval(this.timeUpdateInterval);
    }

    // Update time display every 5 seconds for dynamic relative time
    this.timeUpdateInterval = window.setInterval(() => {
      const status = statusManager.getCombinedStatus();
      if (status.diagram.lastSaved) {
        this.updateCurrentDiagramDisplay(status);
      }
    }, 5000); // Update every 5 seconds
  }

  private updateCurrentDiagramDisplay(status: CombinedStatus): void {
    if (this.currentDiagramElement) {
      this.populateCurrentDiagramStatus(this.currentDiagramElement, status);
    }
  }

  public refresh(): void {
    if (this.element) {
      const newContent = this.createContent();
      this.element.replaceWith(newContent);
      this.element = newContent;
    }
  }
}
