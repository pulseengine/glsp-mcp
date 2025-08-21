/**
 * Diagram Name Dialog
 * Professional name input with validation for diagram creation
 */

import { PromptDialog, PromptDialogConfig } from "../base/PromptDialog.js";
import { DialogEvents } from "../base/BaseDialog.js";
import { DiagramTypeConfig } from "../../../diagrams/diagram-type-registry.js";

export interface DiagramNameDialogConfig extends PromptDialogConfig {
  diagramType?: DiagramTypeConfig;
  existingNames?: string[];
  suggestDefault?: boolean;
  showTypeInfo?: boolean;
}

export class DiagramNameDialog extends PromptDialog {
  private nameConfig: DiagramNameDialogConfig;

  constructor(config: DiagramNameDialogConfig = {}, events: DialogEvents = {}) {
    const defaultName =
      config.suggestDefault !== false
        ? DiagramNameDialog.generateDefaultName(config.diagramType)
        : "";

    const promptConfig: PromptDialogConfig = {
      title: "Name Your Diagram",
      message: config.diagramType
        ? `Enter a name for your new ${config.diagramType.label}:`
        : "Enter a name for your new diagram:",
      placeholder: "Enter diagram name...",
      defaultValue: defaultName,
      required: true,
      minLength: 1,
      maxLength: 100,
      pattern: /^[a-zA-Z0-9\s\-_.()]+$/,
      validationMessage:
        "Name can only contain letters, numbers, spaces, and common punctuation",
      width: 500,
      height: config.showTypeInfo ? 280 : 220,
      primaryButtonText: "Create Diagram",
      secondaryButtonText: "Cancel",
      ...config,
    };

    super(promptConfig, events);
    this.nameConfig = config;
    this.setupNameValidation();

    if (config.showTypeInfo) {
      this.addTypeInfoSection();
    }
  }

  private setupNameValidation(): void {
    setTimeout(() => {
      if (!this.inputElement) return;

      // Override the input validation to include name-specific checks
      const originalValidation = this.validateInput.bind(this);

      this.validateInput = () => {
        const value = this.inputElement.value.trim();
        let isValid = true;
        let errorMessage = "";

        // Basic validation from parent class
        if (!originalValidation()) {
          return false;
        }

        // Check for existing names
        if (
          this.nameConfig.existingNames &&
          this.nameConfig.existingNames.includes(value)
        ) {
          isValid = false;
          errorMessage = "A diagram with this name already exists";
        }

        // Check for reserved names
        const reservedNames = ["new", "untitled", "temp", "test", "copy"];
        if (reservedNames.includes(value.toLowerCase())) {
          isValid = false;
          errorMessage =
            "This name is reserved. Please choose a different name";
        }

        // Check for only whitespace or special characters
        if (value && !/[a-zA-Z0-9]/.test(value)) {
          isValid = false;
          errorMessage = "Name must contain at least one letter or number";
        }

        // Show/hide error
        this.showValidationError(isValid ? "" : errorMessage);

        return isValid;
      };

      // Add real-time suggestions
      this.addNameSuggestions();
    }, 0);
  }

