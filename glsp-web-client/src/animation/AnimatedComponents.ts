/**
 * Animated UI Components
 *
 * Provides pre-built animated components for:
 * - Buttons with hover and click animations
 * - Page transitions
 * - Loading states and skeleton screens
 * - Micro-interactions
 * - State transitions
 */

import { animationSystem, AnimationConfig } from "./AnimationSystem.js";

/**
 * Animated Button Component
 */
export class AnimatedButton {
  private element: HTMLButtonElement;
  private isAnimating: boolean = false;

  constructor(
    element: HTMLButtonElement,
    options: {
      hoverAnimation?: "lift" | "glow" | "scale" | "none";
      clickAnimation?: "press" | "ripple" | "bounce" | "none";
      loadingAnimation?: "spin" | "pulse" | "dots" | "none";
    } = {},
  ) {
    this.element = element;
    this.setupAnimations(options);
  }

  private setupAnimations(options: any): void {
    // Hover animations
    if (options.hoverAnimation !== "none") {
      this.setupHoverAnimation(options.hoverAnimation || "lift");
    }

    // Click animations
    if (options.clickAnimation !== "none") {
      this.setupClickAnimation(options.clickAnimation || "press");
    }

    // Add base transition
    animationSystem.transition(this.element, {
      property: ["transform", "box-shadow", "background-color"],
      duration: 200,
      easing: "ease-out",
    });
  }

  private setupHoverAnimation(type: string): void {
    this.element.addEventListener("mouseenter", () => {
      if (this.isAnimating) return;

      switch (type) {
        case "lift":
          this.element.style.transform = "translateY(-2px)";
          this.element.style.boxShadow = "0 4px 12px rgba(0, 0, 0, 0.15)";
          break;
        case "glow":
          this.element.style.boxShadow = "0 0 10px rgba(102, 126, 234, 0.5)";
          break;
        case "scale":
          this.element.style.transform = "scale(1.05)";
          break;
      }
    });

    this.element.addEventListener("mouseleave", () => {
      if (this.isAnimating) return;

      this.element.style.transform = "";
      this.element.style.boxShadow = "";
    });
  }

  private setupClickAnimation(type: string): void {
    this.element.addEventListener("mousedown", async () => {
      this.isAnimating = true;

      switch (type) {
        case "press":
          await animationSystem.animate(this.element, {
            type: "custom",
            duration: 100,
            easing: "ease-out",
            customKeyframes: [{ transform: "scale(0.95)" }],
          });
          break;

        case "ripple":
          this.createRippleEffect();
          break;

        case "bounce":
          await animationSystem.animate(this.element, {
            type: "bounce",
            duration: 300,
            easing: "ease-out",
          });
          break;
      }

      this.isAnimating = false;
    });

    this.element.addEventListener("mouseup", () => {
      if (type === "press") {
        this.element.style.transform = "";
      }
    });
  }

  private createRippleEffect(): void {
    const ripple = document.createElement("span");
    ripple.className = "ripple-effect";

    const rect = this.element.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height);

    ripple.style.width = ripple.style.height = size + "px";
    ripple.style.position = "absolute";
    ripple.style.borderRadius = "50%";
    ripple.style.background = "rgba(255, 255, 255, 0.6)";
    ripple.style.left = "50%";
    ripple.style.top = "50%";
    ripple.style.transform = "translate(-50%, -50%) scale(0)";
    ripple.style.pointerEvents = "none";

    this.element.style.position = "relative";
    this.element.style.overflow = "hidden";
    this.element.appendChild(ripple);

