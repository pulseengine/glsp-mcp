/**
 * Select Dialog
 * Professional replacement for selection prompts with icons and descriptions
 */

import { BaseDialog, DialogConfig, DialogEvents } from "./BaseDialog.js";
import { DialogResult } from "../DialogManager.js";

export interface SelectOption {
  value: string;
  label: string;
  description?: string;
  icon?: string;
  disabled?: boolean;
}

export interface SelectDialogConfig extends DialogConfig {
  message?: string;
  options: SelectOption[];
  defaultSelection?: number;
  allowMultiple?: boolean;
  searchable?: boolean;
  required?: boolean;
}

export class SelectDialog extends BaseDialog {
  private static currentSelectConfig: SelectDialogConfig;
  private static currentSelectedIndices: Set<number> = new Set();
  private selectConfig: SelectDialogConfig;
  private selectedIndices: Set<number> = new Set();
  private optionElements: HTMLElement[] = [];
  private searchInput?: HTMLInputElement;
  private messageElement!: HTMLElement;

  constructor(config: SelectDialogConfig, events: DialogEvents = {}) {
    const defaultConfig: SelectDialogConfig = {
      ...config,
      title: config.title || "Select Option",
      message: config.message || "Please choose an option:",
      options: config.options || [],
      defaultSelection: config.defaultSelection ?? -1,
      allowMultiple: config.allowMultiple || false,
      searchable: config.searchable || false,
      required: config.required !== false,
      width: config.width || 500,
      height: config.height || 400,
    };

    // Store config statically so createDialogContent can access it
    SelectDialog.currentSelectConfig = defaultConfig;

    // Initialize static selected indices for use in createDialogContent
    SelectDialog.currentSelectedIndices = new Set();
    if (
      defaultConfig.defaultSelection !== undefined &&
      defaultConfig.defaultSelection >= 0
    ) {
      SelectDialog.currentSelectedIndices.add(defaultConfig.defaultSelection);
    }

    super(defaultConfig, events);
    this.selectConfig = defaultConfig;

    // Set default selection on instance
    if (
      this.selectConfig.defaultSelection !== undefined &&
      this.selectConfig.defaultSelection >= 0
    ) {
      this.selectedIndices.add(this.selectConfig.defaultSelection);
    }

    this.setupOptionHandlers();
  }

  protected createDialogContent(): string {
    const config = SelectDialog.currentSelectConfig || this.selectConfig;
    const searchInput = config.searchable
      ? `
            <div class="select-search-group">
                <input type="text" class="select-search" placeholder="Search options..." />
            </div>
        `
      : "";

    const selectedIndices = SelectDialog.currentSelectedIndices || new Set();
    const optionsList = config.options
      .map(
        (option, index) => `
            <div class="select-option ${
              selectedIndices.has(index) ? "selected" : ""
            } ${option.disabled ? "disabled" : ""}"
                 data-index="${index}">
                ${
                  option.icon
                    ? `<span class="option-icon">${option.icon}</span>`
                    : ""
                }
                <div class="option-content">
                    <div class="option-label">${option.label}</div>
                    ${
                      option.description
                        ? `<div class="option-description">${option.description}</div>`
                        : ""
                    }
                </div>
                <div class="option-indicator">
                    ${config.allowMultiple ? "☐" : "○"}
                </div>
            </div>
        `,
      )
      .join("");

    return `
            <div class="select-dialog-content">
                <div class="select-message">${config.message || ""}</div>
                ${searchInput}
                <div class="select-options-container">
                    <div class="select-options">
                        ${optionsList}
                    </div>
                </div>
            </div>
        `;
  }