  private addNameSuggestions(): void {
    if (!this.inputElement) return;

    const suggestionsContainer = document.createElement("div");
    suggestionsContainer.className = "name-suggestions";
    suggestionsContainer.style.cssText = `
            margin-top: 8px;
            padding: 8px;
            background: var(--bg-tertiary, #1C2333);
            border: 1px solid var(--border-color, #2A3441);
            border-radius: 4px;
            font-size: 12px;
            color: var(--text-secondary, #A0A9BA);
        `;

    const suggestions = this.generateNameSuggestions();
    suggestionsContainer.innerHTML = `
            <div style="margin-bottom: 4px; font-weight: 500;">Suggestions:</div>
            <div class="suggestion-list" style="display: flex; flex-wrap: wrap; gap: 4px;">
                ${suggestions
                  .map(
                    (name) => `
                    <span class="suggestion-item" style="
                        padding: 2px 6px;
                        background: var(--bg-primary, #0F1419);
                        border: 1px solid var(--border-color, #2A3441);
                        border-radius: 3px;
                        cursor: pointer;
                        transition: all 0.2s ease;
                    " data-name="${name}">${name}</span>
                `,
                  )
                  .join("")}
            </div>
        `;

    // Insert after the input group
    const inputGroup = this.inputElement.parentElement;
    if (inputGroup) {
      inputGroup.appendChild(suggestionsContainer);
    }

    // Add click handlers for suggestions
    const suggestionItems = suggestionsContainer.querySelectorAll(
      ".suggestion-item",
    ) as NodeListOf<HTMLElement>;
    suggestionItems.forEach((item) => {
      item.addEventListener("click", () => {
        const name = item.getAttribute("data-name") || "";
        if (this.inputElement) {
          this.inputElement.value = name;
          this.inputElement.focus();
          this.validateInput();
          this.updatePrimaryButton();
        }
      });

      item.addEventListener("mouseenter", () => {
        item.style.backgroundColor = "var(--accent-primary, #4A9EFF)";
        item.style.color = "white";
      });

      item.addEventListener("mouseleave", () => {
        item.style.backgroundColor = "var(--bg-primary, #0F1419)";
        item.style.color = "var(--text-secondary, #A0A9BA)";
      });
    });
  }

  private generateNameSuggestions(): string[] {
    const suggestions: string[] = [];
    const type = this.nameConfig.diagramType;

    if (type) {
      // Type-based suggestions
      const typeWord = type.label.split(" ")[0]; // Get first word
      const timestamp = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
      const timeString = new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });

      suggestions.push(
        `${typeWord} Design`,
        `${typeWord} ${timestamp}`,
        `${typeWord} ${timeString}`,
        `My ${typeWord}`,
        `New ${typeWord}`,
        `${typeWord} v1.0`,
      );

      // Context-specific suggestions
      if (type.type.includes("workflow")) {
        suggestions.push("Process Flow", "Business Process", "Workflow Model");
      } else if (type.type.includes("wasm")) {
        suggestions.push(
          "Component Architecture",
          "WASM System",
          "Module Design",
        );
      } else if (type.type.includes("uml")) {
        suggestions.push("Class Model", "System Design", "Architecture");
      }
    } else {
      // Generic suggestions
      suggestions.push(
        "Diagram Design",
        "System Overview",
        "Process Model",
        "Architecture Draft",
      );
    }

    // Filter out existing names
    return suggestions
      .filter((name) => !this.nameConfig.existingNames?.includes(name))
      .slice(0, 6);
  }

  private addTypeInfoSection(): void {
    if (!this.nameConfig.diagramType) return;

    setTimeout(() => {
      const content = this.element.querySelector(
        ".prompt-dialog-content",
      ) as HTMLElement;
      if (!content) return;

      const type = this.nameConfig.diagramType!;
      const infoSection = document.createElement("div");
      infoSection.className = "diagram-type-info";
      infoSection.style.cssText = `
                margin-top: 16px;
                padding: 12px;
                background: var(--bg-tertiary, #1C2333);
                border: 1px solid var(--border-color, #2A3441);
                border-radius: 4px;
            `;

      infoSection.innerHTML = `
                <div class="type-header" style="
                    display: flex;
                    align-items: center;
                    margin-bottom: 8px;
                    font-weight: 600;
                    color: var(--text-primary, #E5E9F0);
                ">
                    <span style="margin-right: 8px; font-size: 18px;">${type.icon}</span>
                    ${type.label}
                </div>
                <div class="type-description" style="
                    color: var(--text-secondary, #A0A9BA);
                    font-size: 13px;
                    line-height: 1.4;
                    margin-bottom: 8px;
                ">${type.description}</div>
                <div class="type-details" style="
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 8px;
                    font-size: 12px;
                    color: var(--text-secondary, #A0A9BA);
                ">
                    <div>
                        <strong>Elements:</strong> ${type.nodeTypes.length}
                    </div>
                    <div>
                        <strong>Connections:</strong> ${type.edgeTypes.length}
                    </div>
                </div>
            `;

      content.appendChild(infoSection);
    }, 0);
  }

  // Static method to generate default names
  private static generateDefaultName(diagramType?: DiagramTypeConfig): string {
    const now = new Date();
    const date = now.toISOString().slice(0, 10);

    if (diagramType) {
      const typeWord = diagramType.label.split(" ")[0];
      return `New ${typeWord} ${date}`;
    }

    return `New Diagram ${date}`;
  }

  // Get cleaned diagram name
  public getCleanName(): string {
    const value = this.getValue().trim();

    // Clean up the name
    return value
      .replace(/\s+/g, " ") // Normalize whitespace
      .replace(/[^\w\s\-_.()]/g, "") // Remove invalid characters
      .trim();
  }

  // Override result to return cleaned name
  public getResult() {
    return {
      confirmed: true,
      value: this.getCleanName(),
    };
  }

  // Static factory method
  public static async promptForDiagramName(
    diagramType?: DiagramTypeConfig,
    existingNames?: string[],
    config: Partial<DiagramNameDialogConfig> = {},
  ): Promise<string | null> {
    return new Promise((resolve) => {
      const dialog = new DiagramNameDialog(
        {
          diagramType,
          existingNames,
          showTypeInfo: !!diagramType,
          suggestDefault: true,
          ...config,
        },
        {
          onConfirm: (name) => {
            dialog.close();
            resolve(typeof name === "string" ? name : null);
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
