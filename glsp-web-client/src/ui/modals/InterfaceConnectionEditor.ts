import { ComponentItem } from "../sidebar/sections/ComponentLibrarySection.js";

export interface WasmInterface {
  name: string;
  interfaceType: "import" | "export";
  functions: WasmFunction[];
}

export interface WasmFunction {
  name: string;
  params: WasmParam[];
  returns: WasmParam[];
}

export interface WasmParam {
  name: string;
  paramType: string;
}

export interface InterfaceConnection {
  id: string;
  sourceComponent: string;
  sourceInterface: string;
  sourceFunction?: string;
  targetComponent: string;
  targetInterface: string;
  targetFunction?: string;
  connectionType: "direct" | "shared" | "adapter";
  metadata: Record<string, unknown>;
}

export interface ExternalInterface {
  name: string;
  interfaceType: "import" | "export";
  sourceComponent: string;
  sourceInterface: string;
  functions: WasmFunction[];
}

export interface ComponentGroupData {
  name: string;
  description?: string;
  components: ComponentItem[];
  internalConnections: InterfaceConnection[];
  externalInterfaces: ExternalInterface[];
}

export class InterfaceConnectionEditor {
  private modal?: HTMLElement;
  private groupData: ComponentGroupData;
  private onSave?: (data: ComponentGroupData) => void;
  private onCancel?: () => void;

  constructor(
    components: ComponentItem[],
    groupName: string,
    groupDescription?: string,
  ) {
    this.groupData = {
      name: groupName,
      description: groupDescription,
      components,
      internalConnections: [],
      externalInterfaces: [],
    };
  }

  public show(
    onSave: (data: ComponentGroupData) => void,
    onCancel?: () => void,
  ): void {
    this.onSave = onSave;
    this.onCancel = onCancel;
    this.createModal();
    document.body.appendChild(this.modal!);

    // Focus the modal for keyboard navigation
    this.modal!.focus();
  }

  public hide(): void {
    if (this.modal && this.modal.parentNode) {
      this.modal.parentNode.removeChild(this.modal);
    }
  }

