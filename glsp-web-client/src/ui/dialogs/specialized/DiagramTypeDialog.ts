/**
 * Diagram Type Dialog
 * Professional diagram type selection with icons and descriptions
 */

import { SelectDialog, SelectDialogConfig } from "../base/SelectDialog.js";
import { DialogEvents } from "../base/BaseDialog.js";
import { DiagramTypeConfig } from "../../../diagrams/diagram-type-registry.js";

export interface DiagramTypeDialogConfig
  extends Omit<SelectDialogConfig, "options"> {
  diagramTypes: DiagramTypeConfig[];
  showDescriptions?: boolean;
  showCategoryHeaders?: boolean;
}

export class DiagramTypeDialog extends SelectDialog {
  private typeConfig: DiagramTypeDialogConfig;

  constructor(config: DiagramTypeDialogConfig, events: DialogEvents = {}) {
    // Ensure we have diagram types
    if (!config.diagramTypes || config.diagramTypes.length === 0) {
      throw new Error("No diagram types provided to DiagramTypeDialog");
    }

    // Convert diagram types to select options
    const options = config.diagramTypes.map((type, _index) => ({
      value: type.type,
      label: type.label,
      description:
        config.showDescriptions !== false ? type.description : undefined,
      icon: type.icon,
      disabled: false,
    }));

    // Extract properties that shouldn't be overridden
    const {
      diagramTypes: _diagramTypes,
      showDescriptions: _showDescriptions,
      showCategoryHeaders: _showCategoryHeaders,
      ...otherConfig
    } = config;

    const selectConfig: SelectDialogConfig = {
      title: "Create New Diagram",
      message: "Choose the type of diagram you want to create:",
      options,
      defaultSelection: 0,
      allowMultiple: false,
      searchable: config.diagramTypes.length > 4,
      required: true,
      width: 600,
      height: Math.min(450, 200 + options.length * 60),
      primaryButtonText: "Create",
      secondaryButtonText: "Cancel",
      ...otherConfig,
    };

    super(selectConfig, events);
    this.typeConfig = config;
    this.enhanceDiagramTypeDisplay();
  }

  private enhanceDiagramTypeDisplay(): void {
    setTimeout(() => {
      this.addCategoryHeaders();
      this.enhanceOptionStyling();
      this.addPreviewSection();
    }, 0);
  }

  private addCategoryHeaders(): void {
    if (!this.typeConfig.showCategoryHeaders) return;

    const categories = this.categorizeDiagramTypes();
    const optionsContainer = this.element.querySelector(
      ".select-options",
    ) as HTMLElement;
    if (!optionsContainer) return;

    // Clear existing options
    const existingOptions = Array.from(optionsContainer.children);
    optionsContainer.innerHTML = "";

    // Add categorized options
    Object.entries(categories).forEach(([category, types]) => {
      if (types.length === 0) return;

      // Add category header
      const header = document.createElement("div");
      header.className = "category-header";
      header.textContent = category;
      header.style.cssText = `
                padding: 12px 16px 8px 16px;
                font-weight: 600;
                font-size: 12px;
                text-transform: uppercase;
                color: var(--text-secondary, #A0A9BA);
                background: var(--bg-secondary, #1C2333);
                border-bottom: 1px solid var(--border-color, #2A3441);
                letter-spacing: 0.5px;
            `;
      optionsContainer.appendChild(header);

      // Add options for this category
      types.forEach((index) => {
        optionsContainer.appendChild(existingOptions[index]);
      });
    });
  }

  private categorizeDiagramTypes(): Record<string, number[]> {
    const categories: Record<string, number[]> = {
      "Business Process": [],
      "Software Design": [],
      "Component Architecture": [],
      "System Design": [],
    };

    this.typeConfig.diagramTypes.forEach((type, index) => {
      if (type.type.includes("workflow") || type.type.includes("bpmn")) {
        categories["Business Process"].push(index);
      } else if (type.type.includes("uml") || type.type.includes("class")) {
        categories["Software Design"].push(index);
      } else if (
        type.type.includes("wasm") ||
        type.type.includes("component")
      ) {
        categories["Component Architecture"].push(index);
      } else {
        categories["System Design"].push(index);
      }
    });

    // Remove empty categories
    Object.keys(categories).forEach((key) => {
      if (categories[key].length === 0) {
        delete categories[key];
      }
    });

    return categories;
  }

