export interface TooltipConfig {
  content: string;
  position?: "top" | "bottom" | "left" | "right" | "auto";
  delay?: number;
  hideDelay?: number;
  theme?: "dark" | "light" | "info" | "warning" | "error";
  interactive?: boolean;
  maxWidth?: number;
}

export interface TooltipPosition {
  x: number;
  y: number;
  position: "top" | "bottom" | "left" | "right";
}

export class TooltipManager {
  private static instance: TooltipManager;
  private activeTooltip?: HTMLElement;
  private showTimeout?: number;
  private hideTimeout?: number;
  private currentTarget?: HTMLElement;

  private constructor() {
    this.setupGlobalListeners();
  }

  public static getInstance(): TooltipManager {
    if (!TooltipManager.instance) {
      TooltipManager.instance = new TooltipManager();
    }
    return TooltipManager.instance;
  }

  private setupGlobalListeners(): void {
    // Handle window resize to reposition tooltips
    window.addEventListener("resize", () => {
      if (this.activeTooltip && this.currentTarget) {
        this.updateTooltipPosition(this.currentTarget);
      }
    });

    // Handle scroll events to hide tooltips
    window.addEventListener(
      "scroll",
      () => {
        this.hideTooltip();
      },
      { passive: true },
    );
  }

  public showTooltip(target: HTMLElement, config: TooltipConfig): void {
    // Clear any existing timeouts
    this.clearTimeouts();

    // Hide any existing tooltip
    this.hideTooltip();

    const delay = config.delay ?? 500; // Default 500ms delay

    this.showTimeout = window.setTimeout(() => {
      this.createAndShowTooltip(target, config);
    }, delay);
  }

  public hideTooltip(): void {
    this.clearTimeouts();

    if (this.activeTooltip) {
      const hideDelay = this.activeTooltip.dataset.hideDelay
        ? parseInt(this.activeTooltip.dataset.hideDelay)
        : 200;

      this.hideTimeout = window.setTimeout(() => {
        if (this.activeTooltip) {
          // Animate out
          this.activeTooltip.style.opacity = "0";
          this.activeTooltip.style.transform = "scale(0.9)";

          setTimeout(() => {
            if (this.activeTooltip) {
              this.activeTooltip.remove();
              this.activeTooltip = undefined;
              this.currentTarget = undefined;
            }
          }, 150);
        }
      }, hideDelay);
    }
  }

  public updateTooltipPosition(target: HTMLElement): void {
    if (!this.activeTooltip) return;

    const config = this.getTooltipConfig(this.activeTooltip);
    const position = this.calculateOptimalPosition(
      target,
      this.activeTooltip,
      config.position,
    );

    this.activeTooltip.style.left = `${position.x}px`;
    this.activeTooltip.style.top = `${position.y}px`;
    this.activeTooltip.dataset.position = position.position;
  }

  private createAndShowTooltip(
    target: HTMLElement,
    config: TooltipConfig,
  ): void {
    const tooltip = document.createElement("div");
    tooltip.className = this.getTooltipClasses(config);
    tooltip.textContent = config.content;
    tooltip.dataset.theme = config.theme || "dark";
    tooltip.dataset.hideDelay = (config.hideDelay ?? 200).toString();

    // Apply max width if specified
    if (config.maxWidth) {
      tooltip.style.maxWidth = `${config.maxWidth}px`;
      tooltip.style.whiteSpace = "normal";
      tooltip.style.wordWrap = "break-word";
    }

    // Add to DOM for measurement
    document.body.appendChild(tooltip);

    // Calculate optimal position
    const position = this.calculateOptimalPosition(
      target,
      tooltip,
      config.position,
    );

    // Position tooltip
    tooltip.style.left = `${position.x}px`;
    tooltip.style.top = `${position.y}px`;
    tooltip.dataset.position = position.position;

    // Show with animation
    tooltip.style.opacity = "0";
    tooltip.style.transform = "scale(0.9)";

    // Force reflow then animate in
    tooltip.offsetHeight;
    tooltip.style.opacity = "1";
    tooltip.style.transform = "scale(1)";

    this.activeTooltip = tooltip;
    this.currentTarget = target;

    // Handle interactive tooltips
    if (config.interactive) {
      this.setupInteractiveTooltip(tooltip, target);
    }
  }

