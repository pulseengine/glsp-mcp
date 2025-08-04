/**
 * Interface Connection Dialog
 * Shows compatible interfaces when user clicks on an interface to link
 */

import { BaseDialog } from "../base/BaseDialog.js";
import {
  WitInterface,
  InterfaceCompatibility,
} from "../../../diagrams/interface-compatibility.js";

export interface InterfaceConnectionOption {
  componentId: string;
  componentName: string;
  interface: WitInterface;
  compatibility: InterfaceCompatibility;
}

export interface InterfaceConnectionDialogConfig {
  sourceComponentId: string;
  sourceComponentName: string;
  sourceInterface: WitInterface;
  availableInterfaces: InterfaceConnectionOption[];
  position?: { x: number; y: number }; // Position near the clicked interface
}

export class InterfaceConnectionDialog extends BaseDialog {
  private interfaceConfig: InterfaceConnectionDialogConfig;
  private selectedOption?: InterfaceConnectionOption;
  private _onConnectionCreate?: (option: InterfaceConnectionOption) => void; // TODO: Implement connection creation

  constructor(config: InterfaceConnectionDialogConfig) {
    super({
      title: `Connect "${config.sourceInterface.name}" Interface`,
      width: 500,
      height: 400,
      closable: true,
      modal: true,
    });
    this.interfaceConfig = config;
  }

  public onConnection(
    callback: (option: InterfaceConnectionOption) => void,
  ): void {
    this._onConnectionCreate = callback;
  }

  protected createDialogContent(): string {
    const interfaceTypeColor =
      this.interfaceConfig.sourceInterface.interface_type === "export"
        ? "#28a745"
        : "#007acc";
    const interfaceIcon =
      this.interfaceConfig.sourceInterface.interface_type === "export"
        ? "🟢"
        : "🔵";

    const availableInterfacesHtml =
      this.interfaceConfig.availableInterfaces.length === 0
        ? '<div style="text-align: center; color: var(--text-secondary, #666); padding: 40px;">No compatible interfaces found</div>'
        : this.interfaceConfig.availableInterfaces
            .map((option, index) => {
              const compatibilityColor =
                option.compatibility.score >= 80
                  ? "#28a745"
                  : option.compatibility.score >= 60
                    ? "#ffc107"
                    : "#dc3545";
              const compatibilityIcon =
                option.compatibility.score >= 80
                  ? "✅"
                  : option.compatibility.score >= 60
                    ? "⚠️"
                    : "❌";

              const issuesHtml =
                option.compatibility.issues.length > 0
                  ? `<div style="font-size: 11px; color: #dc3545; margin-top: 4px;">
                         ${option.compatibility.issues
                           .map((issue) => `• ${issue}`)
                           .join("<br>")}
                       </div>`
                  : "";

              return `
                <div class="connection-option" data-index="${index}" style="
                    border: 2px solid var(--border, #ddd);
                    border-radius: 8px;
                    padding: 12px;
                    cursor: pointer;
                    transition: all 0.2s ease;
                    background: var(--bg-primary, #fff);
                ">
                    <div style="font-weight: 600; color: var(--text-primary, #333);">
                        ${option.interface.name}
                        <span style="float: right; color: ${compatibilityColor}; font-size: 14px;">
                            ${compatibilityIcon} ${option.compatibility.score}%
                        </span>
                    </div>
                    <div style="font-size: 14px; color: var(--text-secondary, #666);">
                        ${option.interface.interface_type.toUpperCase()} from "${
                          option.componentName
                        }"
                    </div>
                    <div style="font-size: 12px; color: var(--text-secondary, #666); margin-top: 4px;">
                        ${
                          option.interface.functions?.length || 0
                        } function(s) • ${
                          option.compatibility.matchedFunctions
                        }/${option.compatibility.totalFunctions} matching
                    </div>
                    ${issuesHtml}
                </div>`;
            })
            .join("");

    return `
            <div class="interface-connection-dialog" style="
                display: flex;
                flex-direction: column;
                height: 100%;
                gap: 16px;
                padding: 20px;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            ">
                <!-- Source interface info -->
                <div class="source-info" style="
                    background: var(--bg-secondary, #f8f9fa);
                    padding: 16px;
                    border-radius: 8px;
                    border-left: 4px solid var(--primary-color, #007acc);
                ">
                    <h3 style="margin: 0 0 8px 0; font-size: 16px; color: var(--text-primary, #333);">
                        ${interfaceIcon} Source Interface
                    </h3>
                    <div style="font-weight: 600; color: ${interfaceTypeColor};">
                        ${this.interfaceConfig.sourceInterface.name}
                    </div>
                    <div style="font-size: 14px; color: var(--text-secondary, #666); margin-top: 4px;">
                        ${this.interfaceConfig.sourceInterface.interface_type.toUpperCase()} from "${
                          this.interfaceConfig.sourceComponentName
                        }"
                    </div>
                    <div style="font-size: 12px; color: var(--text-secondary, #666); margin-top: 8px;">
                        ${
                          this.interfaceConfig.sourceInterface.functions
                            ?.length || 0
                        } function(s) available
                    </div>
                </div>

                <!-- Available connections -->
                <div class="connections-list" style="
                    flex: 1;
                    display: flex;
                    flex-direction: column;
                    gap: 8px;
                    min-height: 200px;
                ">
                    <h3 style="margin: 0 0 12px 0; font-size: 16px; color: var(--text-primary, #333);">
                        Compatible Interfaces
                    </h3>
                    ${availableInterfacesHtml}
                </div>
            </div>
        `;
  }

  public getResult(): {
    confirmed: boolean;
    value?: InterfaceConnectionOption;
  } {
    return {
      confirmed: !!this.selectedOption,
      value: this.selectedOption,
    };
  }

  public validate(): boolean {
    return !!this.selectedOption;
  }

  protected setupEventListeners(): void {
    // Add click listeners for connection options after the dialog is shown
    setTimeout(() => {
      const options = this.element.querySelectorAll(".connection-option");
      options.forEach((option, index) => {
        option.addEventListener("click", () => {
          // Remove previous selection
          options.forEach((opt) => {
            (opt as HTMLElement).style.border = "2px solid var(--border, #ddd)";
            (opt as HTMLElement).style.backgroundColor =
              "var(--bg-primary, #fff)";
          });

          // Highlight selected option
          (option as HTMLElement).style.border =
            "2px solid var(--primary-color, #007acc)";
          (option as HTMLElement).style.backgroundColor =
            "var(--primary-color-light, #e3f2fd)";

          // Store selection
          this.selectedOption = this.interfaceConfig.availableInterfaces[index];
        });
      });
    }, 100);
  }

  public show(): void {
    super.show();
    this.setupEventListeners();

    // Position dialog near the clicked interface if position is provided
    if (this.interfaceConfig.position) {
      setTimeout(() => {
        const dialogRect = this.element.getBoundingClientRect();
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;

        let x = this.interfaceConfig.position!.x + 20;
        let y = this.interfaceConfig.position!.y;

        // Ensure dialog stays in viewport
        if (x + dialogRect.width > viewportWidth) {
          x = this.interfaceConfig.position!.x - dialogRect.width - 20;
        }
        if (y < 0) {
          y = 10;
        }
        if (y + dialogRect.height > viewportHeight) {
          y = viewportHeight - dialogRect.height - 10;
        }

        this.element.style.left = x + "px";
        this.element.style.top = y + "px";
        this.element.style.position = "fixed";
        this.element.style.transform = "none"; // Override centering
      }, 100);
    }
  }
}
