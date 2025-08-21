/**
 * Confirm Dialog
 * Professional replacement for browser confirm() with custom styling
 */

import { BaseDialog, DialogConfig, DialogEvents } from "./BaseDialog.js";
import { DialogResult } from "../DialogManager.js";

export interface ConfirmDialogConfig extends DialogConfig {
  message: string;
  details?: string;
  confirmText?: string;
  cancelText?: string;
  variant?: "default" | "danger" | "warning" | "info";
  icon?: string;
  showIcon?: boolean;
}

export class ConfirmDialog extends BaseDialog {
  private static currentConfig: ConfirmDialogConfig;
  private confirmConfig: ConfirmDialogConfig;
  private confirmed: boolean = false;

  constructor(config: ConfirmDialogConfig, events: DialogEvents = {}) {
    const defaultConfig: ConfirmDialogConfig = {
      ...config,
      title: config.title || "Confirm Action",
      message: config.message || "Are you sure?",
      confirmText: config.confirmText || "Yes",
      cancelText: config.cancelText || "No",
      variant: config.variant || "default",
      showIcon: config.showIcon !== false,
      width: config.width || 450,
      height: config.height || 220,
      primaryButtonText:
        config.confirmText || config.primaryButtonText || "Yes",
      secondaryButtonText:
        config.cancelText || config.secondaryButtonText || "No",
    };

    // Set icon based on variant if not provided
    if (!defaultConfig.icon && defaultConfig.showIcon) {
      switch (defaultConfig.variant) {
        case "danger":
          defaultConfig.icon = "⚠️";
          break;
        case "warning":
          defaultConfig.icon = "⚡";
          break;
        case "info":
          defaultConfig.icon = "ℹ️";
          break;
        default:
          defaultConfig.icon = "❓";
          break;
      }
    }

    // Store config statically so createDialogContent can access it
    ConfirmDialog.currentConfig = defaultConfig;
    super(defaultConfig, events);
    this.confirmConfig = defaultConfig;
  }

  protected createDialogContent(): string {
    const config = ConfirmDialog.currentConfig ||
      this.confirmConfig || { message: "Are you sure?" };
    return `
            <div class="confirm-dialog-content">
                <div class="confirm-main">
                    ${
                      config.showIcon && config.icon
                        ? `<div class="confirm-icon">${config.icon}</div>`
                        : ""
                    }
                    <div class="confirm-text">
                        <div class="confirm-message">${
                          config.message || "Are you sure?"
                        }</div>
                        ${
                          config.details
                            ? `<div class="confirm-details">${config.details}</div>`
                            : ""
                        }
                    </div>
                </div>
            </div>
        `;
  }

  protected setupDialogStyling(): void {
    super.setupDialogStyling();

    // Adjust primary button styling based on variant
    setTimeout(() => {
      this.styleBasedOnVariant();
      this.styleContent();
    }, 0);
  }

  private styleContent(): void {
    // Style main container
    const main = this.element.querySelector(".confirm-main") as HTMLElement;
    if (main) {
      main.style.cssText = `
                display: flex;
                align-items: flex-start;
                gap: 16px;
            `;
    }

    // Style icon
    const icon = this.element.querySelector(".confirm-icon") as HTMLElement;
    if (icon) {
      icon.style.cssText = `
                font-size: 24px;
                line-height: 1;
                flex-shrink: 0;
                margin-top: 2px;
            `;
    }

    // Style text container
    const textContainer = this.element.querySelector(
      ".confirm-text",
    ) as HTMLElement;
    if (textContainer) {
      textContainer.style.cssText = `
                flex: 1;
                min-width: 0;
            `;
    }

    // Style message
    const message = this.element.querySelector(
      ".confirm-message",
    ) as HTMLElement;
    if (message) {
      message.style.cssText = `
                color: var(--text-primary, #E5E9F0);
                font-size: 16px;
                font-weight: 500;
                line-height: 1.5;
                margin-bottom: 8px;
            `;
    }

    // Style details
    const details = this.element.querySelector(
      ".confirm-details",
    ) as HTMLElement;
    if (details) {
      details.style.cssText = `
                color: var(--text-secondary, #A0A9BA);
                font-size: 14px;
                line-height: 1.4;
            `;
    }
  }