  protected setupDialogStyling(): void {
    super.setupDialogStyling();

    setTimeout(() => {
      // Style the message
      this.messageElement = this.element.querySelector(
        ".select-message",
      ) as HTMLElement;
      if (this.messageElement) {
        this.messageElement.style.cssText = `
                    margin-bottom: 16px;
                    color: var(--text-primary, #E5E9F0);
                    font-size: 14px;
                    line-height: 1.5;
                `;
      }

      // Style search input
      if (this.selectConfig.searchable) {
        this.searchInput = this.element.querySelector(
          ".select-search",
        ) as HTMLInputElement;
        if (this.searchInput) {
          this.searchInput.style.cssText = `
                        width: 100%;
                        padding: 8px 12px;
                        margin-bottom: 12px;
                        border: 1px solid var(--border-color, #2A3441);
                        border-radius: 4px;
                        background: var(--bg-primary, #0F1419);
                        color: var(--text-primary, #E5E9F0);
                        font-size: 13px;
                        outline: none;
                    `;
        }
      }

      // Style options container
      const container = this.element.querySelector(
        ".select-options-container",
      ) as HTMLElement;
      if (container) {
        container.style.cssText = `
                    max-height: 250px;
                    overflow-y: auto;
                    border: 1px solid var(--border-color, #2A3441);
                    border-radius: 4px;
                    background: var(--bg-primary, #0F1419);
                `;
      }

      // Style individual options
      this.optionElements = Array.from(
        this.element.querySelectorAll(
          ".select-option",
        ) as NodeListOf<HTMLElement>,
      );
      this.optionElements.forEach((option, index) => {
        this.styleOption(option, index);
      });

      this.updatePrimaryButton();
    }, 0);
  }

  private styleOption(option: HTMLElement, index: number): void {
    const isSelected = this.selectedIndices.has(index);
    const isDisabled = this.selectConfig.options[index].disabled;

    option.style.cssText = `
            display: flex;
            align-items: center;
            padding: 12px;
            border-bottom: 1px solid var(--border-color, #2A3441);
            cursor: ${isDisabled ? "not-allowed" : "pointer"};
            transition: background-color 0.2s ease;
            background: ${
              isSelected ? "var(--accent-primary, #4A9EFF)" : "transparent"
            };
            color: ${
              isSelected
                ? "white"
                : isDisabled
                  ? "var(--text-dim, #484F58)"
                  : "var(--text-primary, #E5E9F0)"
            };
            opacity: ${isDisabled ? 0.5 : 1};
        `;

    // Style icon
    const icon = option.querySelector(".option-icon") as HTMLElement;
    if (icon) {
      icon.style.cssText = `
                margin-right: 12px;
                font-size: 18px;
                min-width: 24px;
                text-align: center;
            `;
    }

    // Style content
    const content = option.querySelector(".option-content") as HTMLElement;
    if (content) {
      content.style.cssText = `
                flex: 1;
                min-width: 0;
            `;
    }

    // Style label
    const label = option.querySelector(".option-label") as HTMLElement;
    if (label) {
      label.style.cssText = `
                font-weight: 500;
                margin-bottom: 2px;
            `;
    }

    // Style description
    const description = option.querySelector(
      ".option-description",
    ) as HTMLElement;
    if (description) {
      description.style.cssText = `
                font-size: 12px;
                opacity: 0.8;
                line-height: 1.3;
            `;
    }

    // Style indicator
    const indicator = option.querySelector(".option-indicator") as HTMLElement;
    if (indicator) {
      indicator.style.cssText = `
                margin-left: 12px;
                font-size: 16px;
            `;

      if (this.selectConfig.allowMultiple) {
        indicator.textContent = isSelected ? "☑" : "☐";
      } else {
        indicator.textContent = isSelected ? "●" : "○";
      }
    }

    // Hover effects
    if (!isDisabled) {
      option.addEventListener("mouseenter", () => {
        if (!this.selectedIndices.has(index)) {
          option.style.backgroundColor = "var(--bg-tertiary, #1C2333)";
        }
      });

      option.addEventListener("mouseleave", () => {
        if (!this.selectedIndices.has(index)) {
          option.style.backgroundColor = "transparent";
        }
      });
    }
  }

  private setupOptionHandlers(): void {
    setTimeout(() => {
      this.optionElements.forEach((option, index) => {
        if (this.selectConfig.options[index].disabled) return;

        option.addEventListener("click", () => {
          this.toggleOption(index);
        });
      });

      // Setup search if enabled
      if (this.searchInput) {
        this.searchInput.addEventListener("input", () => {
          this.filterOptions();
        });
      }

      // Keyboard navigation
      this.element.addEventListener("keydown", (e) => {
        this.handleKeyNavigation(e);
      });
    }, 0);
  }

