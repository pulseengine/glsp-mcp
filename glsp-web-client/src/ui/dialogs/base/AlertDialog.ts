/**
 * Alert Dialog
 * Professional replacement for browser alert() with enhanced styling and features
 */

import { BaseDialog, DialogConfig, DialogEvents } from "./BaseDialog.js";
import { DialogResult } from "../DialogManager.js";

export interface AlertDialogConfig extends DialogConfig {
  message: string;
  details?: string;
  variant?: "info" | "success" | "warning" | "error";
  icon?: string;
  showIcon?: boolean;
  buttonText?: string;
  copyable?: boolean; // Allow copying the message/details
  expandable?: boolean; // Allow expanding details
}

export class AlertDialog extends BaseDialog {
  private static currentConfig: AlertDialogConfig;
  private _alertConfig: AlertDialogConfig; // TODO: Use this config for customization
  private isDetailsExpanded: boolean = false;

  constructor(config: AlertDialogConfig, events: DialogEvents = {}) {
    const defaultConfig: AlertDialogConfig = {
      ...config,
      title: config.title || "Information",
      message: config.message || "Alert message",
      variant: config.variant || "info",
      showIcon: config.showIcon !== false,
      buttonText: config.buttonText || "OK",
      copyable: config.copyable || false,
      expandable: config.expandable || false,
      width: config.width || 450,
      height: config.height || 200,
      showFooter: config.showFooter !== false,
      secondaryButtonText: undefined, // No secondary button for alerts
    };

    // Set primaryButtonText after merging config
    defaultConfig.primaryButtonText = defaultConfig.buttonText || "OK";

    // Set icon based on variant if not provided
    if (!defaultConfig.icon && defaultConfig.showIcon) {
      switch (defaultConfig.variant) {
        case "success":
          defaultConfig.icon = "✅";
          defaultConfig.title = "Success";
          break;
        case "warning":
          defaultConfig.icon = "⚠️";
          defaultConfig.title = "Warning";
          break;
        case "error":
          defaultConfig.icon = "❌";
          defaultConfig.title = "Error";
          break;
        default:
          defaultConfig.icon = "ℹ️";
          defaultConfig.title = "Information";
          break;
      }
    }

    // Store config statically so createDialogContent can access it
    AlertDialog.currentConfig = defaultConfig;

    super(defaultConfig, events);
    this._alertConfig = defaultConfig;
  }

