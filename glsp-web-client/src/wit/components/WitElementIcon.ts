/**
 * WIT Element Icon Component
 * Displays icons for WebAssembly Interface Types elements with tooltips
 */

import {
  WIT_ICONS,
  WIT_VISUAL_STYLES,
} from "../../diagrams/wit-interface-types.js";

export interface WitElementIconOptions {
  type: keyof typeof WIT_ICONS;
  size?: "small" | "medium" | "large";
  showTooltip?: boolean;
  showLabel?: boolean;
  label?: string;
  interactive?: boolean;
  className?: string;
}

export class WitElementIcon {
  private element: HTMLElement;
  private options: Required<WitElementIconOptions>;
  private tooltip?: HTMLElement;

  constructor(options: WitElementIconOptions) {
    this.options = {
      size: "medium",
      showTooltip: true,
      showLabel: false,
      label: this.formatTypeLabel(options.type),
      interactive: false,
      className: "",
      ...options,
    };

    this.element = this.createElement();
    this.setupEventListeners();
  }

  public getElement(): HTMLElement {
    return this.element;
  }

  public updateIcon(type: keyof typeof WIT_ICONS): void {
    this.options.type = type;
    this.options.label = this.formatTypeLabel(type);
    this.updateDisplay();
  }

  public setSize(size: "small" | "medium" | "large"): void {
    this.options.size = size;
    this.updateDisplay();
  }

  public setInteractive(interactive: boolean): void {
    this.options.interactive = interactive;
    this.updateInteractivity();
  }

  public destroy(): void {
    if (this.tooltip) {
      this.tooltip.remove();
    }
    this.element.remove();
  }

  private createElement(): HTMLElement {
    const container = document.createElement("div");
    container.className = `wit-element-icon ${this.options.size} ${this.options.className}`;

    if (this.options.interactive) {
      container.classList.add("interactive");
    }

    // Icon element
    const iconElement = document.createElement("span");
    iconElement.className = "wit-icon";
    iconElement.textContent = WIT_ICONS[this.options.type];
    container.appendChild(iconElement);

    // Label element (optional)
    if (this.options.showLabel) {
      const labelElement = document.createElement("span");
      labelElement.className = "wit-label";
      labelElement.textContent = this.options.label;
      container.appendChild(labelElement);
    }

    this.applyStyles(container);
    return container;
  }

  private applyStyles(container: HTMLElement): void {
    const visualStyle = WIT_VISUAL_STYLES[this.options.type];

    const sizes = {
      small: { icon: "14px", padding: "4px", gap: "4px" },
      medium: { icon: "18px", padding: "6px", gap: "6px" },
      large: { icon: "24px", padding: "8px", gap: "8px" },
    };

    const size = sizes[this.options.size];

    container.style.cssText = `
            display: inline-flex;
            align-items: center;
            gap: ${size.gap};
            padding: ${size.padding};
            border-radius: 4px;
            background: ${visualStyle.backgroundColor};
            border: 1px solid ${visualStyle.borderColor};
            color: ${visualStyle.textColor};
            font-size: ${size.icon};
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            transition: all 0.2s ease;
            cursor: ${this.options.interactive ? "pointer" : "default"};
            user-select: none;
        `;

    // Interactive states
    if (this.options.interactive) {
      container.addEventListener("mouseenter", () => {
        container.style.backgroundColor = this.lightenColor(
          visualStyle.backgroundColor,
          0.1,
        );
        container.style.borderColor =
          visualStyle.accentColor || visualStyle.borderColor;
        container.style.transform = "translateY(-1px)";
        container.style.boxShadow = "0 2px 8px rgba(0, 0, 0, 0.15)";
      });

      container.addEventListener("mouseleave", () => {
        container.style.backgroundColor = visualStyle.backgroundColor;
        container.style.borderColor = visualStyle.borderColor;
        container.style.transform = "translateY(0)";
        container.style.boxShadow = "none";
      });
    }

    // Style icon
    const iconElement = container.querySelector(".wit-icon") as HTMLElement;
    if (iconElement) {
      iconElement.style.cssText = `
                font-size: ${size.icon};
                line-height: 1;
                display: inline-block;
            `;
    }

    // Style label
    const labelElement = container.querySelector(".wit-label") as HTMLElement;
    if (labelElement) {
      labelElement.style.cssText = `
                font-size: calc(${size.icon} * 0.75);
                font-weight: 500;
                color: ${visualStyle.textColor};
                opacity: 0.9;
                white-space: nowrap;
            `;
    }
  }