    animationSystem
      .animate(ripple, {
        type: "custom",
        duration: 400,
        easing: "ease-out",
        customKeyframes: [
          { transform: "translate(-50%, -50%) scale(0)", opacity: 1 },
          { transform: "translate(-50%, -50%) scale(1)", opacity: 0 },
        ],
      })
      .then(() => {
        ripple.remove();
      });
  }

  public showLoading(type: string = "spin"): void {
    const originalContent = this.element.innerHTML;
    this.element.disabled = true;

    switch (type) {
      case "spin":
        this.element.innerHTML = '<span class="animate-spin">⟳</span>';
        break;
      case "pulse":
        this.element.innerHTML = '<span class="animate-pulse">●</span>';
        break;
      case "dots":
        this.element.innerHTML = '<span class="loading-dots">●●●</span>';
        this.animateLoadingDots();
        break;
    }

    // Store original content for restoration
    (this.element as any).__originalContent = originalContent;
  }

  public hideLoading(): void {
    const originalContent = (this.element as any).__originalContent;
    if (originalContent) {
      this.element.innerHTML = originalContent;
      this.element.disabled = false;
    }
  }

  private animateLoadingDots(): void {
    const dotsElement = this.element.querySelector(".loading-dots");
    if (!dotsElement) return;

    let dotCount = 0;
    const animate = () => {
      dotCount = (dotCount % 3) + 1;
      dotsElement.textContent = "●".repeat(dotCount);

      if (this.element.querySelector(".loading-dots")) {
        setTimeout(animate, 500);
      }
    };
    animate();
  }
}

/**
 * Page Transition Manager
 */
export class PageTransitionManager {
  private container: HTMLElement;
  private currentView: HTMLElement | null = null;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  public async transitionTo(
    newView: HTMLElement,
    transition: {
      type: "fade" | "slide" | "scale" | "flip";
      direction?: "left" | "right" | "up" | "down";
      duration?: number;
    } = { type: "fade" },
  ): Promise<void> {
    const { type, direction = "right", duration = 400 } = transition;

    // Position new view for transition
    newView.style.position = "absolute";
    newView.style.top = "0";
    newView.style.left = "0";
    newView.style.width = "100%";
    newView.style.height = "100%";

    // Set initial state based on transition type
    this.setInitialTransitionState(newView, type, direction);

    // Add new view to container
    this.container.appendChild(newView);

    // Animate transition
    const animations: Promise<void>[] = [];

    // Animate out current view
    if (this.currentView) {
      animations.push(
        this.animateOut(this.currentView, type, direction, duration),
      );
    }

    // Animate in new view
    animations.push(this.animateIn(newView, type, direction, duration));

    // Wait for both animations to complete
    await Promise.all(animations);

    // Clean up old view
    if (this.currentView && this.currentView.parentNode) {
      this.currentView.remove();
    }

    // Update current view
    this.currentView = newView;
    newView.style.position = "";
    newView.style.transform = "";
    newView.style.opacity = "";
  }

  private setInitialTransitionState(
    element: HTMLElement,
    type: string,
    direction: string,
  ): void {
    switch (type) {
      case "fade":
        element.style.opacity = "0";
        break;

      case "slide":
        const translateValue =
          direction === "left" || direction === "right"
            ? direction === "left"
              ? "-100%"
              : "100%"
            : direction === "up"
              ? "-100%"
              : "100%";

        element.style.transform =
          direction === "left" || direction === "right"
            ? `translateX(${translateValue})`
            : `translateY(${translateValue})`;
        break;

      case "scale":
        element.style.transform = "scale(0.8)";
        element.style.opacity = "0";
        break;

      case "flip":
        element.style.transform = "rotateY(90deg)";
        break;
    }
  }

  private async animateOut(
    element: HTMLElement,
    type: string,
    direction: string,
    duration: number,
  ): Promise<void> {
    const config: AnimationConfig = {
      type: "custom",
      duration,
      easing: "ease-in",
    };

    switch (type) {
      case "fade":
        config.customKeyframes = [{ opacity: 0 }];
        break;

      case "slide":
        const outTranslate =
          direction === "left" || direction === "right"
            ? direction === "left"
              ? "100%"
              : "-100%"
            : direction === "up"
              ? "100%"
              : "-100%";

        config.customKeyframes =
          direction === "left" || direction === "right"
            ? [{ transform: `translateX(${outTranslate})` }]
            : [{ transform: `translateY(${outTranslate})` }];
        break;

      case "scale":
        config.customKeyframes = [{ transform: "scale(1.2)", opacity: 0 }];
        break;

      case "flip":
        config.customKeyframes = [{ transform: "rotateY(-90deg)" }];
        break;
    }

    return animationSystem.animate(element, config);
  }

