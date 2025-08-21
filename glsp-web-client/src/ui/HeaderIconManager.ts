import { TooltipManager } from "./TooltipManager.js";

export interface HeaderIcon {
  id: string;
  title: string;
  icon: string;
  color?: string;
  onClick: () => void;
  onClose?: () => void;
  priority?: number; // 1 = high (always visible), 2 = medium, 3 = low (first to overflow)
  tooltip?: {
    content: string;
    position?: "top" | "bottom" | "left" | "right" | "auto";
    delay?: number;
    hideDelay?: number;
    theme?: "dark" | "light" | "info" | "warning" | "error";
    interactive?: boolean;
    maxWidth?: number;
  };
  badge?: {
    count?: number;
    text?: string;
    type?: "count" | "dot" | "text";
    color?: string;
    pulse?: boolean;
  };
}

export class HeaderIconManager {
  private container: HTMLElement;
  private icons: Map<string, HeaderIcon> = new Map();
  private overflowItems: HTMLElement[] = [];
  private resizeObserver?: ResizeObserver;
  private currentBreakpoint: string = "desktop";
  private tooltipManager: TooltipManager;

  constructor() {
    this.tooltipManager = TooltipManager.getInstance();
    this.container = this.createContainer();
    this.insertIntoHeader();
    this.setupResponsiveBehavior();
  }

  private createContainer(): HTMLElement {
    const container = document.createElement("div");
    container.id = "header-icons";
    container.className = "header-icons-container";
    container.style.cssText = `
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 0 12px;
            order: 1;
        `;
    return container;
  }

  private insertIntoHeader(): void {
    const headerActions = document.querySelector(".header-actions");
    if (headerActions) {
      // Insert before the status chip
      const statusChip = headerActions.querySelector(".status-chip");
      if (statusChip) {
        headerActions.insertBefore(this.container, statusChip);
      } else {
        headerActions.appendChild(this.container);
      }
    }
  }

  public addIcon(icon: HeaderIcon): void {
    this.icons.set(icon.id, icon);
    this.renderIcon(icon);
  }

  public removeIcon(id: string): void {
    console.log("HeaderIconManager: removeIcon called for id:", id);
    console.log("HeaderIconManager: Icon exists in map:", this.icons.has(id));

    // Always remove from Map
    this.icons.delete(id);

    // Find and remove ALL DOM elements with this id (in case there are duplicates)
    const iconElements = this.container.querySelectorAll(
      `[data-icon-id="${id}"]`,
    );
    console.log("HeaderIconManager: Found DOM elements:", iconElements.length);

    iconElements.forEach((element, index) => {
      console.log(
        `HeaderIconManager: Removing DOM element ${index + 1}/${
          iconElements.length
        }`,
      );
      element.remove();
    });

    if (iconElements.length > 0) {
      console.log("HeaderIconManager: All DOM elements removed");
    } else {
      console.log("HeaderIconManager: No DOM elements found to remove");
    }
  }

  public hasIcon(id: string): boolean {
    const mapHasIcon = this.icons.has(id);
    const domHasIcon = !!this.container.querySelector(`[data-icon-id="${id}"]`);
    console.log(
      `HeaderIconManager: hasIcon(${id}) - Map: ${mapHasIcon}, DOM: ${domHasIcon}`,
    );
    return mapHasIcon || domHasIcon;
  }