  protected createDialogContent(): string {
    const config = AlertDialog.currentConfig;
    const copyButton = config.copyable
      ? `
            <button class="copy-btn" title="Copy to clipboard">📋</button>
        `
      : "";

    const expandButton =
      config.expandable && config.details
        ? `
            <button class="expand-btn" title="Show details">▼</button>
        `
        : "";

    return `
            <div class="alert-dialog-content">
                <div class="alert-main">
                    ${
                      config.showIcon && config.icon
                        ? `<div class="alert-icon">${config.icon}</div>`
                        : ""
                    }
                    <div class="alert-text">
                        <div class="alert-message">${config.message}</div>
                        ${
                          config.details
                            ? `
                            <div class="alert-details ${
                              config.expandable ? "expandable" : "visible"
                            }"
                                 style="${
                                   config.expandable ? "display: none;" : ""
                                 }">
                                ${config.details}
                            </div>
                        `
                            : ""
                        }
                    </div>
                    <div class="alert-actions">
                        ${expandButton}
                        ${copyButton}
                    </div>
                </div>
            </div>
        `;
  }

  protected setupDialogStyling(): void {
    super.setupDialogStyling();

    setTimeout(() => {
      this.styleBasedOnVariant();
      this.styleContent();
      this.setupActionHandlers();
    }, 0);
  }

  private styleContent(): void {
    // Style main container
    const main = this.element.querySelector(".alert-main") as HTMLElement;
    if (main) {
      main.style.cssText = `
                display: flex;
                align-items: flex-start;
                gap: 16px;
            `;
    }

    // Style icon
    const icon = this.element.querySelector(".alert-icon") as HTMLElement;
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
      ".alert-text",
    ) as HTMLElement;
    if (textContainer) {
      textContainer.style.cssText = `
                flex: 1;
                min-width: 0;
            `;
    }

    // Style message
    const message = this.element.querySelector(".alert-message") as HTMLElement;
    if (message) {
      message.style.cssText = `
                color: var(--text-primary, #E5E9F0);
                font-size: 16px;
                font-weight: 500;
                line-height: 1.5;
                margin-bottom: 8px;
                word-wrap: break-word;
            `;
    }

    // Style details
    const details = this.element.querySelector(".alert-details") as HTMLElement;
    if (details) {
      details.style.cssText = `
                color: var(--text-secondary, #A0A9BA);
                font-size: 14px;
                line-height: 1.4;
                padding: 8px 12px;
                background: var(--bg-primary, #0F1419);
                border: 1px solid var(--border-color, #2A3441);
                border-radius: 4px;
                white-space: pre-wrap;
                word-wrap: break-word;
                font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
                max-height: 200px;
                overflow-y: auto;
            `;
    }

    // Style actions container
    const actions = this.element.querySelector(".alert-actions") as HTMLElement;
    if (actions) {
      actions.style.cssText = `
                display: flex;
                flex-direction: column;
                gap: 4px;
                flex-shrink: 0;
            `;
    }

    // Style action buttons
    const actionButtons = this.element.querySelectorAll(
      ".copy-btn, .expand-btn",
    ) as NodeListOf<HTMLButtonElement>;
    actionButtons.forEach((btn) => {
      btn.style.cssText = `
                background: none;
                border: 1px solid var(--border-color, #2A3441);
                border-radius: 4px;
                color: var(--text-secondary, #A0A9BA);
                cursor: pointer;
                font-size: 12px;
                padding: 4px 6px;
                transition: all 0.2s ease;
                min-width: 24px;
                height: 24px;
            `;

      btn.addEventListener("mouseenter", () => {
        btn.style.backgroundColor = "var(--bg-tertiary, #1C2333)";
        btn.style.color = "var(--text-primary, #E5E9F0)";
      });

      btn.addEventListener("mouseleave", () => {
        btn.style.backgroundColor = "transparent";
        btn.style.color = "var(--text-secondary, #A0A9BA)";
      });
    });
  }

  private styleBasedOnVariant(): void {
    const primaryBtn = this.element.querySelector(
      ".primary-btn",
    ) as HTMLButtonElement;
    let buttonStyle = "";
    let headerStyle = "";

    const config = AlertDialog.currentConfig;
    switch (config.variant) {
      case "success":
        buttonStyle = `
                    background: linear-gradient(90deg, #10B981, #059669) !important;
                    color: white !important;
                `;
        headerStyle = `
                    background: linear-gradient(90deg, #10B981, #059669) !important;
                `;
        break;

      case "warning":
        buttonStyle = `
                    background: linear-gradient(90deg, #F59E0B, #D97706) !important;
                    color: white !important;
                `;
        headerStyle = `
                    background: linear-gradient(90deg, #F59E0B, #D97706) !important;
                `;
        break;

      case "error":
        buttonStyle = `
                    background: linear-gradient(90deg, #EF4444, #DC2626) !important;
                    color: white !important;
                `;
        headerStyle = `
                    background: linear-gradient(90deg, #EF4444, #DC2626) !important;
                `;
        break;

      default:
        // Keep default blue styling for info
        break;
    }

    if (buttonStyle && primaryBtn) {
      primaryBtn.style.cssText += buttonStyle;
    }

    if (headerStyle && this.headerElement) {
      this.headerElement.style.cssText += headerStyle;
    }
  }

  private setupActionHandlers(): void {
    // Copy button handler
    const copyBtn = this.element.querySelector(
      ".copy-btn",
    ) as HTMLButtonElement;
    if (copyBtn) {
      copyBtn.addEventListener("click", async () => {
        const config = AlertDialog.currentConfig;
        const textToCopy = config.details
          ? `${config.message}\n\n${config.details}`
          : config.message;

        try {
          await navigator.clipboard.writeText(textToCopy);
          copyBtn.textContent = "✓";
          copyBtn.style.color = "var(--accent-success, #10B981)";

          setTimeout(() => {
            copyBtn.textContent = "📋";
            copyBtn.style.color = "var(--text-secondary, #A0A9BA)";
          }, 1000);
        } catch (err) {
          console.error("Failed to copy to clipboard:", err);
          copyBtn.textContent = "✗";
          copyBtn.style.color = "var(--accent-error, #EF4444)";

          setTimeout(() => {
            copyBtn.textContent = "📋";
            copyBtn.style.color = "var(--text-secondary, #A0A9BA)";
          }, 1000);
        }
      });
    }

    // Expand button handler
    const expandBtn = this.element.querySelector(
      ".expand-btn",
    ) as HTMLButtonElement;
    const details = this.element.querySelector(".alert-details") as HTMLElement;

    if (expandBtn && details) {
      expandBtn.addEventListener("click", () => {
        this.isDetailsExpanded = !this.isDetailsExpanded;

        if (this.isDetailsExpanded) {
          details.style.display = "block";
          expandBtn.textContent = "▲";
          expandBtn.title = "Hide details";

          // Adjust dialog height if needed
          const currentHeight = parseInt(this.element.style.height || "200");
          this.element.style.height = `${Math.min(currentHeight + 150, 500)}px`;
        } else {
          details.style.display = "none";
          expandBtn.textContent = "▼";
          expandBtn.title = "Show details";

          // Reset dialog height
          this.element.style.height = `${
            AlertDialog.currentConfig.height || 200
          }px`;
        }
      });
    }
  }

  protected createFooterButtons(): void {
    if (!this.footerElement) return;

    const config = AlertDialog.currentConfig;
    // Only create the primary button for alerts
    const button = document.createElement("button");
    button.textContent = config.buttonText!;
    button.className = "dialog-btn primary-btn";
    button.addEventListener("click", () => this.handleConfirm());

    this.styleButton(button, "primary-btn");
    this.footerElement.appendChild(button);
  }

  public validate(): boolean {
    return true; // Alert dialogs don't need validation
  }

  public getResult(): DialogResult<boolean> {
    return {
      confirmed: true,
      value: true,
    };
  }

  protected handleConfirm(): void {
    super.handleConfirm(true);
  }

  // Keyboard handling - Enter or Space to close
  protected focusFirst(): void {
    const primaryBtn = this.element.querySelector(
      ".primary-btn",
    ) as HTMLElement;
    if (primaryBtn) {
      primaryBtn.focus();
    }
  }

  // Static factory methods for common alert types
  public static createError(message: string, details?: string): AlertDialog {
    return new AlertDialog({
      message,
      details,
      variant: "error",
      copyable: !!details,
      expandable: !!details,
    });
  }

  public static createSuccess(message: string, details?: string): AlertDialog {
    return new AlertDialog({
      message,
      details,
      variant: "success",
    });
  }

  public static createWarning(message: string, details?: string): AlertDialog {
    return new AlertDialog({
      message,
      details,
      variant: "warning",
    });
  }

  public static createInfo(message: string, details?: string): AlertDialog {
    return new AlertDialog({
      message,
      details,
      variant: "info",
    });
  }
}
