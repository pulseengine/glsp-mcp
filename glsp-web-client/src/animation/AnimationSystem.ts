/**
 * Comprehensive Animation System for UI and Graphics Components
 *
 * Features:
 * - Smooth transitions for graphics components
 * - Dialog entrance/exit animations
 * - Page transition effects
 * - Micro-interactions for buttons and controls
 * - Performance-optimized with requestAnimationFrame
 * - Respects user accessibility preferences (prefers-reduced-motion)
 */

export interface AnimationConfig {
  type:
    | "fade"
    | "slide"
    | "slideDown"
    | "slideUp"
    | "scale"
    | "bounce"
    | "rotate"
    | "blur"
    | "lift"
    | "custom";
  duration: number; // milliseconds
  easing:
    | "linear"
    | "ease"
    | "ease-in"
    | "ease-out"
    | "ease-in-out"
    | "cubic-bezier"
    | string;
  delay?: number; // milliseconds
  direction?: "normal" | "reverse" | "alternate" | "alternate-reverse";
  iterationCount?: number | "infinite";
  fillMode?: "none" | "forwards" | "backwards" | "both";
  customKeyframes?: Keyframe[];
}

export interface TransitionConfig {
  property: string | string[];
  duration: number;
  easing?: string;
  delay?: number;
}

export class AnimationSystem {
  private static instance: AnimationSystem;
  private activeAnimations: Map<string, Animation> = new Map();
  private reducedMotion: boolean;

  private constructor() {
    // Check user's motion preference
    this.reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    // Listen for changes to motion preference
    window
      .matchMedia("(prefers-reduced-motion: reduce)")
      .addEventListener("change", (e) => {
        this.reducedMotion = e.matches;
        console.log(
          `Animation System: Reduced motion ${
            this.reducedMotion ? "enabled" : "disabled"
          }`,
        );
      });

    this.injectGlobalStyles();
  }

  public static getInstance(): AnimationSystem {
    if (!AnimationSystem.instance) {
      AnimationSystem.instance = new AnimationSystem();
    }
    return AnimationSystem.instance;
  }

  /**
   * Animate an element with the specified configuration
   */
  public animate(element: HTMLElement, config: AnimationConfig): Promise<void> {
    return new Promise((resolve) => {
      if (this.reducedMotion && config.type !== "custom") {
        // Skip animation if user prefers reduced motion
        resolve();
        return;
      }

      const animationId = `anim-${Date.now()}-${Math.random()}`;

      // Apply animation based on type
      const keyframes = this.getKeyframes(config);
      const options: KeyframeAnimationOptions = {
        duration: config.duration,
        easing: this.getEasingFunction(config.easing),
        delay: config.delay || 0,
        direction: config.direction || "normal",
        iterations:
          typeof config.iterationCount === "number" ? config.iterationCount : 1,
        fill: config.fillMode || "both",
      };

      const animation = element.animate(keyframes, options);
      this.activeAnimations.set(animationId, animation);

      animation.onfinish = () => {
        this.activeAnimations.delete(animationId);
        resolve();
      };

      animation.oncancel = () => {
        this.activeAnimations.delete(animationId);
        resolve();
      };
    });
  }

  /**
   * Apply CSS transitions to an element
   */
  public transition(element: HTMLElement, config: TransitionConfig): void {
    if (this.reducedMotion) {
      // Apply instant changes if reduced motion is preferred
      return;
    }

    const properties = Array.isArray(config.property)
      ? config.property
      : [config.property];
    const transitionValue = properties
      .map(
        (prop) =>
          `${prop} ${config.duration}ms ${config.easing || "ease"} ${
            config.delay || 0
          }ms`,
      )
      .join(", ");

    element.style.transition = transitionValue;
  }

  /**
   * Animate multiple elements in sequence
   */
  public async animateSequence(
    elements: HTMLElement[],
    config: AnimationConfig,
    stagger: number = 0,
  ): Promise<void> {
    for (let i = 0; i < elements.length; i++) {
      await this.animate(elements[i], {
        ...config,
        delay: (config.delay || 0) + i * stagger,
      });
    }
  }

  /**
   * Animate multiple elements in parallel
   */
  public async animateParallel(
    elements: HTMLElement[],
    config: AnimationConfig | AnimationConfig[],
  ): Promise<void> {
    const configs = Array.isArray(config) ? config : elements.map(() => config);
    const promises = elements.map((element, index) =>
      this.animate(element, configs[index] || configs[0]),
    );
    await Promise.all(promises);
  }

  /**
   * Create a spring animation effect
   */
  public spring(
    element: HTMLElement,
    from: any,
    to: any,
    options: {
      stiffness?: number;
      damping?: number;
      mass?: number;
      duration?: number;
    } = {},
  ): Promise<void> {
    const {
      stiffness: _stiffness = 180,
      damping: _damping = 12,
      mass: _mass = 1,
      duration = 1000,
    } = options;

    // Spring animation using cubic-bezier approximation
    const springEasing = `cubic-bezier(${0.5}, ${1.4}, ${0.5}, ${1})`;

    return this.animate(element, {
      type: "custom",
      duration,
      easing: springEasing,
      customKeyframes: [from, to],
    });
  }