  private renderIcon(icon: HeaderIcon): void {
    // Remove existing icon if it exists
    this.removeIcon(icon.id);

    const iconElement = document.createElement("div");
    iconElement.className = "header-icon";
    iconElement.dataset.iconId = icon.id;
    iconElement.style.cssText = `
            position: relative;
            padding: 8px 12px;
            background: var(--bg-tertiary);
            border: 1px solid var(--border);
            border-radius: var(--radius-sm);
            cursor: pointer;
            transition: all 0.3s ease;
            display: flex;
            align-items: center;
            gap: 6px;
            font-size: 13px;
            color: var(--text-primary);
            user-select: none;
            animation: slideInFromRight 0.4s ease;
        `;

    // Icon
    const iconSpan = document.createElement("span");
    iconSpan.textContent = icon.icon;
    iconSpan.style.cssText = `
            font-size: 16px;
            ${icon.color ? `color: ${icon.color};` : ""}
        `;
    iconElement.appendChild(iconSpan);

    // Title
    const titleSpan = document.createElement("span");
    titleSpan.className = "header-icon-text";
    titleSpan.textContent = icon.title;
    titleSpan.style.cssText = `
            font-weight: 500;
            max-width: 80px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        `;
    iconElement.appendChild(titleSpan);

    // Badge (notification badge)
    if (icon.badge) {
      const badge = this.createBadge(icon.badge);
      iconElement.appendChild(badge);
    }

    // Close button (optional)
    if (icon.onClose) {
      const closeBtn = document.createElement("button");
      closeBtn.innerHTML = "×";
      closeBtn.type = "button"; // Prevent form submission
      closeBtn.style.cssText = `
                background: none;
                border: none;
                color: var(--text-secondary);
                cursor: pointer;
                padding: 2px;
                margin-left: 4px;
                border-radius: 2px;
                font-size: 14px;
                line-height: 1;
                transition: all 0.2s ease;
                position: relative;
                z-index: 10;
                pointer-events: auto;
            `;

      // Add debugging for all events
      closeBtn.addEventListener("click", (e) => {
        console.log(
          "HeaderIconManager: Close button clicked - event details:",
          {
            target: e.target,
            currentTarget: e.currentTarget,
            timeStamp: e.timeStamp,
            isTrusted: e.isTrusted,
            bubbles: e.bubbles,
          },
        );
        e.stopPropagation();
        e.preventDefault();
        console.log("HeaderIconManager: Calling onClose handler");
        icon.onClose!();
        this.removeIcon(icon.id);
      });

      // Add debugging for other events that might trigger clicks
      closeBtn.addEventListener("focus", () => {
        console.log("HeaderIconManager: Close button received focus");
      });

      closeBtn.addEventListener("blur", () => {
        console.log("HeaderIconManager: Close button lost focus");
      });

      closeBtn.addEventListener("mousedown", (e) => {
        console.log("HeaderIconManager: Close button mousedown");
        e.stopPropagation();
      });

      closeBtn.addEventListener("mouseup", (e) => {
        console.log("HeaderIconManager: Close button mouseup");
        e.stopPropagation();
      });

      closeBtn.addEventListener("mouseenter", () => {
        closeBtn.style.background = "var(--accent-error)";
        closeBtn.style.color = "white";
      });

      closeBtn.addEventListener("mouseleave", () => {
        closeBtn.style.background = "none";
        closeBtn.style.color = "var(--text-secondary)";
      });

      iconElement.appendChild(closeBtn);
      console.log(
        "HeaderIconManager: Close button created and added to icon:",
        icon.id,
      );
    }

    // Click handler
    iconElement.addEventListener("click", (e) => {
      console.log("HeaderIconManager: Main icon clicked, target:", e.target);
      console.log("HeaderIconManager: Event currentTarget:", e.currentTarget);
      icon.onClick();
      // Add click animation
      iconElement.style.transform = "scale(0.95)";
      setTimeout(() => {
        iconElement.style.transform = "scale(1)";
      }, 150);
    });

    // Tooltip support
    if (icon.tooltip) {
      this.setupTooltip(iconElement, icon.tooltip);
    }

    // Hover effects
    iconElement.addEventListener("mouseenter", () => {
      iconElement.style.background = icon.color || "var(--accent-wasm)";
      iconElement.style.color = "white";
      iconElement.style.borderColor = icon.color || "var(--accent-wasm)";
      iconElement.style.transform = "translateY(-2px)";
      iconElement.style.boxShadow = `0 4px 12px ${
        icon.color ? icon.color + "40" : "rgba(101, 79, 240, 0.4)"
      }`;
    });

    iconElement.addEventListener("mouseleave", () => {
      iconElement.style.background = "var(--bg-tertiary)";
      iconElement.style.color = "var(--text-primary)";
      iconElement.style.borderColor = "var(--border)";
      iconElement.style.transform = "translateY(0)";
      iconElement.style.boxShadow = "none";
    });

    this.container.appendChild(iconElement);
  }