  private async animateIn(
    element: HTMLElement,
    type: string,
    direction: string,
    duration: number,
  ): Promise<void> {
    const config: AnimationConfig = {
      type: "custom",
      duration,
      easing: "ease-out",
    };

    switch (type) {
      case "fade":
        config.customKeyframes = [{ opacity: 1 }];
        break;
      case "slide":
        // Use direction parameter for slide animations
        const slideTransform =
          direction === "up"
            ? "translateY(0)"
            : direction === "down"
              ? "translateY(0)"
              : direction === "left"
                ? "translateX(0)"
                : "translateX(0)";
        config.customKeyframes = [{ transform: slideTransform }];
        break;

      case "scale":
        config.customKeyframes = [{ transform: "scale(1)", opacity: 1 }];
        break;

      case "flip":
        config.customKeyframes = [{ transform: "rotateY(0deg)" }];
        break;
    }

    return animationSystem.animate(element, config);
  }
}

/**
 * Loading State Manager
 */
export class LoadingStateManager {
  /**
   * Create a skeleton loader for content
   */
  public static createSkeleton(
    container: HTMLElement,
    config: {
      lines: number;
      width?: string;
      height?: string;
    },
  ): HTMLElement {
    const skeleton = document.createElement("div");
    skeleton.className = "skeleton-container";
    skeleton.style.padding = "20px";

    for (let i = 0; i < config.lines; i++) {
      const line = document.createElement("div");
      line.className = "skeleton";
      line.style.height = config.height || "20px";
      line.style.width =
        config.width || (i === config.lines - 1 ? "60%" : "100%");
      line.style.marginBottom = "10px";
      line.style.borderRadius = "4px";

      skeleton.appendChild(line);
    }

    container.appendChild(skeleton);
    return skeleton;
  }

  /**
   * Animate skeleton removal and content appearance
   */
  public static async replaceSkeleton(
    skeleton: HTMLElement,
    content: HTMLElement,
  ): Promise<void> {
    // Position content
    content.style.opacity = "0";
    skeleton.parentNode?.appendChild(content);

    // Animate out skeleton and in content
    await Promise.all([
      animationSystem.animate(skeleton, {
        type: "fade",
        duration: 200,
        easing: "ease-out",
        fillMode: "forwards",
      }),
      animationSystem.animate(content, {
        type: "fade",
        duration: 300,
        easing: "ease-in",
        delay: 100,
      }),
    ]);

    skeleton.remove();
    content.style.opacity = "";
  }

  /**
   * Create a loading spinner
   */
  public static createSpinner(
    container: HTMLElement,
    config: {
      size?: number;
      color?: string;
      text?: string;
    } = {},
  ): HTMLElement {
    const { size = 40, color = "#667eea", text } = config;

    const wrapper = document.createElement("div");
    wrapper.className = "loading-spinner-wrapper";
    wrapper.style.display = "flex";
    wrapper.style.flexDirection = "column";
    wrapper.style.alignItems = "center";
    wrapper.style.justifyContent = "center";
    wrapper.style.padding = "40px";

    const spinner = document.createElement("div");
    spinner.className = "animate-spin";
    spinner.style.width = size + "px";
    spinner.style.height = size + "px";
    spinner.style.border = "3px solid #f3f3f3";
    spinner.style.borderTop = `3px solid ${color}`;
    spinner.style.borderRadius = "50%";

    wrapper.appendChild(spinner);

    if (text) {
      const textElement = document.createElement("div");
      textElement.textContent = text;
      textElement.style.marginTop = "16px";
      textElement.style.color = "#666";
      textElement.style.fontSize = "14px";
      wrapper.appendChild(textElement);
    }

    container.appendChild(wrapper);
    return wrapper;
  }
}

/**
 * Micro-interaction utilities
 */
