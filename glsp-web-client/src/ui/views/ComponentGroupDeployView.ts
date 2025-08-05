import {
  ComponentGroupData,
  InterfaceConnection,
  ExternalInterface,
} from "../modals/InterfaceConnectionEditor.js";

export interface DeployConfiguration {
  groupId: string;
  groupName: string;
  profile: "debug" | "release" | "test";
  targetName: string;
  packageName: string;
  generateWacFile: boolean;
  generateBuildFile: boolean;
  optimizations: {
    enableOptimizations: boolean;
    stripDebugInfo: boolean;
    useSymlinks: boolean;
  };
  validation: {
    validateComponents: boolean;
    validateConnections: boolean;
    lintWit: boolean;
  };
}

export class ComponentGroupDeployView {
  private modal?: HTMLElement;
  private groupData: ComponentGroupData;
  private config: DeployConfiguration;
  private onDeploy?: (
    config: DeployConfiguration,
    files: { buildFile: string; wacFile?: string },
  ) => void;
  private onCancel?: () => void;

  constructor(groupData: ComponentGroupData) {
    this.groupData = groupData;
    this.config = {
      groupId: groupData.name.toLowerCase().replace(/\s+/g, "-"),
      groupName: groupData.name,
      profile: "release",
      targetName: `${groupData.name.toLowerCase().replace(/\s+/g, "_")}_composition`,
      packageName: `${groupData.name.toLowerCase().replace(/\s+/g, "-")}:composition`,
      generateWacFile: true,
      generateBuildFile: true,
      optimizations: {
        enableOptimizations: true,
        stripDebugInfo: true,
        useSymlinks: false,
      },
      validation: {
        validateComponents: true,
        validateConnections: true,
        lintWit: true,
      },
    };
  }