  private setupEventListeners(): void {
    if (this.options.showTooltip) {
      this.element.addEventListener("mouseenter", this.showTooltip.bind(this));
      this.element.addEventListener("mouseleave", this.hideTooltip.bind(this));
    }

    if (this.options.interactive) {
      this.element.addEventListener("click", this.handleClick.bind(this));
      this.element.addEventListener("keydown", this.handleKeydown.bind(this));
      this.element.setAttribute("tabindex", "0");
      this.element.setAttribute("role", "button");
    }
  }

  private showTooltip(): void {
    if (this.tooltip) {
      this.hideTooltip();
    }

    this.tooltip = document.createElement("div");
    this.tooltip.className = "wit-element-tooltip";
    this.tooltip.innerHTML = `
            <div class="tooltip-header">
                <span class="tooltip-icon">${
                  WIT_ICONS[this.options.type]
                }</span>
                <span class="tooltip-title">${this.options.label}</span>
            </div>
            <div class="tooltip-description">
                ${this.getTypeDescription(this.options.type)}
            </div>
        `;

    this.styleTooltip();
    this.positionTooltip();

    document.body.appendChild(this.tooltip);

    // Animate in
    requestAnimationFrame(() => {
      if (this.tooltip) {
        this.tooltip.style.opacity = "1";
        this.tooltip.style.transform = "translateY(0) scale(1)";
      }
    });
  }

  private hideTooltip(): void {
    if (this.tooltip) {
      this.tooltip.style.opacity = "0";
      this.tooltip.style.transform = "translateY(-8px) scale(0.95)";

      setTimeout(() => {
        if (this.tooltip) {
          this.tooltip.remove();
          this.tooltip = undefined;
        }
      }, 150);
    }
  }

  private styleTooltip(): void {
    if (!this.tooltip) return;

    this.tooltip.style.cssText = `
            position: fixed;
            background: var(--bg-primary, #0D1117);
            border: 1px solid var(--border-color, #2A3441);
            border-radius: 6px;
            padding: 12px;
            box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
            z-index: 10000;
            max-width: 300px;
            font-size: 13px;
            opacity: 0;
            transform: translateY(-8px) scale(0.95);
            transition: all 0.15s ease;
            pointer-events: none;
        `;

    const header = this.tooltip.querySelector(".tooltip-header") as HTMLElement;
    if (header) {
      header.style.cssText = `
                display: flex;
                align-items: center;
                gap: 8px;
                margin-bottom: 8px;
                font-weight: 600;
                color: var(--text-primary, #E6EDF3);
            `;
    }

    const icon = this.tooltip.querySelector(".tooltip-icon") as HTMLElement;
    if (icon) {
      icon.style.cssText = `
                font-size: 16px;
                line-height: 1;
            `;
    }

    const description = this.tooltip.querySelector(
      ".tooltip-description",
    ) as HTMLElement;
    if (description) {
      description.style.cssText = `
                color: var(--text-secondary, #7D8590);
                line-height: 1.4;
            `;
    }
  }