export class MicroInteractions {
  /**
   * Add a success checkmark animation
   */
  public static async showSuccess(element: HTMLElement): Promise<void> {
    const checkmark = document.createElement("span");
    checkmark.innerHTML = "✓";
    checkmark.style.position = "absolute";
    checkmark.style.color = "#28a745";
    checkmark.style.fontSize = "20px";
    checkmark.style.fontWeight = "bold";
    checkmark.style.top = "50%";
    checkmark.style.left = "50%";
    checkmark.style.transform = "translate(-50%, -50%) scale(0)";
    checkmark.style.pointerEvents = "none";

    element.style.position = "relative";
    element.appendChild(checkmark);

    await animationSystem.animate(checkmark, {
      type: "custom",
      duration: 400,
      easing: "cubic-bezier(0.68, -0.55, 0.265, 1.55)",
      customKeyframes: [{ transform: "translate(-50%, -50%) scale(1)" }],
    });

    setTimeout(() => checkmark.remove(), 1000);
  }

  /**
   * Add a shake animation for errors
   */
  public static async shake(element: HTMLElement): Promise<void> {
    await animationSystem.animate(element, {
      type: "custom",
      duration: 500,
      easing: "ease-in-out",
      customKeyframes: [
        { transform: "translateX(0)" },
        { transform: "translateX(-10px)" },
        { transform: "translateX(10px)" },
        { transform: "translateX(-10px)" },
        { transform: "translateX(10px)" },
        { transform: "translateX(0)" },
      ],
    });
  }

  /**
   * Add a pulse effect to draw attention
   */
  public static pulse(element: HTMLElement, duration: number = 2000): void {
    element.style.animation = `pulse ${duration}ms ease-in-out infinite`;

    // Auto-remove after a few cycles
    setTimeout(() => {
      element.style.animation = "";
    }, duration * 3);
  }

  /**
   * Create a floating tooltip with animation
   */
  public static showTooltip(
    element: HTMLElement,
    text: string,
    position: "top" | "bottom" | "left" | "right" = "top",
  ): HTMLElement {
    const tooltip = document.createElement("div");
    tooltip.className = "animated-tooltip";
    tooltip.textContent = text;
    tooltip.style.position = "absolute";
    tooltip.style.background = "rgba(0, 0, 0, 0.8)";
    tooltip.style.color = "white";
    tooltip.style.padding = "8px 12px";
    tooltip.style.borderRadius = "4px";
    tooltip.style.fontSize = "12px";
    tooltip.style.whiteSpace = "nowrap";
    tooltip.style.zIndex = "1000";
    tooltip.style.opacity = "0";
    tooltip.style.pointerEvents = "none";

    // Position tooltip relative to element bounds
    const rect = element.getBoundingClientRect();
    switch (position) {
      case "top":
        tooltip.style.bottom = "100%";
        tooltip.style.left = "50%";
        tooltip.style.transform = "translateX(-50%) translateY(-8px)";
        tooltip.style.minWidth = `${Math.max(100, rect.width * 0.8)}px`;
        break;
      case "bottom":
        tooltip.style.top = "100%";
        tooltip.style.left = "50%";
        tooltip.style.transform = "translateX(-50%) translateY(8px)";
        tooltip.style.minWidth = `${Math.max(100, rect.width * 0.8)}px`;
        break;
      case "left":
        tooltip.style.right = "100%";
        tooltip.style.top = "50%";
        tooltip.style.transform = "translateY(-50%) translateX(-8px)";
        tooltip.style.maxWidth = `${rect.left - 20}px`;
        break;
      case "right":
        tooltip.style.left = "100%";
        tooltip.style.top = "50%";
        tooltip.style.transform = "translateY(-50%) translateX(8px)";
        tooltip.style.maxWidth = `${window.innerWidth - rect.right - 20}px`;
        break;
    }

    element.style.position = "relative";
    element.appendChild(tooltip);

    // Animate in
    animationSystem.animate(tooltip, {
      type: "custom",
      duration: 200,
      easing: "ease-out",
      customKeyframes: [{ opacity: 1 }],
    });

    return tooltip;
  }
}

// Export utility function to initialize animated components
export function initializeAnimatedComponents(): void {
  console.log("🎬 Animation System: Initializing animated components...");

  // Auto-initialize animated buttons
  document.querySelectorAll('[data-animated="button"]').forEach((button) => {
    if (button instanceof HTMLButtonElement) {
      new AnimatedButton(button, {
        hoverAnimation: button.dataset.hoverAnimation as any,
        clickAnimation: button.dataset.clickAnimation as any,
      });
    }
  });

  console.log("✅ Animation System: Components initialized");
}