  public updateIcon(id: string, updates: Partial<HeaderIcon>): void {
    const icon = this.icons.get(id);
    if (icon) {
      const updatedIcon = { ...icon, ...updates };
      this.icons.set(id, updatedIcon);

      // Find existing DOM element
      const iconElement = this.container.querySelector(
        `[data-icon-id="${id}"]`,
      ) as HTMLElement;
      if (iconElement) {
        // Update only the visual parts without recreating the entire element
        const iconSpan = iconElement.querySelector(
          "span:first-child",
        ) as HTMLElement;
        const titleSpan = iconElement.querySelector(
          ".header-icon-text",
        ) as HTMLElement;

        if (iconSpan && updates.icon) {
          iconSpan.textContent = updates.icon;
          if (updates.color) {
            iconSpan.style.color = updates.color;
          }
        }

        if (titleSpan && updates.title) {
          titleSpan.textContent = updates.title;
        }

        // Update badge if changed
        if (updates.badge !== undefined) {
          const existingBadge = iconElement.querySelector(".header-icon-badge");
          if (existingBadge) {
            existingBadge.remove();
          }
          if (updates.badge) {
            const newBadge = this.createBadge(updates.badge);
            iconElement.appendChild(newBadge);
          }
        }

        // Update tooltip if changed
        if (updates.tooltip !== undefined) {
          // Remove existing tooltip listeners by re-setting up
          if (updates.tooltip) {
            this.setupTooltip(iconElement, updates.tooltip);
          }
        }

        // Update hover colors if color changed
        if (updates.color) {
          const __originalMouseEnter = iconElement.onmouseenter; // TODO: Store original handlers - ready for enhanced hover
          const __originalMouseLeave = iconElement.onmouseleave; // TODO: Store original handlers - ready for enhanced hover

          iconElement.onmouseenter = () => {
            iconElement.style.background =
              updates.color || "var(--accent-wasm)";
            iconElement.style.color = "white";
            iconElement.style.borderColor =
              updates.color || "var(--accent-wasm)";
            iconElement.style.transform = "translateY(-2px)";
            iconElement.style.boxShadow = `0 4px 12px ${
              updates.color ? updates.color + "40" : "rgba(101, 79, 240, 0.4)"
            }`;
          };
        }
      } else {
        // If DOM element doesn't exist, fall back to full render
        this.renderIcon(updatedIcon);
      }
    }
  }

  public getIconCount(): number {
    return this.icons.size;
  }

  public clear(): void {
    this.icons.clear();
    this.container.innerHTML = "";
  }

  public forceRemoveAllDiagramIcons(): void {
    console.log("HeaderIconManager: Force removing all diagram icons");
    // Remove from map
    this.icons.delete("current-diagram");
    // Remove all DOM elements that might be diagram icons
    const elements = this.container.querySelectorAll(
      '[data-icon-id="current-diagram"]',
    );
    console.log(
      "HeaderIconManager: Force found DOM elements:",
      elements.length,
    );
    elements.forEach((element, index) => {
      console.log(`HeaderIconManager: Force removing element ${index + 1}`);
      element.remove();
    });
  }

  private createBadge(
    badgeConfig: NonNullable<HeaderIcon["badge"]>,
  ): HTMLElement {
    const badge = document.createElement("div");
    badge.className = "header-icon-badge";

    // Base badge styles
    badge.style.cssText = `
            position: absolute;
            top: -6px;
            right: -6px;
            min-width: 18px;
            height: 18px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 10px;
            font-weight: 600;
            color: white;
            border-radius: 9px;
            z-index: 10;
            pointer-events: none;
            transition: all 0.2s ease;
        `;

    // Badge type and content
    switch (badgeConfig.type || "count") {
      case "dot":
        badge.style.cssText += `
                    width: 8px;
                    height: 8px;
                    min-width: 8px;
                    background: ${
                      badgeConfig.color || "var(--accent-error, #F85149)"
                    };
                    border-radius: 50%;
                `;
        break;

      case "text":
        badge.textContent = badgeConfig.text || "";
        badge.style.cssText += `
                    background: ${
                      badgeConfig.color || "var(--accent-info, #4A9EFF)"
                    };
                    padding: 0 6px;
                    border-radius: 10px;
                    white-space: nowrap;
                    max-width: 60px;
                    overflow: hidden;
                    text-overflow: ellipsis;
                `;
        break;

      case "count":
      default: {
        const count = badgeConfig.count || 0;
        badge.textContent = count > 99 ? "99+" : count.toString();
        badge.style.cssText += `
                    background: ${
                      badgeConfig.color || "var(--accent-error, #F85149)"
                    };
                `;
        if (count === 0) {
          badge.style.display = "none";
        }
        break;
      }
    }

    // Pulse animation
    if (badgeConfig.pulse) {
      badge.style.animation = "header-badge-pulse 2s infinite";
    }

    return badge;
  }

  private setupTooltip(
    element: HTMLElement,
    tooltipConfig: NonNullable<HeaderIcon["tooltip"]>,
  ): void {
    // Get responsive tooltip configuration
    const responsiveConfig =
      this.tooltipManager.getResponsiveTooltipConfig(tooltipConfig);

    element.addEventListener("mouseenter", () => {
      this.tooltipManager.showTooltip(element, responsiveConfig);
    });

    element.addEventListener("mouseleave", () => {
      this.tooltipManager.hideTooltip();
    });

    // Touch support for mobile devices
    element.addEventListener("touchstart", (_e) => {
      _e.preventDefault();
      this.tooltipManager.showTooltip(element, {
        ...responsiveConfig,
        delay: 0, // Show immediately on touch
      });

      // Hide after 3 seconds on touch
      setTimeout(() => {
        this.tooltipManager.hideTooltip();
      }, 3000);
    });
  }