  private positionTooltip(): void {
    if (!this.tooltip) return;

    const rect = this.element.getBoundingClientRect();
    const tooltipRect = this.tooltip.getBoundingClientRect();

    let left = rect.left + rect.width / 2 - tooltipRect.width / 2;
    let top = rect.bottom + 8;

    // Adjust if tooltip goes off screen
    if (left < 8) {
      left = 8;
    } else if (left + tooltipRect.width > window.innerWidth - 8) {
      left = window.innerWidth - tooltipRect.width - 8;
    }

    if (top + tooltipRect.height > window.innerHeight - 8) {
      top = rect.top - tooltipRect.height - 8;
    }

    this.tooltip.style.left = `${left}px`;
    this.tooltip.style.top = `${top}px`;
  }

  private handleClick(): void {
    this.element.dispatchEvent(
      new CustomEvent("wit-icon-click", {
        detail: { type: this.options.type, label: this.options.label },
      }),
    );
  }

  private handleKeydown(event: KeyboardEvent): void {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      this.handleClick();
    }
  }

  private updateDisplay(): void {
    const iconElement = this.element.querySelector(".wit-icon") as HTMLElement;
    const labelElement = this.element.querySelector(
      ".wit-label",
    ) as HTMLElement;

    if (iconElement) {
      iconElement.textContent = WIT_ICONS[this.options.type];
    }

    if (labelElement) {
      labelElement.textContent = this.options.label;
    }

    this.applyStyles(this.element);
  }

  private updateInteractivity(): void {
    if (this.options.interactive) {
      this.element.classList.add("interactive");
      this.element.setAttribute("tabindex", "0");
      this.element.setAttribute("role", "button");
      this.element.style.cursor = "pointer";
    } else {
      this.element.classList.remove("interactive");
      this.element.removeAttribute("tabindex");
      this.element.removeAttribute("role");
      this.element.style.cursor = "default";
    }
  }

  private formatTypeLabel(type: keyof typeof WIT_ICONS): string {
    return type.charAt(0).toUpperCase() + type.slice(1);
  }

  private getTypeDescription(type: keyof typeof WIT_ICONS): string {
    const descriptions: Record<keyof typeof WIT_ICONS, string> = {
      package: "WIT package containing worlds and interfaces",
      world: "Complete component specification with imports and exports",
      interface: "Collection of related functions and types",
      record: "Structured data type with named fields",
      variant: "Tagged union type with multiple possible values",
      enum: "Enumerated type with named values",
      flags: "Bitfield type representing a set of boolean flags",
      resource: "Opaque handle to external state or resources",
      function: "Callable function with parameters and return values",
      import: "External dependency required by this component",
      export: "Public interface provided by this component",
      primitive: "Basic data type (string, number, boolean, etc.)",
      list: "Sequence of values of the same type",
      tuple: "Fixed-size sequence of values with different types",
      option: "Optional value that may or may not be present",
      result: "Result type representing success or error states",
    };

    return descriptions[type] || "WIT element type";
  }

  private lightenColor(color: string, amount: number): string {
    // Simple color lightening for hover effects
    // This is a basic implementation - could be enhanced with proper color parsing
    if (color.startsWith("var(")) {
      return color; // Return as-is for CSS variables
    }

    if (color.startsWith("#")) {
      const num = parseInt(color.slice(1), 16);
      const r = Math.min(255, Math.floor((num >> 16) + amount * 255));
      const g = Math.min(255, Math.floor(((num >> 8) & 0x00ff) + amount * 255));
      const b = Math.min(255, Math.floor((num & 0x0000ff) + amount * 255));
      return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
    }

    return color;
  }

  // Static utility methods
  public static createIcon(
    type: keyof typeof WIT_ICONS,
    options?: Partial<WitElementIconOptions>,
  ): WitElementIcon {
    return new WitElementIcon({ type, ...options });
  }

  public static getAvailableTypes(): Array<keyof typeof WIT_ICONS> {
    return Object.keys(WIT_ICONS) as Array<keyof typeof WIT_ICONS>;
  }

  public static getTypeIcon(type: keyof typeof WIT_ICONS): string {
    return WIT_ICONS[type] || "❓";
  }
}
