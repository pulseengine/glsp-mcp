/**
 * WIT Icon Legend Component
 * Displays a legend of all WIT element types with their icons and descriptions
 */

import { WIT_ICONS } from "../../diagrams/wit-interface-types.js";
import { WitElementIcon } from "./WitElementIcon.js";

export interface WitIconLegendOptions {
  title?: string;
  collapsible?: boolean;
  collapsed?: boolean;
  showDescriptions?: boolean;
  filterEnabled?: boolean;
  position?: "fixed" | "relative";
  className?: string;
}

export interface LegendGroup {
  title: string;
  types: Array<keyof typeof WIT_ICONS>;
  description?: string;
}

export class WitIconLegend {
  private container: HTMLElement;
  private options: Required<WitIconLegendOptions>;
  private isCollapsed: boolean;
  private filterInput?: HTMLInputElement;
  private legendItems: Map<keyof typeof WIT_ICONS, HTMLElement> = new Map();
  private icons: Map<keyof typeof WIT_ICONS, WitElementIcon> = new Map();

  private static readonly LEGEND_GROUPS: LegendGroup[] = [
    {
      title: "Structure",
      types: ["package", "world", "interface"],
      description: "High-level organizational elements",
    },
    {
      title: "Data Types",
      types: ["record", "variant", "enum", "flags", "primitive"],
      description: "Data structure definitions",
    },
    {
      title: "Container Types",
      types: ["list", "tuple", "option", "result"],
      description: "Generic container and wrapper types",
    },
    {
      title: "Functions & Resources",
      types: ["function", "resource"],
      description: "Callable functions and managed resources",
    },
    {
      title: "Interface Elements",
      types: ["import", "export"],
      description: "Component interface definitions",
    },
  ];

  constructor(options: WitIconLegendOptions = {}) {
    this.options = {
      title: "WIT Element Types",
      collapsible: true,
      collapsed: false,
      showDescriptions: true,
      filterEnabled: true,
      position: "relative",
      className: "",
      ...options,
    };

    this.isCollapsed = this.options.collapsed;
    this.container = this.createElement();
    this.setupEventListeners();
  }

  public getElement(): HTMLElement {
    return this.container;
  }

  public toggle(): void {
    this.isCollapsed = !this.isCollapsed;
    this.updateCollapsedState();
  }

  public expand(): void {
    this.isCollapsed = false;
    this.updateCollapsedState();
  }

  public collapse(): void {
    this.isCollapsed = true;
    this.updateCollapsedState();
  }

  public filterByText(query: string): void {
    const lowerQuery = query.toLowerCase();

    this.legendItems.forEach((element, type) => {
      const typeLabel = type.toLowerCase();
      const description = this.getTypeDescription(type).toLowerCase();
      const matches =
        typeLabel.includes(lowerQuery) || description.includes(lowerQuery);

      element.style.display = matches ? "flex" : "none";
    });

    // Show/hide group headers based on visible items
    this.updateGroupVisibility();
  }

  public highlightType(type: keyof typeof WIT_ICONS | null): void {
    this.legendItems.forEach((element, itemType) => {
      if (type && itemType === type) {
        element.classList.add("highlighted");
        element.scrollIntoView({ behavior: "smooth", block: "nearest" });
      } else {
        element.classList.remove("highlighted");
      }
    });
  }

  public getUsageStats(): Record<keyof typeof WIT_ICONS, number> {
    // This would be populated by external usage tracking
    // For now, return empty stats
    const stats: Partial<Record<keyof typeof WIT_ICONS, number>> = {};
    Object.keys(WIT_ICONS).forEach((type) => {
      stats[type as keyof typeof WIT_ICONS] = 0;
    });
    return stats as Record<keyof typeof WIT_ICONS, number>;
  }

  public destroy(): void {
    this.icons.forEach((icon) => icon.destroy());
    this.container.remove();
  }