  private toggleOption(index: number): void {
    if (this.selectConfig.options[index].disabled) return;

    if (this.selectConfig.allowMultiple) {
      // Toggle selection for multiple
      if (this.selectedIndices.has(index)) {
        this.selectedIndices.delete(index);
      } else {
        this.selectedIndices.add(index);
      }
    } else {
      // Single selection - clear previous and set new
      this.selectedIndices.clear();
      this.selectedIndices.add(index);
    }

    // Update styling
    this.optionElements.forEach((option, idx) => {
      this.styleOption(option, idx);
    });

    this.updatePrimaryButton();

    // Auto-confirm for single selection if not required to show buttons
    if (!this.selectConfig.allowMultiple && !this.selectConfig.required) {
      setTimeout(() => this.handleConfirm(), 200);
    }
  }

  private filterOptions(): void {
    if (!this.searchInput) return;

    const searchTerm = this.searchInput.value.toLowerCase();

    this.optionElements.forEach((option, index) => {
      const optionData = this.selectConfig.options[index];
      const matches =
        optionData.label.toLowerCase().includes(searchTerm) ||
        (optionData.description || "").toLowerCase().includes(searchTerm);

      option.style.display = matches ? "flex" : "none";
    });
  }

  private handleKeyNavigation(e: KeyboardEvent): void {
    const visibleOptions = this.optionElements.filter(
      (opt) => opt.style.display !== "none",
    );
    if (visibleOptions.length === 0) return;

    let currentIndex = -1;
    for (let i = 0; i < visibleOptions.length; i++) {
      if (visibleOptions[i].style.backgroundColor.includes("tertiary")) {
        currentIndex = i;
        break;
      }
    }

    let newIndex = currentIndex;

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        newIndex = Math.min(currentIndex + 1, visibleOptions.length - 1);
        break;
      case "ArrowUp":
        e.preventDefault();
        newIndex = Math.max(currentIndex - 1, 0);
        break;
      case "Enter":
        if (currentIndex >= 0) {
          const actualIndex = this.optionElements.indexOf(
            visibleOptions[currentIndex],
          );
          this.toggleOption(actualIndex);
        }
        return;
    }

    // Update hover state
    visibleOptions.forEach((opt, idx) => {
      if (idx === newIndex) {
        opt.style.backgroundColor = "var(--bg-tertiary, #1C2333)";
      } else if (!this.selectedIndices.has(this.optionElements.indexOf(opt))) {
        opt.style.backgroundColor = "transparent";
      }
    });
  }

  private updatePrimaryButton(): void {
    const primaryBtn = this.element.querySelector(
      ".primary-btn",
    ) as HTMLButtonElement;
    if (primaryBtn) {
      const hasSelection = this.selectedIndices.size > 0;
      primaryBtn.disabled = this.selectConfig.required ? !hasSelection : false;
      primaryBtn.style.opacity = primaryBtn.disabled ? "0.5" : "1";
    }
  }

  public validate(): boolean {
    if (this.selectConfig.required) {
      return this.selectedIndices.size > 0;
    }
    return true;
  }

  public getResult(): DialogResult<SelectOption[]> {
    const selectedOptions = Array.from(this.selectedIndices).map(
      (index) => this.selectConfig.options[index],
    );

    return {
      confirmed: true,
      value: selectedOptions,
    };
  }

  public getSelectedOptions(): SelectOption[] {
    return Array.from(this.selectedIndices).map(
      (index) => this.selectConfig.options[index],
    );
  }

  public getSelectedValues(): string[] {
    return this.getSelectedOptions().map((opt) => opt.value);
  }

  public setSelection(indices: number[]): void {
    this.selectedIndices.clear();
    indices.forEach((index) => {
      if (index >= 0 && index < this.selectConfig.options.length) {
        this.selectedIndices.add(index);
      }
    });

    // Update styling
    this.optionElements.forEach((option, idx) => {
      this.styleOption(option, idx);
    });

    this.updatePrimaryButton();
  }

  protected handleConfirm(): void {
    if (this.validate()) {
      super.handleConfirm(this.getSelectedOptions());
    }
  }
}