  private styleBasedOnVariant(): void {
    const primaryBtn = this.element.querySelector(
      ".primary-btn",
    ) as HTMLButtonElement;
    if (!primaryBtn) return;

    const config = ConfirmDialog.currentConfig;
    let buttonStyle = "";
    let headerStyle = "";

    switch (config.variant) {
      case "danger":
        buttonStyle = `
                    background: var(--accent-error, #F85149) !important;
                    color: white !important;
                    box-shadow: 0 0 20px rgba(248, 81, 73, 0.4) !important;
                    border: 1px solid rgba(248, 81, 73, 0.6) !important;
                `;
        headerStyle = `
                    background: var(--accent-error, #F85149) !important;
                    box-shadow: 0 0 15px rgba(248, 81, 73, 0.3) !important;
                `;
        primaryBtn.addEventListener("mouseenter", () => {
          primaryBtn.style.background = "#E73C35";
          primaryBtn.style.boxShadow = "0 0 25px rgba(248, 81, 73, 0.6)";
          primaryBtn.style.transform = "translateY(-1px)";
        });
        primaryBtn.addEventListener("mouseleave", () => {
          primaryBtn.style.background = "var(--accent-error, #F85149)";
          primaryBtn.style.boxShadow = "0 0 20px rgba(248, 81, 73, 0.4)";
          primaryBtn.style.transform = "";
        });
        break;

      case "warning":
        buttonStyle = `
                    background: var(--accent-warning, #F0B72F) !important;
                    color: var(--bg-primary, #0A0E1A) !important;
                    box-shadow: 0 0 20px rgba(240, 183, 47, 0.4) !important;
                    border: 1px solid rgba(240, 183, 47, 0.6) !important;
                    font-weight: 600 !important;
                `;
        headerStyle = `
                    background: var(--accent-warning, #F0B72F) !important;
                    color: var(--bg-primary, #0A0E1A) !important;
                    box-shadow: 0 0 15px rgba(240, 183, 47, 0.3) !important;
                `;
        primaryBtn.addEventListener("mouseenter", () => {
          primaryBtn.style.background = "#E6A827";
          primaryBtn.style.boxShadow = "0 0 25px rgba(240, 183, 47, 0.6)";
          primaryBtn.style.transform = "translateY(-1px)";
        });
        primaryBtn.addEventListener("mouseleave", () => {
          primaryBtn.style.background = "var(--accent-warning, #F0B72F)";
          primaryBtn.style.boxShadow = "0 0 20px rgba(240, 183, 47, 0.4)";
          primaryBtn.style.transform = "";
        });
        break;

      case "info":
        buttonStyle = `
                    background: var(--accent-info, #58A6FF) !important;
                    color: white !important;
                    box-shadow: 0 0 20px rgba(88, 166, 255, 0.4) !important;
                    border: 1px solid rgba(88, 166, 255, 0.6) !important;
                `;
        headerStyle = `
                    background: var(--accent-info, #58A6FF) !important;
                    box-shadow: 0 0 15px rgba(88, 166, 255, 0.3) !important;
                `;
        primaryBtn.addEventListener("mouseenter", () => {
          primaryBtn.style.background = "#4A94E6";
          primaryBtn.style.boxShadow = "0 0 25px rgba(88, 166, 255, 0.6)";
          primaryBtn.style.transform = "translateY(-1px)";
        });
        primaryBtn.addEventListener("mouseleave", () => {
          primaryBtn.style.background = "var(--accent-info, #58A6FF)";
          primaryBtn.style.boxShadow = "0 0 20px rgba(88, 166, 255, 0.4)";
          primaryBtn.style.transform = "";
        });
        break;

      default:
        // Keep default styling
        break;
    }

    if (buttonStyle) {
      primaryBtn.style.cssText += buttonStyle;
    }

    if (headerStyle && this.headerElement) {
      this.headerElement.style.cssText += headerStyle;
    }
  }

  protected createFooterButtons(): void {
    if (!this.footerElement) return;

    const config = ConfirmDialog.currentConfig;

    // For confirm dialogs, we want Cancel first, then Confirm
    const buttons = [
      {
        text: config.cancelText!,
        className: "secondary-btn cancel-btn",
        onClick: () => this.handleCancel(),
      },
      {
        text: config.confirmText!,
        className: "primary-btn confirm-btn",
        onClick: () => this.handleConfirm(),
      },
    ];

    // Create button elements
    buttons.forEach((btn) => {
      const button = document.createElement("button");
      button.textContent = btn.text;
      button.className = `dialog-btn ${btn.className}`;
      button.addEventListener("click", btn.onClick);

      this.styleButton(button, btn.className);
      this.footerElement!.appendChild(button);
    });
  }

  public validate(): boolean {
    return true; // Confirm dialogs don't need validation
  }

  public getResult(): DialogResult<boolean> {
    return {
      confirmed: this.confirmed,
      value: this.confirmed,
    };
  }

  protected handleConfirm(): void {
    this.confirmed = true;
    super.handleConfirm(true);
  }

  protected handleCancel(): void {
    this.confirmed = false;
    super.handleCancel();
  }

  // Keyboard shortcuts
  protected focusFirst(): void {
    // Focus the cancel button by default for safety
    const cancelBtn = this.element.querySelector(".cancel-btn") as HTMLElement;
    if (cancelBtn) {
      cancelBtn.focus();
    }
  }

  // Static factory methods for common confirm dialogs
  public static createDeleteConfirm(
    itemName: string,
    details?: string,
  ): ConfirmDialog {
    return new ConfirmDialog({
      title: "Delete Confirmation",
      message: `Are you sure you want to delete "${itemName}"?`,
      details: details || "This action cannot be undone.",
      confirmText: "Delete",
      cancelText: "Cancel",
      variant: "danger",
      icon: "🗑️",
    });
  }

  public static createSaveConfirm(
    hasUnsavedChanges: boolean = true,
  ): ConfirmDialog {
    return new ConfirmDialog({
      title: "Unsaved Changes",
      message: hasUnsavedChanges
        ? "You have unsaved changes."
        : "Save changes?",
      details: "Would you like to save before continuing?",
      confirmText: "Save",
      cancelText: "Don't Save",
      variant: "warning",
      icon: "💾",
    });
  }

  public static createExitConfirm(): ConfirmDialog {
    return new ConfirmDialog({
      title: "Exit Application",
      message: "Are you sure you want to exit?",
      details: "Any unsaved work will be lost.",
      confirmText: "Exit",
      cancelText: "Stay",
      variant: "warning",
      icon: "🚪",
    });
  }
}