  private createElement(): HTMLElement {
    const container = document.createElement("div");
    container.className = `wit-icon-legend ${this.options.className}`;

    // Header
    const header = this.createHeader();
    container.appendChild(header);

    // Filter (if enabled)
    if (this.options.filterEnabled) {
      const filterContainer = this.createFilter();
      container.appendChild(filterContainer);
    }

    // Legend content
    const content = this.createContent();
    container.appendChild(content);

    this.applyStyles(container);
    return container;
  }

  private createHeader(): HTMLElement {
    const header = document.createElement("div");
    header.className = "legend-header";

    const title = document.createElement("h3");
    title.className = "legend-title";
    title.textContent = this.options.title;
    header.appendChild(title);

    if (this.options.collapsible) {
      const toggleButton = document.createElement("button");
      toggleButton.className = "legend-toggle";
      toggleButton.setAttribute("aria-label", "Toggle legend");
      toggleButton.innerHTML = this.isCollapsed ? "▶" : "▼";
      toggleButton.addEventListener("click", () => this.toggle());
      header.appendChild(toggleButton);
    }

    // Style header
    header.style.cssText = `
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 12px 16px;
            border-bottom: 1px solid var(--border-color, #2A3441);
            background: var(--bg-secondary, #151B2C);
        `;

    title.style.cssText = `
            margin: 0;
            font-size: 14px;
            font-weight: 600;
            color: var(--text-primary, #E6EDF3);
        `;

    if (this.options.collapsible) {
      const toggleButton = header.querySelector(
        ".legend-toggle",
      ) as HTMLElement;
      toggleButton.style.cssText = `
                background: none;
                border: none;
                color: var(--text-secondary, #7D8590);
                cursor: pointer;
                font-size: 12px;
                padding: 4px;
                border-radius: 3px;
                transition: all 0.2s ease;
            `;
    }

    return header;
  }

  private createFilter(): HTMLElement {
    const filterContainer = document.createElement("div");
    filterContainer.className = "legend-filter";

    this.filterInput = document.createElement("input");
    this.filterInput.type = "text";
    this.filterInput.placeholder = "Filter element types...";
    this.filterInput.className = "filter-input";

    this.filterInput.addEventListener("input", (e) => {
      const target = e.target as HTMLInputElement;
      this.filterByText(target.value);
    });

    filterContainer.appendChild(this.filterInput);

    // Style filter
    filterContainer.style.cssText = `
            padding: 12px 16px;
            border-bottom: 1px solid var(--border-color, #2A3441);
            background: var(--bg-tertiary, #1A202C);
        `;

    this.filterInput.style.cssText = `
            width: 100%;
            padding: 8px 12px;
            border: 1px solid var(--border-color, #2A3441);
            border-radius: 4px;
            background: var(--bg-primary, #0D1117);
            color: var(--text-primary, #E6EDF3);
            font-size: 13px;
            outline: none;
            transition: border-color 0.2s ease;
        `;

    return filterContainer;
  }

  private createContent(): HTMLElement {
    const content = document.createElement("div");
    content.className = "legend-content";

    WitIconLegend.LEGEND_GROUPS.forEach((group) => {
      const groupElement = this.createGroup(group);
      content.appendChild(groupElement);
    });

    // Style content
    content.style.cssText = `
            max-height: ${this.isCollapsed ? "0" : "400px"};
            overflow-y: auto;
            transition: max-height 0.3s ease;
        `;

    return content;
  }

