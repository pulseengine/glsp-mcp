/**
 * WIT File Viewer - Shows WIT interface definitions in a modal dialog
 */

export interface WitViewerOptions {
  componentPath?: string;
  interfaceName?: string;
  interfaceData?: any;
  componentData?: any;
}

export class WitFileViewer {
  private modal: HTMLElement | null = null;

  /**
   * Show WIT definition for an interface or component
   */
  public showWitDefinition(options: WitViewerOptions): void {
    this.createModal(options);
  }

  /**
   * Close the WIT viewer modal
   */
  public close(): void {
    if (this.modal) {
      this.modal.remove();
      this.modal = null;
    }
  }

  /**
   * Create and display the WIT viewer modal
   */
  private createModal(options: WitViewerOptions): void {
    // Close existing modal if any
    this.close();

    // Create modal backdrop
    this.modal = document.createElement("div");
    this.modal.className = "wit-viewer-modal";
    this.modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.7);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10000;
            font-family: 'JetBrains Mono', 'Fira Code', 'Consolas', monospace;
        `;

    // Create modal content
    const content = document.createElement("div");
    content.style.cssText = `
            background: #1a1a1a;
            border: 1px solid #444;
            border-radius: 8px;
            width: 80%;
            max-width: 800px;
            height: 80%;
            max-height: 600px;
            display: flex;
            flex-direction: column;
            color: #e6e6e6;
        `;

    // Create header
    const header = document.createElement("div");
    header.style.cssText = `
            padding: 16px 20px;
            border-bottom: 1px solid #444;
            display: flex;
            justify-content: space-between;
            align-items: center;
            background: #2d2d2d;
            border-radius: 8px 8px 0 0;
        `;

    const title = document.createElement("h3");
    title.style.cssText = `
            margin: 0;
            font-size: 16px;
            font-weight: 600;
            color: #e6e6e6;
        `;
    title.textContent = options.interfaceName
      ? `WIT Interface: ${options.interfaceName}`
      : "WIT Component Definition";

    const closeButton = document.createElement("button");
    closeButton.style.cssText = `
            background: transparent;
            border: none;
            color: #999;
            font-size: 18px;
            cursor: pointer;
            padding: 4px 8px;
            border-radius: 4px;
        `;
    closeButton.textContent = "×";
    closeButton.onclick = () => this.close();

    header.appendChild(title);
    header.appendChild(closeButton);

    // Create content area
    const witContent = document.createElement("div");
    witContent.style.cssText = `
            flex: 1;
            padding: 20px;
            overflow-y: auto;
            background: #1a1a1a;
            border-radius: 0 0 8px 8px;
        `;

    // Generate WIT content
    const witDefinition = this.generateWitDefinition(options);

    const pre = document.createElement("pre");
    pre.style.cssText = `
            margin: 0;
            font-family: inherit;
            font-size: 14px;
            line-height: 1.5;
            color: #e6e6e6;
            white-space: pre-wrap;
            word-wrap: break-word;
        `;
    pre.textContent = witDefinition;

    witContent.appendChild(pre);
    content.appendChild(header);
    content.appendChild(witContent);
    this.modal.appendChild(content);

    // Add event listeners
    this.modal.onclick = (e) => {
      if (e.target === this.modal) {
        this.close();
      }
    };

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        this.close();
      }
    });

    // Add to document
    document.body.appendChild(this.modal);
  }

  /**
   * Generate WIT definition text from interface/component data
   */
  private generateWitDefinition(options: WitViewerOptions): string {
    if (options.interfaceData) {
      return this.generateInterfaceWit(
        options.interfaceData,
        options.interfaceName,
      );
    } else if (options.componentData) {
      return this.generateComponentWit(options.componentData);
    } else {
      return this.generateMockWit(options);
    }
  }

  /**
   * Generate WIT definition for an interface
   */
  private generateInterfaceWit(
    interfaceData: any,
    interfaceName?: string,
  ): string {
    const name = interfaceName || interfaceData.name || "unknown-interface";
    const functions = interfaceData.functions || [];
    const types = interfaceData.types || [];

    let wit = `// WIT Interface Definition\n`;
    wit += `// Interface: ${name}\n\n`;

    // Add package and interface declaration
    wit += `package component:interfaces@1.0.0;\n\n`;
    wit += `interface ${name} {\n`;

    // Add types if any
    if (types.length > 0) {
      wit += `\n  // Types\n`;
      types.forEach((type: any) => {
        wit += `  record ${type.name} {\n`;
        if (type.fields) {
          type.fields.forEach((field: any) => {
            wit += `    ${field.name}: ${field.type},\n`;
          });
        }
        wit += `  }\n\n`;
      });
    }