  private calculateOptimalPosition(
    target: HTMLElement,
    tooltip: HTMLElement,
    preferredPosition: TooltipConfig["position"] = "auto",
  ): TooltipPosition {
    const targetRect = target.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();
    const viewport = {
      width: window.innerWidth,
      height: window.innerHeight,
    };

    const spacing = 8; // Gap between tooltip and target
    const positions = this.getAllPossiblePositions(
      targetRect,
      tooltipRect,
      spacing,
    );

    // If specific position requested and it fits, use it
    if (preferredPosition !== "auto" && preferredPosition !== undefined) {
      const requestedPos = positions[preferredPosition];
      if (this.fitsInViewport(requestedPos, tooltipRect, viewport)) {
        return { ...requestedPos, position: preferredPosition };
      }
    }

    // Find best fitting position
    const positionPriority: Array<keyof typeof positions> = [
      "bottom",
      "top",
      "right",
      "left",
    ];

    for (const pos of positionPriority) {
      const position = positions[pos];
      if (this.fitsInViewport(position, tooltipRect, viewport)) {
        return { ...position, position: pos };
      }
    }

    // Fallback to bottom position with adjustment to fit viewport
    const fallback = positions.bottom;
    return {
      x: Math.max(
        10,
        Math.min(fallback.x, viewport.width - tooltipRect.width - 10),
      ),
      y: Math.max(
        10,
        Math.min(fallback.y, viewport.height - tooltipRect.height - 10),
      ),
      position: "bottom",
    };
  }

  private getAllPossiblePositions(
    targetRect: DOMRect,
    tooltipRect: DOMRect,
    spacing: number,
  ) {
    return {
      top: {
        x: targetRect.left + (targetRect.width - tooltipRect.width) / 2,
        y: targetRect.top - tooltipRect.height - spacing,
      },
      bottom: {
        x: targetRect.left + (targetRect.width - tooltipRect.width) / 2,
        y: targetRect.bottom + spacing,
      },
      left: {
        x: targetRect.left - tooltipRect.width - spacing,
        y: targetRect.top + (targetRect.height - tooltipRect.height) / 2,
      },
      right: {
        x: targetRect.right + spacing,
        y: targetRect.top + (targetRect.height - tooltipRect.height) / 2,
      },
    };
  }

  private fitsInViewport(
    position: { x: number; y: number },
    tooltipRect: DOMRect,
    viewport: { width: number; height: number },
  ): boolean {
    const margin = 10; // Minimum distance from viewport edge

    return (
      position.x >= margin &&
      position.y >= margin &&
      position.x + tooltipRect.width <= viewport.width - margin &&
      position.y + tooltipRect.height <= viewport.height - margin
    );
  }

  private getTooltipClasses(config: TooltipConfig): string {
    const classes = ["header-tooltip"];

    if (config.theme) {
      classes.push(`header-tooltip--${config.theme}`);
    }

    if (config.interactive) {
      classes.push("header-tooltip--interactive");
    }

    return classes.join(" ");
  }

  private getTooltipConfig(tooltip: HTMLElement): TooltipConfig {
    return {
      content: tooltip.textContent || "",
      theme: (tooltip.dataset.theme as TooltipConfig["theme"]) || "dark",
      hideDelay: parseInt(tooltip.dataset.hideDelay || "200"),
      position:
        (tooltip.dataset.position as TooltipConfig["position"]) || "auto",
    };
  }

  private setupInteractiveTooltip(
    tooltip: HTMLElement,
    target: HTMLElement,
  ): void {
    // Allow tooltip to remain visible when hovering over it
    tooltip.addEventListener("mouseenter", () => {
      this.clearTimeouts();
    });

    tooltip.addEventListener("mouseleave", () => {
      this.hideTooltip();
    });

    // Also handle target hover for interactive tooltips
    target.addEventListener("mouseleave", () => {
      // Small delay to allow moving to tooltip
      setTimeout(() => {
        if (!tooltip.matches(":hover")) {
          this.hideTooltip();
        }
      }, 100);
    });
  }

  private clearTimeouts(): void {
    if (this.showTimeout) {
      clearTimeout(this.showTimeout);
      this.showTimeout = undefined;
    }

    if (this.hideTimeout) {
      clearTimeout(this.hideTimeout);
      this.hideTimeout = undefined;
    }
  }

  // Responsive helper methods
  public getCurrentBreakpoint(): "mobile" | "tablet" | "desktop" {
    const width = window.innerWidth;
    if (width <= 480) return "mobile";
    if (width <= 768) return "tablet";
    return "desktop";
  }

  public getResponsiveTooltipConfig(baseConfig: TooltipConfig): TooltipConfig {
    const breakpoint = this.getCurrentBreakpoint();

    switch (breakpoint) {
      case "mobile":
        return {
          ...baseConfig,
          delay: baseConfig.delay ? Math.min(baseConfig.delay, 300) : 300,
          maxWidth: Math.min(
            baseConfig.maxWidth || 250,
            window.innerWidth - 40,
          ),
          position: "auto", // Always auto-position on mobile
        };
      case "tablet":
        return {
          ...baseConfig,
          maxWidth: baseConfig.maxWidth || 300,
        };
      default:
        return baseConfig;
    }
  }

  // Cleanup method
  public destroy(): void {
    this.clearTimeouts();
    this.hideTooltip();
    // Remove global listeners would go here if needed
  }
}