  private createGroup(group: LegendGroup): HTMLElement {
    const groupElement = document.createElement("div");
    groupElement.className = "legend-group";

    // Group header
    const groupHeader = document.createElement("div");
    groupHeader.className = "group-header";
    groupHeader.innerHTML = `
            <div class="group-title">${group.title}</div>
            ${
              group.description && this.options.showDescriptions
                ? `<div class="group-description">${group.description}</div>`
                : ""
            }
        `;
    groupElement.appendChild(groupHeader);

    // Group items
    const groupItems = document.createElement("div");
    groupItems.className = "group-items";

    group.types.forEach((type) => {
      const itemElement = this.createLegendItem(type);
      groupItems.appendChild(itemElement);
      this.legendItems.set(type, itemElement);
    });

    groupElement.appendChild(groupItems);

    // Style group
    groupElement.style.cssText = `
            border-bottom: 1px solid var(--border-color, #2A3441);
        `;

    groupHeader.style.cssText = `
            padding: 12px 16px 8px 16px;
            background: var(--bg-secondary, #151B2C);
        `;

    const groupTitle = groupHeader.querySelector(".group-title") as HTMLElement;
    if (groupTitle) {
      groupTitle.style.cssText = `
                font-size: 12px;
                font-weight: 600;
                color: var(--text-secondary, #7D8590);
                text-transform: uppercase;
                letter-spacing: 0.5px;
                margin-bottom: 4px;
            `;
    }

    const groupDescription = groupHeader.querySelector(
      ".group-description",
    ) as HTMLElement;
    if (groupDescription) {
      groupDescription.style.cssText = `
                font-size: 11px;
                color: var(--text-tertiary, #6B7280);
                font-style: italic;
            `;
    }

    groupItems.style.cssText = `
            padding: 0 16px 12px 16px;
        `;

    return groupElement;
  }

  private createLegendItem(type: keyof typeof WIT_ICONS): HTMLElement {
    const itemElement = document.createElement("div");
    itemElement.className = "legend-item";

    // Create icon
    const icon = WitElementIcon.createIcon(type, {
      size: "small",
      showTooltip: false,
      showLabel: false,
      interactive: true,
    });

    this.icons.set(type, icon);

    // Create label and description
    const infoElement = document.createElement("div");
    infoElement.className = "item-info";

    const labelElement = document.createElement("div");
    labelElement.className = "item-label";
    labelElement.textContent = this.formatTypeLabel(type);
    infoElement.appendChild(labelElement);

    if (this.options.showDescriptions) {
      const descElement = document.createElement("div");
      descElement.className = "item-description";
      descElement.textContent = this.getTypeDescription(type);
      infoElement.appendChild(descElement);
    }

    itemElement.appendChild(icon.getElement());
    itemElement.appendChild(infoElement);

    // Add click handler
    itemElement.addEventListener("click", () => {
      this.highlightType(type);
      itemElement.dispatchEvent(
        new CustomEvent("legend-item-click", {
          detail: { type, label: this.formatTypeLabel(type) },
          bubbles: true,
        }),
      );
    });

    // Style item
    itemElement.style.cssText = `
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 8px 0;
            cursor: pointer;
            border-radius: 4px;
            transition: all 0.2s ease;
        `;

    infoElement.style.cssText = `
            flex: 1;
            min-width: 0;
        `;

    labelElement.style.cssText = `
            font-size: 13px;
            font-weight: 500;
            color: var(--text-primary, #E6EDF3);
            margin-bottom: 2px;
        `;

    if (this.options.showDescriptions) {
      const descElement = infoElement.querySelector(
        ".item-description",
      ) as HTMLElement;
      if (descElement) {
        descElement.style.cssText = `
                    font-size: 11px;
                    color: var(--text-secondary, #7D8590);
                    line-height: 1.3;
                `;
      }
    }

    // Hover effects
    itemElement.addEventListener("mouseenter", () => {
      itemElement.style.backgroundColor = "var(--bg-tertiary, #1A202C)";
      itemElement.style.transform = "translateX(2px)";
    });

    itemElement.addEventListener("mouseleave", () => {
      itemElement.style.backgroundColor = "transparent";
      itemElement.style.transform = "translateX(0)";
    });

    return itemElement;
  }

  private applyStyles(container: HTMLElement): void {
    container.style.cssText = `
            ${
              this.options.position === "fixed"
                ? "position: fixed; top: 80px; right: 20px;"
                : ""
            }
            width: ${this.options.position === "fixed" ? "320px" : "100%"};
            background: var(--bg-primary, #0D1117);
            border: 1px solid var(--border-color, #2A3441);
            border-radius: 8px;
            box-shadow: ${
              this.options.position === "fixed"
                ? "0 8px 24px rgba(0, 0, 0, 0.3)"
                : "none"
            };
            overflow: hidden;
            z-index: ${this.options.position === "fixed" ? "1000" : "auto"};
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        `;
  }