  private createModal(): void {
    this.modal = document.createElement("div");
    this.modal.className = "interface-connection-editor-modal";
    this.modal.tabIndex = -1;
    this.modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.7);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10000;
            backdrop-filter: blur(4px);
        `;

    const dialog = document.createElement("div");
    dialog.style.cssText = `
            background: var(--bg-primary, #0F1419);
            border: 1px solid var(--border-color, #2A3441);
            border-radius: 12px;
            box-shadow: 0 20px 40px rgba(0, 0, 0, 0.5);
            width: 90%;
            max-width: 1200px;
            height: 80%;
            max-height: 800px;
            display: flex;
            flex-direction: column;
            overflow: hidden;
        `;

    // Header
    const header = this.createHeader();
    dialog.appendChild(header);

    // Content
    const content = this.createContent();
    dialog.appendChild(content);

    // Footer
    const footer = this.createFooter();
    dialog.appendChild(footer);

    this.modal.appendChild(dialog);

    // Close on backdrop click
    this.modal.addEventListener("click", (e) => {
      if (e.target === this.modal) {
        this.handleCancel();
      }
    });

    // Handle keyboard shortcuts
    this.modal.addEventListener("keydown", (e) => {
      this.handleKeyboardShortcuts(e);
    });
  }

  private createHeader(): HTMLElement {
    const header = document.createElement("div");
    header.style.cssText = `
            padding: 20px 24px;
            border-bottom: 1px solid var(--border-color, #2A3441);
            display: flex;
            align-items: center;
            justify-content: space-between;
        `;

    const titleSection = document.createElement("div");
    titleSection.style.cssText = `
            display: flex;
            flex-direction: column;
            gap: 4px;
        `;

    const title = document.createElement("h2");
    title.textContent = "Interface Connection Editor";
    title.style.cssText = `
            margin: 0;
            font-size: 20px;
            font-weight: 600;
            color: var(--text-primary, #E6EDF3);
        `;

    const subtitle = document.createElement("div");
    subtitle.textContent = `Configure connections for "${this.groupData.name}" (${this.groupData.components.length} components)`;
    subtitle.style.cssText = `
            font-size: 14px;
            color: var(--text-secondary, #7D8590);
        `;

    titleSection.appendChild(title);
    titleSection.appendChild(subtitle);

    const closeButton = document.createElement("button");
    closeButton.textContent = "✕";
    closeButton.style.cssText = `
            background: transparent;
            border: none;
            color: var(--text-secondary, #7D8590);
            font-size: 24px;
            cursor: pointer;
            padding: 8px;
            border-radius: 4px;
            transition: all 0.2s ease;
        `;

    closeButton.addEventListener("click", () => {
      this.handleCancel();
    });

    closeButton.addEventListener("mouseenter", () => {
      closeButton.style.background = "var(--bg-secondary, #151B2C)";
      closeButton.style.color = "var(--text-primary, #E6EDF3)";
    });

    closeButton.addEventListener("mouseleave", () => {
      closeButton.style.background = "transparent";
      closeButton.style.color = "var(--text-secondary, #7D8590)";
    });

    header.appendChild(titleSection);
    header.appendChild(closeButton);

    return header;
  }

  private createContent(): HTMLElement {
    const content = document.createElement("div");
    content.style.cssText = `
            flex: 1;
            display: flex;
            overflow: hidden;
        `;

    // Left panel - Component interfaces
    const leftPanel = this.createInterfacesPanel();
    content.appendChild(leftPanel);

    // Center panel - Connection builder
    const centerPanel = this.createConnectionPanel();
    content.appendChild(centerPanel);

    // Right panel - External interfaces
    const rightPanel = this.createExternalInterfacesPanel();
    content.appendChild(rightPanel);

    return content;
  }

  private createInterfacesPanel(): HTMLElement {
    const panel = document.createElement("div");
    panel.style.cssText = `
            width: 350px;
            border-right: 1px solid var(--border-color, #2A3441);
            display: flex;
            flex-direction: column;
            overflow: hidden;
        `;

    const header = document.createElement("div");
    header.style.cssText = `
            padding: 16px;
            border-bottom: 1px solid var(--border-color, #2A3441);
            background: var(--bg-secondary, #151B2C);
        `;

    const title = document.createElement("h3");
    title.textContent = "Component Interfaces";
    title.style.cssText = `
            margin: 0;
            font-size: 16px;
            font-weight: 600;
            color: var(--text-primary, #E6EDF3);
        `;

    header.appendChild(title);
    panel.appendChild(header);

    const interfacesList = document.createElement("div");
    interfacesList.style.cssText = `
            flex: 1;
            overflow-y: auto;
            padding: 16px;
        `;

    // Add interfaces for each component
    this.groupData.components.forEach((component) => {
      const componentSection = this.createComponentInterfaceSection(component);
      interfacesList.appendChild(componentSection);
    });

    panel.appendChild(interfacesList);

    return panel;
  }

  private createComponentInterfaceSection(
    component: ComponentItem,
  ): HTMLElement {
    const section = document.createElement("div");
    section.style.cssText = `
            margin-bottom: 24px;
            padding: 16px;
            background: var(--bg-secondary, #151B2C);
            border: 1px solid var(--border-color, #2A3441);
            border-radius: 8px;
        `;

    const componentHeader = document.createElement("div");
    componentHeader.style.cssText = `
            display: flex;
            align-items: center;
            gap: 8px;
            margin-bottom: 12px;
        `;

    const componentIcon = document.createElement("div");
    componentIcon.textContent = "📦";
    componentIcon.style.cssText = `
            font-size: 16px;
        `;

    const componentName = document.createElement("div");
    componentName.textContent = component.name;
    componentName.style.cssText = `
            font-weight: 600;
            color: var(--text-primary, #E6EDF3);
            font-size: 14px;
        `;

    componentHeader.appendChild(componentIcon);
    componentHeader.appendChild(componentName);
    section.appendChild(componentHeader);

    // Extract interfaces from component (this would come from the backend)
    const interfaces = this.extractComponentInterfaces(component);

    if (interfaces.length === 0) {
      const noInterfaces = document.createElement("div");
      noInterfaces.textContent = "No interfaces available";
      noInterfaces.style.cssText = `
                color: var(--text-secondary, #7D8590);
                font-style: italic;
                font-size: 12px;
            `;
      section.appendChild(noInterfaces);
    } else {
      interfaces.forEach((iface) => {
        const interfaceItem = this.createInterfaceItem(component, iface);
        section.appendChild(interfaceItem);
      });
    }

    return section;
  }

  private extractComponentInterfaces(
    _component: ComponentItem,
  ): WasmInterface[] {
    // In a real implementation, this would extract interfaces from the component
    // For now, we'll create some mock interfaces for demonstration
    const mockInterfaces: WasmInterface[] = [
      {
        name: "sensor-input",
        interfaceType: "import",
        functions: [
          {
            name: "read-sensor-data",
            params: [{ name: "sensor-id", paramType: "string" }],
            returns: [{ name: "data", paramType: "bytes" }],
          },
        ],
      },
      {
        name: "data-processor",
        interfaceType: "export",
        functions: [
          {
            name: "process-data",
            params: [{ name: "input", paramType: "bytes" }],
            returns: [{ name: "output", paramType: "bytes" }],
          },
        ],
      },
    ];

    return mockInterfaces;
  }

  private createInterfaceItem(
    component: ComponentItem,
    iface: WasmInterface,
  ): HTMLElement {
    const item = document.createElement("div");
    item.style.cssText = `
            padding: 8px 12px;
            margin: 4px 0;
            background: var(--bg-primary, #0F1419);
            border: 1px solid var(--border-color, #2A3441);
            border-radius: 6px;
            cursor: pointer;
            transition: all 0.2s ease;
            display: flex;
            align-items: center;
            gap: 8px;
        `;

    const typeIcon = document.createElement("div");
    typeIcon.textContent = iface.interfaceType === "import" ? "⬇️" : "⬆️";
    typeIcon.style.cssText = `
            font-size: 14px;
        `;

    const nameDiv = document.createElement("div");
    nameDiv.textContent = iface.name;
    nameDiv.style.cssText = `
            flex: 1;
            font-size: 12px;
            color: var(--text-primary, #E6EDF3);
        `;

    const typeLabel = document.createElement("div");
    typeLabel.textContent = iface.interfaceType;
    typeLabel.style.cssText = `
            font-size: 10px;
            padding: 2px 6px;
            border-radius: 4px;
            background: ${iface.interfaceType === "import" ? "var(--accent-info, #58A6FF)" : "var(--accent-success, #3FB950)"};
            color: white;
            text-transform: uppercase;
            font-weight: 600;
        `;

    item.appendChild(typeIcon);
    item.appendChild(nameDiv);
    item.appendChild(typeLabel);

    // Make item draggable for connection creation
    item.draggable = true;
    item.dataset.componentId = component.id;
    item.dataset.interfaceName = iface.name;
    item.dataset.interfaceType = iface.interfaceType;

    item.addEventListener("dragstart", (e) => {
      if (e.dataTransfer) {
        e.dataTransfer.setData(
          "application/json",
          JSON.stringify({
            componentId: component.id,
            componentName: component.name,
            interfaceName: iface.name,
            interfaceType: iface.interfaceType,
            functions: iface.functions,
          }),
        );
      }
      item.style.opacity = "0.5";
    });

    item.addEventListener("dragend", () => {
      item.style.opacity = "1";
    });

    item.addEventListener("mouseenter", () => {
      item.style.background = "var(--bg-secondary, #151B2C)";
      item.style.borderColor = "var(--accent-wasm, #654FF0)";
    });

    item.addEventListener("mouseleave", () => {
      item.style.background = "var(--bg-primary, #0F1419)";
      item.style.borderColor = "var(--border-color, #2A3441)";
    });

    return item;
  }

  private createConnectionPanel(): HTMLElement {
    const panel = document.createElement("div");
    panel.style.cssText = `
            flex: 1;
            display: flex;
            flex-direction: column;
            overflow: hidden;
        `;

    const header = document.createElement("div");
    header.style.cssText = `
            padding: 16px;
            border-bottom: 1px solid var(--border-color, #2A3441);
            background: var(--bg-secondary, #151B2C);
            display: flex;
            justify-content: space-between;
            align-items: center;
        `;

    const title = document.createElement("h3");
    title.textContent = "Internal Connections";
    title.style.cssText = `
            margin: 0;
            font-size: 16px;
            font-weight: 600;
            color: var(--text-primary, #E6EDF3);
        `;

    const helpText = document.createElement("div");
    helpText.textContent =
      "Drag interfaces here to create internal connections";
    helpText.style.cssText = `
            font-size: 12px;
            color: var(--text-secondary, #7D8590);
        `;

    header.appendChild(title);
    header.appendChild(helpText);
    panel.appendChild(header);

    const connectionsArea = this.createConnectionsArea();
    panel.appendChild(connectionsArea);

    return panel;
  }

  private createConnectionsArea(): HTMLElement {
    const area = document.createElement("div");
    area.style.cssText = `
            flex: 1;
            padding: 20px;
            overflow-y: auto;
            position: relative;
        `;

    const dropZone = document.createElement("div");
    dropZone.style.cssText = `
            min-height: 200px;
            border: 2px dashed var(--border-color, #2A3441);
            border-radius: 8px;
            padding: 20px;
            text-align: center;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 12px;
            transition: all 0.2s ease;
        `;

    const dropIcon = document.createElement("div");
    dropIcon.textContent = "🔗";
    dropIcon.style.cssText = `
            font-size: 32px;
            opacity: 0.5;
        `;

    const dropText = document.createElement("div");
    dropText.textContent = "Drop interfaces here to create connections";
    dropText.style.cssText = `
            color: var(--text-secondary, #7D8590);
            font-size: 14px;
        `;

    const instructionText = document.createElement("div");
    instructionText.textContent =
      "Drag an export interface and drop it on an import interface to connect them";
    instructionText.style.cssText = `
            color: var(--text-secondary, #7D8590);
            font-size: 12px;
            max-width: 300px;
            text-align: center;
            line-height: 1.4;
        `;

    dropZone.appendChild(dropIcon);
    dropZone.appendChild(dropText);
    dropZone.appendChild(instructionText);

    // Handle drag and drop for connection creation
    dropZone.addEventListener("dragover", (e) => {
      e.preventDefault();
      dropZone.style.borderColor = "var(--accent-wasm, #654FF0)";
      dropZone.style.background = "rgba(101, 79, 240, 0.1)";
    });

    dropZone.addEventListener("dragleave", () => {
      dropZone.style.borderColor = "var(--border-color, #2A3441)";
      dropZone.style.background = "transparent";
    });

    dropZone.addEventListener("drop", (e) => {
      e.preventDefault();
      dropZone.style.borderColor = "var(--border-color, #2A3441)";
      dropZone.style.background = "transparent";

      const data = e.dataTransfer?.getData("application/json");
      if (data) {
        const interfaceData = JSON.parse(data);
        this.handleInterfaceDrop(interfaceData, dropZone);
      }
    });

    const connectionsContainer = document.createElement("div");
    connectionsContainer.className = "connections-container";
    connectionsContainer.style.cssText = `
            margin-top: 20px;
        `;

    area.appendChild(dropZone);
    area.appendChild(connectionsContainer);

    return area;
  }

  private handleInterfaceDrop(
    interfaceData: unknown,
    dropZone: HTMLElement,
  ): void {
    // For now, we'll create a simple connection item
    // In a real implementation, this would involve more complex logic
    const connectionItem = this.createConnectionItem(interfaceData);

    const connectionsContainer = dropZone.parentElement?.querySelector(
      ".connections-container",
    );
    if (connectionsContainer) {
      connectionsContainer.appendChild(connectionItem);
    }

    // Hide the drop zone if we have connections
    const hasConnections = (connectionsContainer?.children.length || 0) > 0;
    dropZone.style.display = hasConnections ? "none" : "flex";
  }

  private createConnectionItem(interfaceData: unknown): HTMLElement {
    const item = document.createElement("div");
    item.style.cssText = `
            padding: 12px;
            margin: 8px 0;
            background: var(--bg-secondary, #151B2C);
            border: 1px solid var(--border-color, #2A3441);
            border-radius: 6px;
            display: flex;
            align-items: center;
            gap: 12px;
        `;

    const sourceInfo = document.createElement("div");
    sourceInfo.style.cssText = `
            display: flex;
            flex-direction: column;
            gap: 4px;
        `;

    const sourceName = document.createElement("div");
    const data = interfaceData as {
      componentName: string;
      interfaceName: string;
      interfaceType: string;
    };
    sourceName.textContent = `${data.componentName}.${data.interfaceName}`;
    sourceName.style.cssText = `
            font-size: 12px;
            font-weight: 600;
            color: var(--text-primary, #E6EDF3);
        `;

    const sourceType = document.createElement("div");
    sourceType.textContent = data.interfaceType;
    sourceType.style.cssText = `
            font-size: 10px;
            color: var(--text-secondary, #7D8590);
        `;

    sourceInfo.appendChild(sourceName);
    sourceInfo.appendChild(sourceType);

    const arrow = document.createElement("div");
    arrow.textContent = "→";
    arrow.style.cssText = `
            color: var(--accent-wasm, #654FF0);
            font-size: 16px;
        `;

    const removeButton = document.createElement("button");
    removeButton.textContent = "✕";
    removeButton.style.cssText = `
            background: transparent;
            border: none;
            color: var(--text-secondary, #7D8590);
            cursor: pointer;
            padding: 4px;
            border-radius: 4px;
            transition: all 0.2s ease;
        `;

    removeButton.addEventListener("click", () => {
      item.remove();
      // Show drop zone if no connections left
      const connectionsContainer = item.parentElement;
      const dropZone = connectionsContainer?.parentElement?.querySelector(
        'div[style*="dashed"]',
      ) as HTMLElement;
      if (dropZone && connectionsContainer?.children.length === 0) {
        dropZone.style.display = "flex";
      }
    });

    item.appendChild(sourceInfo);
    item.appendChild(arrow);
    item.appendChild(removeButton);

    return item;
  }

  private createExternalInterfacesPanel(): HTMLElement {
    const panel = document.createElement("div");
    panel.style.cssText = `
            width: 350px;
            border-left: 1px solid var(--border-color, #2A3441);
            display: flex;
            flex-direction: column;
            overflow: hidden;
        `;

    const header = document.createElement("div");
    header.style.cssText = `
            padding: 16px;
            border-bottom: 1px solid var(--border-color, #2A3441);
            background: var(--bg-secondary, #151B2C);
        `;

    const title = document.createElement("h3");
    title.textContent = "External Interfaces";
    title.style.cssText = `
            margin: 0;
            font-size: 16px;
            font-weight: 600;
            color: var(--text-primary, #E6EDF3);
        `;

    const subtitle = document.createElement("div");
    subtitle.textContent = "Interfaces exposed by the group";
    subtitle.style.cssText = `
            font-size: 12px;
            color: var(--text-secondary, #7D8590);
            margin-top: 4px;
        `;

    header.appendChild(title);
    header.appendChild(subtitle);
    panel.appendChild(header);

    const externalList = document.createElement("div");
    externalList.style.cssText = `
            flex: 1;
            overflow-y: auto;
            padding: 16px;
        `;

    // Initially empty - will be populated as user creates connections
    const emptyState = document.createElement("div");
    emptyState.style.cssText = `
            text-align: center;
            padding: 40px 20px;
            color: var(--text-secondary, #7D8590);
            font-style: italic;
        `;
    emptyState.textContent =
      "External interfaces will appear here based on your connections";

    externalList.appendChild(emptyState);
    panel.appendChild(externalList);

    return panel;
  }

  private createFooter(): HTMLElement {
    const footer = document.createElement("div");
    footer.style.cssText = `
            padding: 16px 24px;
            border-top: 1px solid var(--border-color, #2A3441);
            background: var(--bg-secondary, #151B2C);
            display: flex;
            justify-content: space-between;
            align-items: center;
        `;

    const leftSection = document.createElement("div");
    leftSection.style.cssText = `
            display: flex;
            align-items: center;
            gap: 16px;
        `;

    const connectionCount = document.createElement("div");
    connectionCount.textContent = `${this.groupData.internalConnections.length} internal connections`;
    connectionCount.style.cssText = `
            font-size: 12px;
            color: var(--text-secondary, #7D8590);
        `;

    const externalCount = document.createElement("div");
    externalCount.textContent = `${this.groupData.externalInterfaces.length} external interfaces`;
    externalCount.style.cssText = `
            font-size: 12px;
            color: var(--text-secondary, #7D8590);
        `;

    leftSection.appendChild(connectionCount);
    leftSection.appendChild(externalCount);

    const rightSection = document.createElement("div");
    rightSection.style.cssText = `
            display: flex;
            gap: 12px;
        `;

    const cancelButton = document.createElement("button");
    cancelButton.textContent = "Cancel";
    cancelButton.style.cssText = `
            padding: 8px 16px;
            background: transparent;
            border: 1px solid var(--border-color, #2A3441);
            border-radius: 6px;
            color: var(--text-primary, #E6EDF3);
            cursor: pointer;
            font-size: 14px;
            transition: all 0.2s ease;
        `;

    cancelButton.addEventListener("click", () => {
      this.handleCancel();
    });

    const saveButton = document.createElement("button");
    saveButton.textContent = "Create Group";
    saveButton.style.cssText = `
            padding: 8px 16px;
            background: var(--accent-wasm, #654FF0);
            border: 1px solid var(--accent-wasm, #654FF0);
            border-radius: 6px;
            color: white;
            cursor: pointer;
            font-size: 14px;
            font-weight: 600;
            transition: all 0.2s ease;
        `;

    saveButton.addEventListener("click", () => {
      this.handleSave();
    });

    rightSection.appendChild(cancelButton);
    rightSection.appendChild(saveButton);

    footer.appendChild(leftSection);
    footer.appendChild(rightSection);

    return footer;
  }

  private handleKeyboardShortcuts(e: KeyboardEvent): void {
    switch (e.key) {
      case "Escape":
        this.handleCancel();
        break;
      case "Enter":
        if (e.ctrlKey || e.metaKey) {
          this.handleSave();
        }
        break;
    }
  }

  private handleSave(): void {
    // Collect current connection data from UI
    // In a real implementation, this would extract the connections from the UI
    console.log("Saving component group with connections:", this.groupData);

    if (this.onSave) {
      this.onSave(this.groupData);
    }
    this.hide();
  }

  private handleCancel(): void {
    if (this.onCancel) {
      this.onCancel();
    }
    this.hide();
  }
}