  public show(
    onDeploy: (
      config: DeployConfiguration,
      files: { buildFile: string; wacFile?: string },
    ) => void,
    onCancel?: () => void,
  ): void {
    this.onDeploy = onDeploy;
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
    this.modal.className = "deploy-view-modal";
    this.modal.tabIndex = -1;
    this.modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.8);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10000;
            backdrop-filter: blur(6px);
        `;

    const dialog = document.createElement("div");
    dialog.style.cssText = `
            background: var(--bg-primary, #0F1419);
            border: 1px solid var(--border-color, #2A3441);
            border-radius: 12px;
            box-shadow: 0 24px 48px rgba(0, 0, 0, 0.6);
            width: 90%;
            max-width: 1000px;
            height: 85%;
            max-height: 700px;
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
            padding: 24px 28px;
            border-bottom: 1px solid var(--border-color, #2A3441);
            display: flex;
            align-items: center;
            justify-content: space-between;
            background: var(--bg-secondary, #151B2C);
        `;

    const titleSection = document.createElement("div");
    titleSection.style.cssText = `
            display: flex;
            flex-direction: column;
            gap: 6px;
        `;

    const title = document.createElement("h2");
    title.innerHTML = `🚀 Deploy Component Group`;
    title.style.cssText = `
            margin: 0;
            font-size: 22px;
            font-weight: 600;
            color: var(--text-primary, #E6EDF3);
            display: flex;
            align-items: center;
            gap: 12px;
        `;

    const subtitle = document.createElement("div");
    subtitle.textContent = `Generate Bazel configuration for "${this.groupData.name}"`;
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
      closeButton.style.background = "var(--bg-primary, #0F1419)";
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

    // Left panel - Configuration
    const leftPanel = this.createConfigurationPanel();
    content.appendChild(leftPanel);

    // Right panel - Preview
    const rightPanel = this.createPreviewPanel();
    content.appendChild(rightPanel);

    return content;
  }

  private createConfigurationPanel(): HTMLElement {
    const panel = document.createElement("div");
    panel.style.cssText = `
            width: 400px;
            border-right: 1px solid var(--border-color, #2A3441);
            display: flex;
            flex-direction: column;
            overflow: hidden;
        `;

    const panelHeader = document.createElement("div");
    panelHeader.style.cssText = `
            padding: 20px;
            border-bottom: 1px solid var(--border-color, #2A3441);
            background: var(--bg-secondary, #151B2C);
        `;

    const panelTitle = document.createElement("h3");
    panelTitle.textContent = "Deployment Configuration";
    panelTitle.style.cssText = `
            margin: 0;
            font-size: 16px;
            font-weight: 600;
            color: var(--text-primary, #E6EDF3);
        `;

    panelHeader.appendChild(panelTitle);
    panel.appendChild(panelHeader);

    const configForm = this.createConfigurationForm();
    panel.appendChild(configForm);

    return panel;
  }

  private createConfigurationForm(): HTMLElement {
    const form = document.createElement("div");
    form.style.cssText = `
            flex: 1;
            overflow-y: auto;
            padding: 20px;
        `;

    // Basic Configuration
    const basicSection = this.createFormSection("Basic Configuration", [
      this.createTextInput(
        "Target Name",
        "targetName",
        this.config.targetName,
        "Bazel target name for the composition",
      ),
      this.createTextInput(
        "Package Name",
        "packageName",
        this.config.packageName,
        "WAC package identifier",
      ),
      this.createSelectInput(
        "Profile",
        "profile",
        this.config.profile,
        [
          {
            value: "debug",
            label: "Debug - Development builds with debug info",
          },
          { value: "release", label: "Release - Optimized production builds" },
          { value: "test", label: "Test - Testing configuration" },
        ],
        "Build profile for all components",
      ),
    ]);

    // File Generation
    const filesSection = this.createFormSection("File Generation", [
      this.createCheckboxInput(
        "Generate BUILD.bazel",
        "generateBuildFile",
        this.config.generateBuildFile,
        "Generate Bazel BUILD file with wac_compose rule",
      ),
      this.createCheckboxInput(
        "Generate WAC file",
        "generateWacFile",
        this.config.generateWacFile,
        "Generate WebAssembly Composition configuration file",
      ),
    ]);

    // Optimizations
    const optimizationsSection = this.createFormSection("Optimizations", [
      this.createCheckboxInput(
        "Enable Optimizations",
        "optimizations.enableOptimizations",
        this.config.optimizations.enableOptimizations,
        "Enable component-level optimizations",
      ),
      this.createCheckboxInput(
        "Strip Debug Info",
        "optimizations.stripDebugInfo",
        this.config.optimizations.stripDebugInfo,
        "Remove debug information from components",
      ),
      this.createCheckboxInput(
        "Use Symlinks",
        "optimizations.useSymlinks",
        this.config.optimizations.useSymlinks,
        "Use symlinks for file dependencies",
      ),
    ]);

    // Validation
    const validationSection = this.createFormSection("Validation", [
      this.createCheckboxInput(
        "Validate Components",
        "validation.validateComponents",
        this.config.validation.validateComponents,
        "Run component validation during build",
      ),
      this.createCheckboxInput(
        "Validate Connections",
        "validation.validateConnections",
        this.config.validation.validateConnections,
        "Validate interface connections",
      ),
      this.createCheckboxInput(
        "Lint WIT Interfaces",
        "validation.lintWit",
        this.config.validation.lintWit,
        "Run WIT interface linting",
      ),
    ]);

    form.appendChild(basicSection);
    form.appendChild(filesSection);
    form.appendChild(optimizationsSection);
    form.appendChild(validationSection);

    return form;
  }

  private createFormSection(title: string, inputs: HTMLElement[]): HTMLElement {
    const section = document.createElement("div");
    section.style.cssText = `
            margin-bottom: 24px;
        `;

    const sectionTitle = document.createElement("div");
    sectionTitle.textContent = title;
    sectionTitle.style.cssText = `
            font-size: 14px;
            font-weight: 600;
            color: var(--text-primary, #E6EDF3);
            margin-bottom: 12px;
            padding-bottom: 6px;
            border-bottom: 1px solid var(--border-color, #2A3441);
        `;

    section.appendChild(sectionTitle);

    inputs.forEach((input) => {
      section.appendChild(input);
    });

    return section;
  }

  private createTextInput(
    label: string,
    key: string,
    value: string,
    description?: string,
  ): HTMLElement {
    const container = document.createElement("div");
    container.style.cssText = `
            margin-bottom: 16px;
        `;

    const labelEl = document.createElement("label");
    labelEl.textContent = label;
    labelEl.style.cssText = `
            display: block;
            font-size: 12px;
            font-weight: 600;
            color: var(--text-primary, #E6EDF3);
            margin-bottom: 6px;
        `;

    const input = document.createElement("input");
    input.type = "text";
    input.value = value;
    input.style.cssText = `
            width: 100%;
            padding: 8px 12px;
            background: var(--bg-primary, #0F1419);
            border: 1px solid var(--border-color, #2A3441);
            border-radius: 4px;
            color: var(--text-primary, #E6EDF3);
            font-size: 13px;
            box-sizing: border-box;
        `;

    input.addEventListener("input", () => {
      this.updateConfigValue(key, input.value);
    });

    input.addEventListener("focus", () => {
      input.style.borderColor = "var(--accent-wasm, #654FF0)";
    });

    input.addEventListener("blur", () => {
      input.style.borderColor = "var(--border-color, #2A3441)";
    });

    container.appendChild(labelEl);
    container.appendChild(input);

    if (description) {
      const desc = document.createElement("div");
      desc.textContent = description;
      desc.style.cssText = `
                font-size: 11px;
                color: var(--text-secondary, #7D8590);
                margin-top: 4px;
                line-height: 1.3;
            `;
      container.appendChild(desc);
    }

    return container;
  }

  private createSelectInput(
    label: string,
    key: string,
    value: string,
    options: { value: string; label: string }[],
    description?: string,
  ): HTMLElement {
    const container = document.createElement("div");
    container.style.cssText = `
            margin-bottom: 16px;
        `;

    const labelEl = document.createElement("label");
    labelEl.textContent = label;
    labelEl.style.cssText = `
            display: block;
            font-size: 12px;
            font-weight: 600;
            color: var(--text-primary, #E6EDF3);
            margin-bottom: 6px;
        `;

    const select = document.createElement("select");
    select.style.cssText = `
            width: 100%;
            padding: 8px 12px;
            background: var(--bg-primary, #0F1419);
            border: 1px solid var(--border-color, #2A3441);
            border-radius: 4px;
            color: var(--text-primary, #E6EDF3);
            font-size: 13px;
            box-sizing: border-box;
            cursor: pointer;
        `;

    options.forEach((option) => {
      const optionEl = document.createElement("option");
      optionEl.value = option.value;
      optionEl.textContent = option.label;
      optionEl.selected = option.value === value;
      select.appendChild(optionEl);
    });

    select.addEventListener("change", () => {
      this.updateConfigValue(key, select.value);
    });

    container.appendChild(labelEl);
    container.appendChild(select);

    if (description) {
      const desc = document.createElement("div");
      desc.textContent = description;
      desc.style.cssText = `
                font-size: 11px;
                color: var(--text-secondary, #7D8590);
                margin-top: 4px;
                line-height: 1.3;
            `;
      container.appendChild(desc);
    }

    return container;
  }

  private createCheckboxInput(
    label: string,
    key: string,
    value: boolean,
    description?: string,
  ): HTMLElement {
    const container = document.createElement("div");
    container.style.cssText = `
            margin-bottom: 16px;
        `;

    const checkboxContainer = document.createElement("div");
    checkboxContainer.style.cssText = `
            display: flex;
            align-items: center;
            gap: 8px;
            cursor: pointer;
        `;

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = value;
    checkbox.style.cssText = `
            width: 16px;
            height: 16px;
            cursor: pointer;
        `;

    const labelEl = document.createElement("label");
    labelEl.textContent = label;
    labelEl.style.cssText = `
            font-size: 12px;
            font-weight: 600;
            color: var(--text-primary, #E6EDF3);
            cursor: pointer;
            flex: 1;
        `;

    checkbox.addEventListener("change", () => {
      this.updateConfigValue(key, checkbox.checked);
    });

    checkboxContainer.appendChild(checkbox);
    checkboxContainer.appendChild(labelEl);
    container.appendChild(checkboxContainer);

    if (description) {
      const desc = document.createElement("div");
      desc.textContent = description;
      desc.style.cssText = `
                font-size: 11px;
                color: var(--text-secondary, #7D8590);
                margin-top: 4px;
                margin-left: 24px;
                line-height: 1.3;
            `;
      container.appendChild(desc);
    }

    return container;
  }

  private updateConfigValue(key: string, value: unknown): void {
    const keys = key.split(".");
    let target: Record<string, unknown> = this.config as unknown as Record<
      string,
      unknown
    >;

    for (let i = 0; i < keys.length - 1; i++) {
      target = target[keys[i]] as Record<string, unknown>;
    }

    target[keys[keys.length - 1]] = value;

    // Refresh preview
    this.refreshPreview();
  }

  private createPreviewPanel(): HTMLElement {
    const panel = document.createElement("div");
    panel.style.cssText = `
            flex: 1;
            display: flex;
            flex-direction: column;
            overflow: hidden;
        `;

    const panelHeader = document.createElement("div");
    panelHeader.style.cssText = `
            padding: 20px;
            border-bottom: 1px solid var(--border-color, #2A3441);
            background: var(--bg-secondary, #151B2C);
            display: flex;
            justify-content: space-between;
            align-items: center;
        `;

    const panelTitle = document.createElement("h3");
    panelTitle.textContent = "Generated Configuration";
    panelTitle.style.cssText = `
            margin: 0;
            font-size: 16px;
            font-weight: 600;
            color: var(--text-primary, #E6EDF3);
        `;

    const refreshButton = document.createElement("button");
    refreshButton.textContent = "🔄 Refresh";
    refreshButton.style.cssText = `
            padding: 6px 12px;
            background: var(--accent-wasm, #654FF0);
            border: none;
            border-radius: 4px;
            color: white;
            font-size: 12px;
            cursor: pointer;
            transition: all 0.2s ease;
        `;

    refreshButton.addEventListener("click", () => {
      this.refreshPreview();
    });

    panelHeader.appendChild(panelTitle);
    panelHeader.appendChild(refreshButton);
    panel.appendChild(panelHeader);

    const previewContent = document.createElement("div");
    previewContent.className = "preview-content";
    previewContent.style.cssText = `
            flex: 1;
            overflow: hidden;
            display: flex;
            flex-direction: column;
        `;

    panel.appendChild(previewContent);

    // Initial preview
    this.refreshPreview();

    return panel;
  }

  private refreshPreview(): void {
    const previewContent = this.modal?.querySelector(".preview-content");
    if (!previewContent) return;

    previewContent.innerHTML = "";

    // Create tabs for different files
    const tabs = this.createPreviewTabs();
    previewContent.appendChild(tabs);

    const content = document.createElement("div");
    content.className = "preview-file-content";
    content.style.cssText = `
            flex: 1;
            overflow: hidden;
        `;

    previewContent.appendChild(content);

    // Show BUILD file by default
    this.showPreviewTab("build");
  }

  private createPreviewTabs(): HTMLElement {
    const tabs = document.createElement("div");
    tabs.style.cssText = `
            display: flex;
            background: var(--bg-primary, #0F1419);
            border-bottom: 1px solid var(--border-color, #2A3441);
        `;

    const buildTab = this.createPreviewTab("build", "BUILD.bazel", true);
    const wacTab = this.createPreviewTab("wac", "production.wac", false);

    tabs.appendChild(buildTab);
    tabs.appendChild(wacTab);

    return tabs;
  }

  private createPreviewTab(
    id: string,
    label: string,
    active: boolean,
  ): HTMLElement {
    const tab = document.createElement("button");
    tab.textContent = label;
    tab.dataset.tabId = id;
    tab.style.cssText = `
            padding: 12px 20px;
            background: ${active ? "var(--bg-secondary, #151B2C)" : "transparent"};
            border: none;
            border-bottom: 2px solid ${active ? "var(--accent-wasm, #654FF0)" : "transparent"};
            color: ${active ? "var(--text-primary, #E6EDF3)" : "var(--text-secondary, #7D8590)"};
            cursor: pointer;
            font-size: 13px;
            font-weight: 600;
            transition: all 0.2s ease;
        `;

    tab.addEventListener("click", () => {
      this.showPreviewTab(id);
    });

    if (!active) {
      tab.addEventListener("mouseenter", () => {
        tab.style.background = "var(--bg-secondary, #151B2C)";
        tab.style.color = "var(--text-primary, #E6EDF3)";
      });

      tab.addEventListener("mouseleave", () => {
        tab.style.background = "transparent";
        tab.style.color = "var(--text-secondary, #7D8590)";
      });
    }

    return tab;
  }

  private showPreviewTab(tabId: string): void {
    // Update tab styles
    const tabs = this.modal?.querySelectorAll("[data-tab-id]");
    tabs?.forEach((tab) => {
      const isActive = (tab as HTMLElement).dataset.tabId === tabId;
      (tab as HTMLElement).style.background = isActive
        ? "var(--bg-secondary, #151B2C)"
        : "transparent";
      (tab as HTMLElement).style.borderBottomColor = isActive
        ? "var(--accent-wasm, #654FF0)"
        : "transparent";
      (tab as HTMLElement).style.color = isActive
        ? "var(--text-primary, #E6EDF3)"
        : "var(--text-secondary, #7D8590)";
    });

    // Show content
    const content = this.modal?.querySelector(".preview-file-content");
    if (!content) return;

    let fileContent = "";
    if (tabId === "build") {
      fileContent = this.generateBuildFile();
    } else if (tabId === "wac") {
      fileContent = this.generateWacFile();
    }

    content.innerHTML = `
            <pre style="
                margin: 0;
                padding: 20px;
                background: var(--bg-primary, #0F1419);
                color: var(--text-primary, #E6EDF3);
                font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
                font-size: 12px;
                line-height: 1.5;
                overflow: auto;
                height: 100%;
                box-sizing: border-box;
                white-space: pre-wrap;
                word-wrap: break-word;
            "><code>${this.escapeHtml(fileContent)}</code></pre>
        `;
  }

  private generateBuildFile(): string {
    return `# Generated BUILD.bazel for component group: ${this.groupData.name}
# Generated by GLSP Component Grouping System

load("@rules_wasm_component//wac:defs.bzl", "wac_compose")

wac_compose(
    name = "${this.config.targetName}",
    components = {
${this.groupData.components.map((c) => `        "${c.name.toLowerCase().replace(/[^a-z0-9]/g, "_")}": ":${c.name.toLowerCase().replace(/[^a-z0-9]/g, "_")}_${this.config.profile}",`).join("\n")}
    },
    composition_file = "production.wac",
    profile = "${this.config.profile}",
    ${this.config.optimizations.enableOptimizations ? 'tags = ["optimize"],' : ""}
    ${this.config.optimizations.useSymlinks ? "use_symlinks = True," : "use_symlinks = False,"}
    visibility = ["//visibility:public"],
)

# Component validation targets
${this.config.validation.validateComponents ? this.generateValidationTargets() : ""}

# Individual component targets (assuming they exist)
${this.groupData.components.map((c) => this.generateComponentTarget(c.name, this.config.profile)).join("\n\n")}`;
  }

  private generateValidationTargets(): string {
    return `
load("@rules_wasm_component//wasm:defs.bzl", "wasm_validate")

wasm_validate(
    name = "${this.config.targetName}_validate",
    src = ":${this.config.targetName}",
    ${this.config.validation.validateConnections ? "validate_connections = True," : ""}
    ${this.config.validation.lintWit ? "lint_wit = True," : ""}
)`;
  }

  private generateComponentTarget(
    componentName: string,
    profile: string,
  ): string {
    const targetName = componentName.toLowerCase().replace(/[^a-z0-9]/g, "_");
    return `# Component: ${componentName}
rust_wasm_component(
    name = "${targetName}_${profile}",
    srcs = ["src/${targetName}/lib.rs"],
    wit_bindgen = ":${targetName}_wit",
    profile = "${profile}",
    ${this.config.optimizations.stripDebugInfo && profile === "release" ? "strip_debug_info = True," : ""}
    visibility = ["//visibility:public"],
)`;
  }

  private generateWacFile(): string {
    return `# Generated WAC configuration for component group: ${this.groupData.name}
# Generated by GLSP Component Grouping System

package ${this.config.packageName};

${this.groupData.components.map((c) => this.generateComponentDeclaration(c.name)).join("\n")}

# Component connections
${this.groupData.internalConnections.map((conn) => this.generateConnectionDeclaration(conn)).join("\n")}

# External interface exports
${this.groupData.externalInterfaces.map((iface) => this.generateExportDeclaration(iface)).join("\n")}`;
  }

  private generateComponentDeclaration(componentName: string): string {
    const varName = componentName.toLowerCase().replace(/[^a-z0-9]/g, "_");
    return `let ${varName} = new ${componentName.toLowerCase()}:component {
    // Component configuration would go here
    // This would be populated based on component metadata
};`;
  }

  private generateConnectionDeclaration(
    connection: InterfaceConnection,
  ): string {
    const sourceVar = connection.sourceComponent
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "_");
    const targetVar = connection.targetComponent
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "_");
    return `connect ${sourceVar}.${connection.sourceInterface} -> ${targetVar}.${connection.targetInterface};`;
  }

  private generateExportDeclaration(iface: ExternalInterface): string {
    const sourceVar = iface.sourceComponent
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "_");
    return `export ${sourceVar}.${iface.sourceInterface} as ${iface.name};`;
  }

  private escapeHtml(text: string): string {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  private createFooter(): HTMLElement {
    const footer = document.createElement("div");
    footer.style.cssText = `
            padding: 20px 28px;
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

    const statusInfo = document.createElement("div");
    statusInfo.style.cssText = `
            font-size: 12px;
            color: var(--text-secondary, #7D8590);
        `;
    statusInfo.innerHTML = `
            <div>${this.groupData.components.length} components • ${this.groupData.internalConnections.length} connections</div>
            <div>Target: ${this.config.targetName} • Profile: ${this.config.profile}</div>
        `;

    leftSection.appendChild(statusInfo);

    const rightSection = document.createElement("div");
    rightSection.style.cssText = `
            display: flex;
            gap: 12px;
        `;

    const cancelButton = document.createElement("button");
    cancelButton.textContent = "Cancel";
    cancelButton.style.cssText = `
            padding: 10px 20px;
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

    const deployButton = document.createElement("button");
    deployButton.innerHTML = "🚀 Generate & Deploy";
    deployButton.style.cssText = `
            padding: 10px 20px;
            background: var(--accent-wasm, #654FF0);
            border: 1px solid var(--accent-wasm, #654FF0);
            border-radius: 6px;
            color: white;
            cursor: pointer;
            font-size: 14px;
            font-weight: 600;
            transition: all 0.2s ease;
            display: flex;
            align-items: center;
            gap: 8px;
        `;

    deployButton.addEventListener("click", () => {
      this.handleDeploy();
    });

    rightSection.appendChild(cancelButton);
    rightSection.appendChild(deployButton);

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
          this.handleDeploy();
        }
        break;
    }
  }

  private handleDeploy(): void {
    const files: { buildFile: string; wacFile?: string } = {
      buildFile: this.generateBuildFile(),
    };

    if (this.config.generateWacFile) {
      files.wacFile = this.generateWacFile();
    }

    if (this.onDeploy) {
      this.onDeploy(this.config, files);
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