    // Add functions
    if (functions.length > 0) {
      wit += `\n  // Functions\n`;
      functions.forEach((func: any) => {
        const params = (func.params || [])
          .map((p: any) => `${p.name}: ${p.param_type}`)
          .join(", ");
        const returns =
          func.returns && func.returns.length > 0
            ? ` -> ${func.returns[0].param_type}`
            : "";

        wit += `  ${func.name}: func(${params})${returns};\n`;
      });
    }

    wit += `}\n\n`;
    wit += `// Usage in component\n`;
    wit += `world component {\n`;
    wit += `  ${
      interfaceData.interface_type === "import" ? "import" : "export"
    } ${name};\n`;
    wit += `}\n`;

    return wit;
  }

  /**
   * Generate WIT definition for a component
   */
  private generateComponentWit(componentData: any): string {
    const name = componentData.name || "component";
    const interfaces = componentData.interfaces || [];

    let wit = `// WIT Component Definition\n`;
    wit += `// Component: ${name}\n`;
    wit += `// Note: This is a reconstructed WIT based on component interface data\n`;
    wit += `// For the actual WIT definition, see the component's wit/ directory\n\n`;

    // Try to use real component package name if available
    const packageName = this.getComponentPackageName(name);
    wit += `package ${packageName};\n\n`;

    // Generate interfaces with improved detail
    interfaces.forEach((iface: any) => {
      wit += `interface ${iface.name} {\n`;

      // Add types if available
      if (iface.types && iface.types.length > 0) {
        wit += `  // Types\n`;
        iface.types.forEach((type: any) => {
          wit += `  record ${type.name} {\n`;
          if (type.fields) {
            type.fields.forEach((field: any) => {
              wit += `    ${field.name}: ${field.type},\n`;
            });
          }
          wit += `  }\n\n`;
        });
      }

      // Add functions with better formatting
      if (iface.functions && iface.functions.length > 0) {
        wit += `  // Functions\n`;
        (iface.functions || []).forEach((func: any) => {
          const params = (func.params || [])
            .map((p: any) => `${p.name}: ${p.param_type}`)
            .join(", ");
          const returns =
            func.returns && func.returns.length > 0
              ? ` -> ${func.returns[0].param_type}`
              : "";

          wit += `  ${func.name}: func(${params})${returns};\n`;
        });
      } else {
        wit += `  // No function data available - interface may be empty or data not loaded\n`;
      }

      wit += `}\n\n`;
    });

    // Generate world
    wit += `world ${this.getWorldName(name)} {\n`;

    if (interfaces.length > 0) {
      interfaces.forEach((iface: any) => {
        wit += `  ${iface.interface_type === "import" ? "import" : "export"} ${
          iface.name
        };\n`;
      });
    } else {
      wit += `  // No interfaces found - this may indicate:\n`;
      wit += `  // 1. Component data not fully loaded\n`;
      wit += `  // 2. Interface definitions are in separate WIT files\n`;
      wit += `  // 3. This is a simple component with no exposed interfaces\n`;
    }

    wit += `}\n\n`;

    // Add helpful note about finding actual WIT files
    wit += `// To find the actual WIT definition for this component:\n`;
    wit += `// Check: workspace/adas-wasm-components/components/*/wit/\n`;
    wit += `// Look for: component.wit, world.wit, package.wit\n`;

    return wit;
  }

  /**
   * Get appropriate package name for component
   */
  private getComponentPackageName(componentName: string): string {
    // Map common component names to their actual package names
    const packageMap: Record<string, string> = {
      radar_front_ecu_wasm_lib_release: "adas:radar-front@0.1.0",
      "radar-front": "adas:radar-front@0.1.0",
      "camera-front": "adas:camera-front@0.1.0",
      lidar: "adas:lidar@0.1.0",
      "object-detection": "adas:object-detection@0.1.0",
    };

    return (
      packageMap[componentName] ||
      `adas:${componentName.replace(/_/g, "-")}@0.1.0`
    );
  }

  /**
   * Get appropriate world name for component
   */
  private getWorldName(componentName: string): string {
    // Simplify component names for world names
    return componentName
      .replace("_ecu_wasm_lib_release", "")
      .replace("_", "-")
      .toLowerCase();
  }

  /**
   * Generate mock WIT definition when data is limited
   */
  private generateMockWit(options: WitViewerOptions): string {
    const name = options.interfaceName || "interface";

    let wit = `// WIT Definition\n`;
    wit += `// Note: This is a reconstructed definition based on available data\n\n`;

    wit += `package component:interfaces@1.0.0;\n\n`;
    wit += `interface ${name} {\n`;
    wit += `  // Functions would be defined here\n`;
    wit += `  // Based on component analysis\n`;
    wit += `}\n\n`;

    wit += `world component {\n`;
    wit += `  import ${name};\n`;
    wit += `}\n`;

    if (options.componentPath) {
      wit += `\n// Component path: ${options.componentPath}\n`;
    }

    return wit;
  }
}

// Global instance
export const witFileViewer = new WitFileViewer();
