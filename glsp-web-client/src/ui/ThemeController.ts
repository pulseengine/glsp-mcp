export class ThemeController {
  private slider: HTMLInputElement;
  private themes = [
    "cream",
    "sunset",
    "coral",
    "ocean",
    "sky",
    "purple",
    "dark",
  ];
  private currentTheme = "dark"; // Default theme
  private tooltip?: HTMLElement;

  constructor() {
    this.slider = document.getElementById("theme-slider") as HTMLInputElement;
    if (!this.slider) {
      console.warn("Theme slider not found");
      return;
    }

    this.initializeTheme();
    this.setupEventListeners();
    this.createTooltip();
  }

  private initializeTheme(): void {
    // Load saved theme from localStorage or use default
    const savedTheme = localStorage.getItem("theme");
    if (savedTheme && this.themes.includes(savedTheme)) {
      this.currentTheme = savedTheme;
      const themeIndex = this.themes.indexOf(savedTheme);
      this.slider.value = themeIndex.toString();
    }

    this.applyTheme(this.currentTheme);
  }

  private setupEventListeners(): void {
    this.slider.addEventListener("input", (e) => {
      const value = parseInt((e.target as HTMLInputElement).value);
      const theme = this.themes[value];
      this.setTheme(theme);
      this.updateTooltip(theme);
    });

    // Show tooltip on hover
    this.slider.addEventListener("mouseenter", () => {
      this.showTooltip();
    });

    this.slider.addEventListener("mouseleave", () => {
      this.hideTooltip();
    });

    // Keyboard shortcuts for theme switching
    document.addEventListener("keydown", (e) => {
      if (e.ctrlKey || e.metaKey) {
        switch (e.key) {
          case "1":
          case "2":
          case "3":
          case "4":
          case "5":
          case "6":
          case "7": {
            e.preventDefault();
            const themeIndex = parseInt(e.key) - 1;
            if (themeIndex >= 0 && themeIndex < this.themes.length) {
              this.setTheme(this.themes[themeIndex]);
              this.slider.value = themeIndex.toString();
            }
            break;
          }
          case "b": // Toggle bright/dark
            e.preventDefault();
            this.toggleBrightDark();
            break;
        }
      }
    });
  }

  public setTheme(theme: string): void {
    if (!this.themes.includes(theme)) {
      console.warn(`Unknown theme: ${theme}`);
      return;
    }

    this.currentTheme = theme;
    this.applyTheme(theme);
    this.saveTheme(theme);

    // Update slider position
    const themeIndex = this.themes.indexOf(theme);
    this.slider.value = themeIndex.toString();

    // Dispatch theme change event
    window.dispatchEvent(
      new CustomEvent("themeChanged", {
        detail: { theme, index: themeIndex },
      }),
    );
  }

  private applyTheme(theme: string): void {
    document.documentElement.setAttribute("data-theme", theme);

    // Update theme icon based on theme
    this.updateThemeIcons(theme);

    console.log(`Theme applied: ${theme}`);
  }

  private updateThemeIcons(theme: string): void {
    const leftIcon = document.querySelector(
      ".theme-control .theme-icon:first-child",
    ) as HTMLElement;
    const rightIcon = document.querySelector(
      ".theme-control .theme-icon:last-child",
    ) as HTMLElement;

    if (!leftIcon || !rightIcon) return;

    // Update icons based on current theme
    const themeIcons = {
      cream: { left: "☀️", right: "🌅" },
      sunset: { left: "🌅", right: "🧡" },
      coral: { left: "🧡", right: "🌺" },
      ocean: { left: "🌺", right: "🌊" },
      sky: { left: "🌊", right: "💙" },
      purple: { left: "💙", right: "💜" },
      dark: { left: "💜", right: "🌙" },
    };

    const icons = themeIcons[theme as keyof typeof themeIcons];
    if (icons) {
      leftIcon.textContent = icons.left;
      rightIcon.textContent = icons.right;
    }
  }

  private saveTheme(theme: string): void {
    localStorage.setItem("theme", theme);
  }

  private toggleBrightDark(): void {
    const currentIndex = this.themes.indexOf(this.currentTheme);
    const newIndex = currentIndex <= 3 ? 6 : 0; // Jump between bright (cream) and dark
    this.setTheme(this.themes[newIndex]);
  }

  public getCurrentTheme(): string {
    return this.currentTheme;
  }

  public getAvailableThemes(): string[] {
    return [...this.themes];
  }

  public cycleTheme(direction: "next" | "prev" = "next"): void {
    const currentIndex = this.themes.indexOf(this.currentTheme);
    let newIndex;

    if (direction === "next") {
      newIndex = (currentIndex + 1) % this.themes.length;
    } else {
      newIndex = currentIndex === 0 ? this.themes.length - 1 : currentIndex - 1;
    }

    this.setTheme(this.themes[newIndex]);
  }

  public getThemeInfo(theme?: string): {
    name: string;
    description: string;
    colors: string[];
  } {
    const targetTheme = theme || this.currentTheme;

    const themeInfo = {
      cream: {
        name: "Cream Dream",
        description: "Warm, soft cream tones for comfortable reading",
        colors: ["#FFF8E7", "#F5F0D8", "#EDE4C3"],
      },
      sunset: {
        name: "Golden Sunset",
        description: "Warm golden hues reminiscent of a beautiful sunset",
        colors: ["#FFE5B4", "#FFD1A3", "#FFBD85"],
      },
      coral: {
        name: "Coral Reef",
        description: "Soft coral and pink tones for a gentle experience",
        colors: ["#FFE5E5", "#FFD1D1", "#FFBDBD"],
      },
      ocean: {
        name: "Ocean Breeze",
        description: "Fresh teal and cyan colors like ocean waves",
        colors: ["#E0F7FA", "#B2EBF2", "#80DEEA"],
      },
      sky: {
        name: "Clear Sky",
        description: "Light blue tones like a clear morning sky",
        colors: ["#E3F2FD", "#BBDEFB", "#90CAF9"],
      },
      purple: {
        name: "Purple Haze",
        description: "Elegant purple and lavender shades",
        colors: ["#F3E5F5", "#E1BEE7", "#CE93D8"],
      },
      dark: {
        name: "Midnight Code",
        description: "Dark theme optimized for coding and focus",
        colors: ["#0A0E1A", "#151B2C", "#1C2333"],
      },
    };

    return themeInfo[targetTheme as keyof typeof themeInfo] || themeInfo.dark;
  }

  private createTooltip(): void {
    this.tooltip = document.createElement("div");
    this.tooltip.className = "theme-tooltip";
    this.tooltip.style.cssText = `
            position: fixed;
            background: var(--bg-tertiary);
            border: 1px solid var(--border);
            border-radius: 6px;
            padding: 8px 12px;
            font-size: 12px;
            color: var(--text-primary);
            pointer-events: none;
            z-index: 10000;
            opacity: 0;
            transform: translateY(-10px);
            transition: all 0.3s ease;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
            white-space: nowrap;
        `;

    document.body.appendChild(this.tooltip);
    this.updateTooltip(this.currentTheme);
  }

  private updateTooltip(theme: string): void {
    if (!this.tooltip) return;

    const themeInfo = this.getThemeInfo(theme);
    this.tooltip.innerHTML = `
            <div style="font-weight: 600; margin-bottom: 2px;">${themeInfo.name}</div>
            <div style="color: var(--text-secondary); font-size: 11px;">${themeInfo.description}</div>
        `;
  }

  private showTooltip(): void {
    if (!this.tooltip) return;

    const rect = this.slider.getBoundingClientRect();
    this.tooltip.style.left = `${rect.left + rect.width / 2}px`;
    this.tooltip.style.top = `${rect.top - 10}px`;
    this.tooltip.style.transform = "translateX(-50%) translateY(-100%)";
    this.tooltip.style.opacity = "1";
  }

  private hideTooltip(): void {
    if (!this.tooltip) return;

    this.tooltip.style.opacity = "0";
    this.tooltip.style.transform =
      "translateX(-50%) translateY(-100%) translateY(-10px)";
  }
}