  private setupResponsiveBehavior(): void {
    // Set up resize observer for responsive handling
    if (typeof ResizeObserver !== "undefined") {
      this.resizeObserver = new ResizeObserver(() => {
        this.handleResponsiveLayout();
      });
      this.resizeObserver.observe(
        document.querySelector(".header-actions") || document.body,
      );
    }

    // Listen for window resize as fallback
    window.addEventListener("resize", () => {
      setTimeout(() => this.handleResponsiveLayout(), 100);
    });

    // Setup overflow menu interactions
    this.setupOverflowMenu();

    // Initial layout check
    setTimeout(() => this.handleResponsiveLayout(), 100);
  }

  private setupOverflowMenu(): void {
    const overflowBtn = document.getElementById("header-overflow-btn");
    const overflowDropdown = document.getElementById(
      "header-overflow-dropdown",
    );

    if (overflowBtn && overflowDropdown) {
      overflowBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const isOpen = overflowDropdown.classList.contains("open");

        if (isOpen) {
          this.closeOverflowMenu();
        } else {
          this.openOverflowMenu();
        }
      });

      // Close overflow menu when clicking outside
      document.addEventListener("click", (e) => {
        if (
          !overflowDropdown.contains(e.target as Node) &&
          !overflowBtn.contains(e.target as Node)
        ) {
          this.closeOverflowMenu();
        }
      });