  private enhanceOptionStyling(): void {
    const options = this.element.querySelectorAll(
      ".select-option",
    ) as NodeListOf<HTMLElement>;

    options.forEach((option, _index) => {
      // Enhanced styling for diagram type options
      option.style.cssText += `
                padding: 16px;
                min-height: 60px;
            `;

      // Style the icon to be larger
      const icon = option.querySelector(".option-icon") as HTMLElement;
      if (icon) {
        icon.style.cssText = `
                    margin-right: 16px;
                    font-size: 24px;
                    min-width: 32px;
                    text-align: center;
                `;
      }

      // Enhanced label styling
      const label = option.querySelector(".option-label") as HTMLElement;
      if (label) {
        label.style.cssText = `
                    font-weight: 600;
                    font-size: 16px;
                    margin-bottom: 4px;
                    color: inherit;
                `;
      }

      // Enhanced description styling
      const description = option.querySelector(
        ".option-description",
      ) as HTMLElement;
      if (description) {
        description.style.cssText = `
                    font-size: 13px;
                    opacity: 0.9;
                    line-height: 1.4;
                    color: inherit;
                `;
      }

      // Add subtle animation on hover
      option.addEventListener("mouseenter", () => {
        option.style.transform = "translateX(4px)";
      });

      option.addEventListener("mouseleave", () => {
        option.style.transform = "translateX(0)";
      });
    });
  }

  private addPreviewSection(): void {
    const content = this.element.querySelector(
      ".select-dialog-content",
    ) as HTMLElement;
    if (!content) return;

    // Add preview section
    const previewSection = document.createElement("div");
    previewSection.className = "diagram-preview-section";
    previewSection.style.cssText = `
            margin-top: 16px;
            padding: 12px;
            background: var(--bg-primary, #0F1419);
            border: 1px solid var(--border-color, #2A3441);
            border-radius: 4px;
            min-height: 60px;
        `;

    previewSection.innerHTML = `
            <div class="preview-header" style="
                font-weight: 600;
                margin-bottom: 8px;
                color: var(--text-primary, #E5E9F0);
                font-size: 14px;
            ">Preview</div>
            <div class="preview-content" style="
                color: var(--text-secondary, #A0A9BA);
                font-size: 13px;
                line-height: 1.4;
            ">Select a diagram type to see more details</div>
        `;

    content.appendChild(previewSection);

    // Update preview when selection changes
    this.setupPreviewUpdates(previewSection);
  }

  private setupPreviewUpdates(previewSection: HTMLElement): void {
    const options = this.element.querySelectorAll(
      ".select-option",
    ) as NodeListOf<HTMLElement>;

    options.forEach((option, index) => {
      option.addEventListener("click", () => {
        this.updatePreview(previewSection, index);
      });

      option.addEventListener("mouseenter", () => {
        this.updatePreview(previewSection, index, true);
      });
    });
  }

  private updatePreview(
    previewSection: HTMLElement,
    typeIndex: number,
    isHover: boolean = false,
  ): void {
    const previewContent = previewSection.querySelector(
      ".preview-content",
    ) as HTMLElement;
    if (!previewContent) return;

    const type = this.typeConfig.diagramTypes[typeIndex];
    if (!type) return;

    const nodeTypes = type.nodeTypes.map((n) => n.label).slice(0, 3);
    const edgeTypes = type.edgeTypes.map((e) => e.label).slice(0, 3);
    const layout = type.defaultLayout || "automatic";

    previewContent.innerHTML = `
            <div style="margin-bottom: 8px;">
                <strong>${type.icon} ${type.label}</strong>
                ${isHover ? " (hover preview)" : ""}
            </div>
            <div style="margin-bottom: 4px;">
                <span style="color: var(--text-primary, #E5E9F0);">Elements:</span>
                ${nodeTypes.join(", ")}${
                  nodeTypes.length < type.nodeTypes.length ? "..." : ""
                }
            </div>
            <div style="margin-bottom: 4px;">
                <span style="color: var(--text-primary, #E5E9F0);">Connections:</span>
                ${edgeTypes.join(", ")}${
                  edgeTypes.length < type.edgeTypes.length ? "..." : ""
                }
            </div>
            <div>
                <span style="color: var(--text-primary, #E5E9F0);">Default Layout:</span>
                ${layout}
            </div>
        `;
  }

  // Get the selected diagram type configuration
  public getSelectedDiagramType(): DiagramTypeConfig | null {
    const selectedOptions = this.getSelectedOptions();
    if (selectedOptions.length === 0) return null;

    const selectedValue = selectedOptions[0].value;
    return (
      this.typeConfig.diagramTypes.find(
        (type) => type.type === selectedValue,
      ) || null
    );
  }

  // Static factory method
  public static async showDiagramTypeSelector(
    diagramTypes: DiagramTypeConfig[],
    config: Partial<DiagramTypeDialogConfig> = {},
  ): Promise<DiagramTypeConfig | null> {
    return new Promise((resolve) => {
      const dialog = new DiagramTypeDialog(
        {
          diagramTypes,
          showDescriptions: true,
          showCategoryHeaders: diagramTypes.length > 4,
          ...config,
        },
        {
          onConfirm: () => {
            const selectedType = dialog.getSelectedDiagramType();
            dialog.close();
            resolve(selectedType);
          },
          onCancel: () => {
            dialog.close();
            resolve(null);
          },
        },
      );

      dialog.show();
    });
  }
}