  private setupEventListeners(): void {
    // Setup filter input focus/blur styles
    if (this.filterInput) {
      this.filterInput.addEventListener("focus", () => {
        this.filterInput!.style.borderColor = "var(--accent-color, #654FF0)";
        this.filterInput!.style.boxShadow = "0 0 0 2px rgba(101, 79, 240, 0.1)";
      });

      this.filterInput.addEventListener("blur", () => {
        this.filterInput!.style.borderColor = "var(--border-color, #2A3441)";
        this.filterInput!.style.boxShadow = "none";
      });
    }

    // Setup toggle button hover effects
    const toggleButton = this.container.querySelector(
      ".legend-toggle",
    ) as HTMLElement;
    if (toggleButton) {
      toggleButton.addEventListener("mouseenter", () => {
        toggleButton.style.backgroundColor = "var(--bg-tertiary, #1A202C)";
        toggleButton.style.color = "var(--text-primary, #E6EDF3)";
      });

      toggleButton.addEventListener("mouseleave", () => {
        toggleButton.style.backgroundColor = "transparent";
        toggleButton.style.color = "var(--text-secondary, #7D8590)";
      });
    }
  }

  private updateCollapsedState(): void {
    const content = this.container.querySelector(
      ".legend-content",
    ) as HTMLElement;
    const toggleButton = this.container.querySelector(
      ".legend-toggle",
    ) as HTMLElement;

    if (content) {
      content.style.maxHeight = this.isCollapsed ? "0" : "400px";
    }

    if (toggleButton) {
      toggleButton.innerHTML = this.isCollapsed ? "▶" : "▼";
      toggleButton.setAttribute(
        "aria-expanded",
        (!this.isCollapsed).toString(),
      );
    }
  }

  private updateGroupVisibility(): void {
    const groups = this.container.querySelectorAll(".legend-group");

    groups.forEach((group) => {
      const groupItems = group.querySelector(".group-items");
      const visibleItems =
        groupItems?.querySelectorAll(
          '.legend-item:not([style*="display: none"])',
        ).length || 0;

      if (visibleItems === 0) {
        (group as HTMLElement).style.display = "none";
      } else {
        (group as HTMLElement).style.display = "block";
      }
    });
  }

  private formatTypeLabel(type: keyof typeof WIT_ICONS): string {
    return type.charAt(0).toUpperCase() + type.slice(1);
  }

  private getTypeDescription(type: keyof typeof WIT_ICONS): string {
    const descriptions: Record<keyof typeof WIT_ICONS, string> = {
      package: "Container for worlds and interfaces",
      world: "Complete component specification",
      interface: "Collection of functions and types",
      record: "Structured data with named fields",
      variant: "Tagged union with multiple values",
      enum: "Enumerated type with named options",
      flags: "Bitfield representing boolean flags",
      resource: "Handle to external state",
      function: "Callable with params and return",
      import: "External dependency",
      export: "Public interface provided",
      primitive: "Basic data type",
      list: "Sequence of same type",
      tuple: "Fixed sequence of different types",
      option: "Optional value",
      result: "Success or error state",
    };

    return descriptions[type] || "WIT element";
  }

  // Static factory methods
  public static createFloatingLegend(
    options?: WitIconLegendOptions,
  ): WitIconLegend {
    return new WitIconLegend({ position: "fixed", ...options });
  }

  public static createEmbeddedLegend(
    options?: WitIconLegendOptions,
  ): WitIconLegend {
    return new WitIconLegend({ position: "relative", ...options });
  }

  public static createCompactLegend(
    options?: WitIconLegendOptions,
  ): WitIconLegend {
    return new WitIconLegend({
      showDescriptions: false,
      filterEnabled: false,
      collapsible: false,
      ...options,
    });
  }
}