      // Handle theme control in overflow menu
      const overflowThemeControl = document.getElementById(
        "overflow-theme-control",
      );
      if (overflowThemeControl) {
        overflowThemeControl.addEventListener("click", () => {
          this.showThemeSliderPopup();
          this.closeOverflowMenu();
        });
      }
    }
  }

  private openOverflowMenu(): void {
    const dropdown = document.getElementById("header-overflow-dropdown");
    if (dropdown) {
      dropdown.classList.add("open");
      // Update overflow menu content
      this.updateOverflowMenuContent();
    }
  }

  private closeOverflowMenu(): void {
    const dropdown = document.getElementById("header-overflow-dropdown");
    if (dropdown) {
      dropdown.classList.remove("open");
    }
  }

  private updateOverflowMenuContent(): void {
    const dropdown = document.getElementById("header-overflow-dropdown");
    if (!dropdown) return;

    // Clear existing content except theme control
    const existingItems = dropdown.querySelectorAll(
      ".header-overflow-item:not(#overflow-theme-control)",
    );
    existingItems.forEach((item) => item.remove());

    // Add overflow icons
    this.overflowItems.forEach((iconData) => {
      const iconElement = iconData.cloneNode(true) as HTMLElement;
      iconElement.className = "header-overflow-item";
      iconElement.style.cssText = `
                padding: 12px 16px;
                display: flex;
                align-items: center;
                gap: 12px;
                cursor: pointer;
                transition: background-color 0.2s ease;
                border: none;
                background: transparent;
                width: 100%;
                text-align: left;
                color: var(--text-primary);
                font-size: 14px;
            `;

      // Get original icon data
      const iconId = iconData.dataset.iconId;
      const originalIcon = iconId ? this.icons.get(iconId) : null;

      if (originalIcon) {
        iconElement.addEventListener("click", () => {
          originalIcon.onClick();
          this.closeOverflowMenu();
        });

        iconElement.addEventListener("mouseenter", () => {
          iconElement.style.background = "var(--bg-tertiary)";
        });

        iconElement.addEventListener("mouseleave", () => {
          iconElement.style.background = "transparent";
        });
      }

      dropdown.appendChild(iconElement);
    });
  }

  private showThemeSliderPopup(): void {
    // Create a popup theme selector for mobile
    const popup = document.createElement("div");
    popup.className = "theme-slider-popup";
    popup.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: var(--bg-secondary);
            border: 1px solid var(--border);
            border-radius: var(--radius-lg);
            padding: 20px;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
            z-index: 10000;
            min-width: 250px;
        `;

    const title = document.createElement("h3");
    title.textContent = "Select Theme";
    title.style.cssText = `
            margin: 0 0 16px 0;
            color: var(--text-primary);
            font-size: 16px;
        `;

    const themeSlider = document
      .querySelector("#theme-slider")
      ?.cloneNode(true) as HTMLInputElement;
    if (themeSlider) {
      themeSlider.style.cssText = `
                width: 100%;
                margin: 16px 0;
            `;

      // Copy event handlers
      const originalSlider = document.querySelector(
        "#theme-slider",
      ) as HTMLInputElement;
      if (originalSlider) {
        themeSlider.addEventListener("input", () => {
          originalSlider.value = themeSlider.value;
          originalSlider.dispatchEvent(new Event("input"));
        });
      }
    }

    const closeBtn = document.createElement("button");
    closeBtn.textContent = "Close";
    closeBtn.style.cssText = `
            background: var(--accent-wasm);
            color: white;
            border: none;
            padding: 8px 16px;
            border-radius: var(--radius-sm);
            cursor: pointer;
            width: 100%;
            margin-top: 16px;
        `;

    closeBtn.addEventListener("click", () => {
      popup.remove();
    });

    popup.appendChild(title);
    if (themeSlider) {
      popup.appendChild(themeSlider);
    }
    popup.appendChild(closeBtn);

    document.body.appendChild(popup);

    // Close on backdrop click
    popup.addEventListener("click", (e) => {
      if (e.target === popup) {
        popup.remove();
      }
    });
  }

  private handleResponsiveLayout(): void {
    const windowWidth = window.innerWidth;
    let newBreakpoint = "desktop";

    if (windowWidth <= 480) {
      newBreakpoint = "mobile";
    } else if (windowWidth <= 768) {
      newBreakpoint = "tablet";
    } else if (windowWidth <= 1199) {
      newBreakpoint = "desktop-small";
    }

    if (newBreakpoint !== this.currentBreakpoint) {
      this.currentBreakpoint = newBreakpoint;
      this.updateIconsForBreakpoint();
    }

    // Check for overflow
    this.handleIconOverflow();
  }

  private updateIconsForBreakpoint(): void {
    const iconElements = this.container.querySelectorAll(
      ".header-icon",
    ) as NodeListOf<HTMLElement>;

    iconElements.forEach((iconElement) => {
      const iconId = iconElement.dataset.iconId;
      if (!iconId) return;

      const titleSpan = iconElement.querySelector(
        ".header-icon-text",
      ) as HTMLElement;

      switch (this.currentBreakpoint) {
        case "mobile":
          // Hide text on mobile, make icons compact
          if (titleSpan) titleSpan.style.display = "none";
          iconElement.style.padding = "6px";
          iconElement.style.minWidth = "32px";
          iconElement.style.height = "32px";
          break;

        case "tablet":
          // Show icons but compact text
          if (titleSpan) {
            titleSpan.style.display = "block";
            titleSpan.style.maxWidth = "60px";
          }
          iconElement.style.padding = "6px 8px";
          break;

        default:
          // Full desktop layout
          if (titleSpan) {
            titleSpan.style.display = "block";
            titleSpan.style.maxWidth = "80px";
          }
          iconElement.style.padding = "8px 12px";
          break;
      }
    });
  }

  private handleIconOverflow(): void {
    if (this.currentBreakpoint === "desktop") {
      // No overflow handling needed on desktop
      this.overflowItems = [];
      return;
    }

    const headerActions = document.querySelector(
      ".header-actions",
    ) as HTMLElement;
    if (!headerActions) return;

    const availableWidth = headerActions.offsetWidth;
    const statusChip = headerActions.querySelector(
      ".status-chip",
    ) as HTMLElement;
    const overflowMenu = headerActions.querySelector(
      ".header-overflow-menu",
    ) as HTMLElement;

    let usedWidth =
      (statusChip?.offsetWidth || 0) + (overflowMenu?.offsetWidth || 0);
    const iconElements = Array.from(
      this.container.querySelectorAll(".header-icon"),
    ) as HTMLElement[];

    // Sort icons by priority (lower number = higher priority)
    const sortedIconElements = iconElements.sort((a, b) => {
      const iconIdA = a.dataset.iconId;
      const iconIdB = b.dataset.iconId;
      const iconA = iconIdA ? this.icons.get(iconIdA) : null;
      const iconB = iconIdB ? this.icons.get(iconIdB) : null;
      const priorityA = iconA?.priority || 2;
      const priorityB = iconB?.priority || 2;
      return priorityA - priorityB;
    });

    this.overflowItems = [];

    sortedIconElements.forEach((iconElement) => {
      const iconWidth = iconElement.offsetWidth + 8; // Include gap

      if (usedWidth + iconWidth > availableWidth * 0.6) {
        // Use 60% of available width
        // Move to overflow
        iconElement.style.display = "none";
        this.overflowItems.push(iconElement);
      } else {
        // Keep visible
        iconElement.style.display = "flex";
        usedWidth += iconWidth;
      }
    });
  }
}