  /**
   * Cancel all active animations
   */
  public cancelAll(): void {
    this.activeAnimations.forEach((animation) => animation.cancel());
    this.activeAnimations.clear();
  }

  /**
   * Cancel specific animation
   */
  public cancel(element: HTMLElement): void {
    const animations = element.getAnimations();
    animations.forEach((animation) => animation.cancel());
  }

  /**
   * Get keyframes based on animation type
   */
  private getKeyframes(config: AnimationConfig): Keyframe[] {
    if (config.customKeyframes) {
      return config.customKeyframes;
    }

    switch (config.type) {
      case "fade":
        return [{ opacity: 0 }, { opacity: 1 }];

      case "slide":
        return [
          { transform: "translateY(-20px)", opacity: 0 },
          { transform: "translateY(0)", opacity: 1 },
        ];

      case "scale":
        return [
          { transform: "scale(0.8)", opacity: 0 },
          { transform: "scale(1)", opacity: 1 },
        ];

      case "bounce":
        return [
          { transform: "scale(0.3)", opacity: 0 },
          { transform: "scale(1.05)", opacity: 1 },
          { transform: "scale(0.95)", opacity: 1 },
          { transform: "scale(1)", opacity: 1 },
        ];

      case "rotate":
        return [{ transform: "rotate(0deg)" }, { transform: "rotate(360deg)" }];

      case "blur":
        return [
          { filter: "blur(10px)", opacity: 0 },
          { filter: "blur(0px)", opacity: 1 },
        ];

      case "slideDown":
        return [
          { transform: "translateY(-100%)", opacity: 0 },
          { transform: "translateY(0)", opacity: 1 },
        ];

      case "slideUp":
        return [
          { transform: "translateY(100%)", opacity: 0 },
          { transform: "translateY(0)", opacity: 1 },
        ];

      case "lift":
        return [
          { transform: "translateY(20px) scale(0.95)", opacity: 0.5 },
          { transform: "translateY(0) scale(1)", opacity: 1 },
        ];

      default:
        return [];
    }
  }

  /**
   * Get easing function
   */
  private getEasingFunction(easing: string): string {
    if (easing.startsWith("cubic-bezier")) {
      return easing;
    }

    const easingFunctions: Record<string, string> = {
      linear: "linear",
      ease: "ease",
      "ease-in": "ease-in",
      "ease-out": "ease-out",
      "ease-in-out": "ease-in-out",
      "cubic-bezier": "cubic-bezier(0.25, 0.1, 0.25, 1)",
    };

    return easingFunctions[easing] || easing;
  }

  /**
   * Inject global animation styles
   */
  private injectGlobalStyles(): void {
    if (document.querySelector("#animation-system-styles")) {
      return;
    }

    const style = document.createElement("style");
    style.id = "animation-system-styles";
    style.textContent = `
            /* Reduced motion support */
            @media (prefers-reduced-motion: reduce) {
                *,
                *::before,
                *::after {
                    animation-duration: 0.01ms !important;
                    animation-iteration-count: 1 !important;
                    transition-duration: 0.01ms !important;
                    scroll-behavior: auto !important;
                }
            }

            /* Animation utility classes */
            .animate-fade {
                animation: fadeIn 0.3s ease-out;
            }

            .animate-slide {
                animation: slideIn 0.4s ease-out;
            }

            .animate-scale {
                animation: scaleIn 0.3s ease-out;
            }

            .animate-bounce {
                animation: bounceIn 0.6s cubic-bezier(0.68, -0.55, 0.265, 1.55);
            }

            /* Transition utility classes */
            .transition-all {
                transition: all 0.3s ease;
            }

            .transition-transform {
                transition: transform 0.3s ease;
            }

            .transition-opacity {
                transition: opacity 0.3s ease;
            }

            /* Hover effects */
            .hover-lift {
                transition: transform 0.2s ease;
            }

            .hover-lift:hover {
                transform: translateY(-2px);
            }

            .hover-glow {
                transition: box-shadow 0.2s ease;
            }

            .hover-glow:hover {
                box-shadow: 0 0 10px rgba(102, 126, 234, 0.5);
            }

            /* Loading animations */
            @keyframes spin {
                from { transform: rotate(0deg); }
                to { transform: rotate(360deg); }
            }

            .animate-spin {
                animation: spin 1s linear infinite;
            }

            @keyframes pulse {
                0%, 100% { opacity: 1; }
                50% { opacity: 0.5; }
            }

            .animate-pulse {
                animation: pulse 2s ease-in-out infinite;
            }

            /* Skeleton loading */
            @keyframes shimmer {
                0% {
                    background-position: -1000px 0;
                }
                100% {
                    background-position: 1000px 0;
                }
            }

            .skeleton {
                background: linear-gradient(
                    90deg,
                    #f0f0f0 25%,
                    #e0e0e0 50%,
                    #f0f0f0 75%
                );
                background-size: 1000px 100%;
                animation: shimmer 2s linear infinite;
            }
        `;

    document.head.appendChild(style);
  }
}

// Export singleton instance
export const animationSystem = AnimationSystem.getInstance();
