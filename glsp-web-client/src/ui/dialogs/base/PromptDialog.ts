/**
 * Prompt Dialog
 * Professional replacement for browser prompt() with validation
 */

import { BaseDialog, DialogConfig, DialogEvents } from "./BaseDialog.js";
import { DialogResult } from "../DialogManager.js";

export interface PromptDialogConfig extends DialogConfig {
  message?: string;
  placeholder?: string;
  defaultValue?: string;
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  pattern?: RegExp;
  validationMessage?: string;
  inputType?: "text" | "password" | "email" | "url" | "number";
}

export class PromptDialog extends BaseDialog {
  private static currentPromptConfig: PromptDialogConfig;
  private promptConfig: PromptDialogConfig;
  protected inputElement!: HTMLInputElement;
  protected errorElement!: HTMLElement;
  protected messageElement!: HTMLElement;

  constructor(config: PromptDialogConfig = {}, events: DialogEvents = {}) {
    const defaultConfig: PromptDialogConfig = {
      title: "Input Required",
      message: "Please enter a value:",
      placeholder: "",
      defaultValue: "",
      required: false,
      inputType: "text",
      width: 450,
      height: 200,
      ...config,
    };

    // Store config statically so createDialogContent can access it
    PromptDialog.currentPromptConfig = defaultConfig;

    super(defaultConfig, events);
    this.promptConfig = defaultConfig;
    this.setupInputValidation();
  }

  protected createDialogContent(): string {
    const config = PromptDialog.currentPromptConfig ||
      this.promptConfig || {
        message: "Please enter a value:",
        inputType: "text" as const,
        placeholder: "",
        defaultValue: "",
      };

    return `
            <div class="prompt-dialog-content">
                <div class="prompt-message">${config.message || ""}</div>
                <div class="prompt-input-group">
                    <input
                        type="${config.inputType || "text"}"
                        class="prompt-input"
                        placeholder="${config.placeholder || ""}"
                        value="${config.defaultValue || ""}"
                        ${config.required ? "required" : ""}
                        ${
                          config.minLength
                            ? `minlength="${config.minLength}"`
                            : ""
                        }
                        ${
                          config.maxLength
                            ? `maxlength="${config.maxLength}"`
                            : ""
                        }
                    />
                    <div class="prompt-error" style="display: none;"></div>
                </div>
            </div>
        `;
  }

  protected setupDialogStyling(): void {
    super.setupDialogStyling();

    // Style the message
    setTimeout(() => {
      this.messageElement = this.element.querySelector(
        ".prompt-message",
      ) as HTMLElement;
      if (this.messageElement) {
        this.messageElement.style.cssText = `
                    margin-bottom: 16px;
                    color: var(--text-primary, #E5E9F0);
                    font-size: 14px;
                    line-height: 1.5;
                `;
      }

      // Style the input
      this.inputElement = this.element.querySelector(
        ".prompt-input",
      ) as HTMLInputElement;
      if (this.inputElement) {
        this.inputElement.style.cssText = `
                    width: 100%;
                    padding: 10px 12px;
                    border: 1px solid var(--border-color, #2A3441);
                    border-radius: 4px;
                    background: var(--bg-primary, #0F1419);
                    color: var(--text-primary, #E5E9F0);
                    font-size: 14px;
                    transition: border-color 0.2s ease;
                    outline: none;
                `;

        // Focus and blur styling
        this.inputElement.addEventListener("focus", () => {
          this.inputElement.style.borderColor =
            "var(--accent-primary, #4A9EFF)";
          this.inputElement.style.boxShadow =
            "0 0 0 2px rgba(74, 158, 255, 0.2)";
        });

        this.inputElement.addEventListener("blur", () => {
          this.inputElement.style.borderColor = "var(--border-color, #2A3441)";
          this.inputElement.style.boxShadow = "none";
        });
      }

      // Style the error message
      this.errorElement = this.element.querySelector(
        ".prompt-error",
      ) as HTMLElement;
      if (this.errorElement) {
        this.errorElement.style.cssText = `
                    margin-top: 8px;
                    color: var(--accent-error, #F85149);
                    font-size: 12px;
                    line-height: 1.4;
                `;
      }
    }, 0);
  }

  private setupInputValidation(): void {
    setTimeout(() => {
      if (!this.inputElement) return;

      // Real-time validation on input
      this.inputElement.addEventListener("input", () => {
        this.validateInput();
        this.updatePrimaryButton();
      });

      // Enter key to confirm
      this.inputElement.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && this.validate()) {
          this.handleConfirm(this.inputElement.value);
        }
      });
    }, 0);
  }

  protected validateInput(): boolean {
    if (!this.inputElement) return true;

    const value = this.inputElement.value;
    let isValid = true;
    let errorMessage = "";

    // Required validation
    if (this.promptConfig.required && !value.trim()) {
      isValid = false;
      errorMessage = "This field is required";
    }

    // Length validation
    if (
      isValid &&
      this.promptConfig.minLength &&
      value.length < this.promptConfig.minLength
    ) {
      isValid = false;
      errorMessage = `Minimum length is ${this.promptConfig.minLength} characters`;
    }

    if (
      isValid &&
      this.promptConfig.maxLength &&
      value.length > this.promptConfig.maxLength
    ) {
      isValid = false;
      errorMessage = `Maximum length is ${this.promptConfig.maxLength} characters`;
    }

    // Pattern validation
    if (
      isValid &&
      this.promptConfig.pattern &&
      !this.promptConfig.pattern.test(value)
    ) {
      isValid = false;
      errorMessage = this.promptConfig.validationMessage || "Invalid format";
    }

    // Show/hide error
    this.showValidationError(isValid ? "" : errorMessage);

    return isValid;
  }

  protected showValidationError(message: string): void {
    if (!this.errorElement) return;

    if (message) {
      this.errorElement.textContent = message;
      this.errorElement.style.display = "block";
      this.inputElement.style.borderColor = "var(--accent-error, #F85149)";
    } else {
      this.errorElement.style.display = "none";
      this.inputElement.style.borderColor = "var(--border-color, #2A3441)";
    }
  }

  protected updatePrimaryButton(): void {
    const primaryBtn = this.element.querySelector(
      ".primary-btn",
    ) as HTMLButtonElement;
    if (primaryBtn) {
      primaryBtn.disabled = !this.validate();
      primaryBtn.style.opacity = primaryBtn.disabled ? "0.5" : "1";
    }
  }

  public validate(): boolean {
    return this.validateInput();
  }

  public getResult(): DialogResult<string> {
    const value = this.inputElement?.value || "";
    return {
      confirmed: true,
      value: value,
    };
  }

  protected handleConfirm(value?: string): void {
    if (this.validate()) {
      super.handleConfirm(value || this.inputElement.value);
    }
  }

  public getValue(): string {
    return this.inputElement?.value || "";
  }

  public setValue(value: string): void {
    if (this.inputElement) {
      this.inputElement.value = value;
      this.validateInput();
      this.updatePrimaryButton();
    }
  }

  public focus(): void {
    if (this.inputElement) {
      this.inputElement.focus();
      this.inputElement.select();
    }
  }
}
