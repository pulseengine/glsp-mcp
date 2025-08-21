export interface SidebarSection {
  id: string;
  title: string;
  icon?: string;
  collapsible?: boolean;
  collapsed?: boolean;
  content: HTMLElement | string;
  order?: number;
}

export interface SidebarConfig {
  width?: number;
  minWidth?: number;
  maxWidth?: number;
  resizable?: boolean;
  backgroundColor?: string;
  borderColor?: string;
  animationDuration?: number;
}

export class SidebarComponent {
  private element: HTMLElement;
  private sections: Map<string, SidebarSection> = new Map();
  private config: Required<SidebarConfig>;
  private resizeHandle?: HTMLElement;
  private isResizing: boolean = false;
  private startWidth: number = 0;
  private startX: number = 0;

  constructor(container: HTMLElement, config: SidebarConfig = {}) {
    this.config = {
      width: 280,
      minWidth: 200,
      maxWidth: 400,
      resizable: true,
      backgroundColor: "var(--bg-secondary, #151B2C)",
      borderColor: "var(--border, #30363D)",
      animationDuration: 300,
      ...config,
    };

    this.element = this.createElement();
    container.appendChild(this.element);

    if (this.config.resizable) {
      this.setupResize();
    }
  }

  private createElement(): HTMLElement {
    const sidebar = document.createElement("div");
    sidebar.className = "modern-sidebar";
    sidebar.style.cssText = `
            width: ${this.config.width}px;
            min-width: ${this.config.minWidth}px;
            max-width: ${this.config.maxWidth}px;
            height: 100%;
            background: ${this.config.backgroundColor};
            border-right: 1px solid ${this.config.borderColor};
            display: flex;
            flex-direction: column;
            position: relative;
            overflow: hidden;
            transition: width ${this.config.animationDuration}ms ease;
        `;

    sidebar.innerHTML = `
            <div class="sidebar-header" style="
                padding: 12px 16px;
                border-bottom: 1px solid ${this.config.borderColor};
                display: flex;
                align-items: center;
                justify-content: space-between;
                background: var(--bg-tertiary, #1C2333);
                flex-shrink: 0;
            ">
                <div class="sidebar-title" style="
                    display: flex;
                    align-items: center;
                    gap: 8px;
                ">
                    <span style="font-size: 20px;">📦</span>
                    <h3 class="sidebar-title-text" style="
                        margin: 0;
                        font-size: 16px;
                        font-weight: 600;
                        color: var(--text-primary, #E6EDF3);
                        white-space: nowrap;
                    ">WASM Components</h3>
                </div>
                <button class="sidebar-collapse-btn" style="
                    background: var(--bg-primary, #0F1419);
                    border: 1px solid var(--border-color, #2A3441);
                    color: var(--text-secondary, #7D8590);
                    cursor: pointer;
                    padding: 6px;
                    border-radius: 6px;
                    transition: all 0.2s ease;
                    min-width: 30px;
                    min-height: 30px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    flex-shrink: 0;
                " title="Collapse Sidebar">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/>
                    </svg>
                </button>
            </div>
            <div class="sidebar-content" style="
                flex: 1;
                overflow-y: auto;
                overflow-x: hidden;
                padding: 8px;
                min-height: 0;
            "></div>
        `;

    // Setup collapse button and other event handlers
    this.setupCollapseButton();

    // Add responsive CSS for sidebar
    this.addResponsiveStyles();

    return sidebar;
  }

  private setupResize(): void {
    // Create resize handle
    this.resizeHandle = document.createElement("div");
    this.resizeHandle.className = "sidebar-resize-handle";
    this.resizeHandle.style.cssText = `
            position: absolute;
            top: 0;
            right: -3px;
            width: 6px;
            height: 100%;
            cursor: ew-resize;
            background: transparent;
            transition: background 0.2s ease;
        `;

    this.resizeHandle.addEventListener("mouseenter", () => {
      this.resizeHandle!.style.background = "var(--accent-wasm, #654FF0)";
    });

    this.resizeHandle.addEventListener("mouseleave", () => {
      if (!this.isResizing) {
        this.resizeHandle!.style.background = "transparent";
      }
    });

    this.element.appendChild(this.resizeHandle);

    // Resize event handlers
    this.resizeHandle.addEventListener("mousedown", (e) => this.startResize(e));
    document.addEventListener("mousemove", (e) => this.handleResize(e));
    document.addEventListener("mouseup", () => this.stopResize());
  }

  private startResize(e: MouseEvent): void {
    this.isResizing = true;
    this.startWidth = this.element.offsetWidth;
    this.startX = e.clientX;
    document.body.style.cursor = "ew-resize";
    document.body.style.userSelect = "none";
  }

  private handleResize(e: MouseEvent): void {
    if (!this.isResizing) return;

    const deltaX = e.clientX - this.startX;
    const newWidth = Math.max(
      this.config.minWidth,
      Math.min(this.config.maxWidth, this.startWidth + deltaX),
    );

    this.element.style.width = `${newWidth}px`;
  }

  private stopResize(): void {
    if (!this.isResizing) return;

    this.isResizing = false;
    document.body.style.cursor = "";
    document.body.style.userSelect = "";

    if (this.resizeHandle) {
      this.resizeHandle.style.background = "transparent";
    }
  }

  public addSection(section: SidebarSection): void {
    this.sections.set(section.id, section);
    this.renderSections();
  }

  public removeSection(id: string): void {
    this.sections.delete(id);
    this.renderSections();
  }

  public updateSection(id: string, updates: Partial<SidebarSection>): void {
    const section = this.sections.get(id);
    if (section) {
      this.sections.set(id, { ...section, ...updates });
      this.renderSections();
    }
  }

  private renderSections(): void {
    const content = this.element.querySelector(
      ".sidebar-content",
    ) as HTMLElement;
    content.innerHTML = "";

    // Sort sections by order
    const sortedSections = Array.from(this.sections.values()).sort(
      (a, b) => (a.order ?? 999) - (b.order ?? 999),
    );

    sortedSections.forEach((section) => {
      const sectionElement = this.createSectionElement(section);
      content.appendChild(sectionElement);
    });
  }

  private createSectionElement(section: SidebarSection): HTMLElement {
    const element = document.createElement("div");
    element.className = "sidebar-section";
    element.dataset.sectionId = section.id;
    element.style.cssText = `
            margin-bottom: 12px;
            background: var(--bg-primary, #0F1419);
            border: 1px solid var(--border-color, #2A3441);
            border-radius: 8px;
            overflow: hidden;
            transition: all 0.3s ease;
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
        `;

    // Create header if title exists
    if (section.title) {
      const header = document.createElement("div");
      header.className = "section-header";
      header.style.cssText = `
                padding: 10px 12px;
                background: var(--bg-tertiary, #1C2333);
                border-bottom: 1px solid var(--border-color, #2A3441);
                display: flex;
                align-items: center;
                justify-content: space-between;
                cursor: ${section.collapsible ? "pointer" : "default"};
                user-select: none;
                transition: background-color 0.2s ease;
            `;

      const titleContainer = document.createElement("div");
      titleContainer.style.cssText = `
                display: flex;
                align-items: center;
                gap: 8px;
            `;

      if (section.icon) {
        const icon = document.createElement("span");
        icon.textContent = section.icon;
        icon.style.fontSize = "18px";
        titleContainer.appendChild(icon);
      }

      const title = document.createElement("h4");
      title.textContent = section.title;
      title.style.cssText = `
                margin: 0;
                font-size: 13px;
                font-weight: 600;
                color: var(--text-primary, #E6EDF3);
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            `;
      titleContainer.appendChild(title);

      header.appendChild(titleContainer);

      if (section.collapsible) {
        const chevron = document.createElement("div");
        chevron.className = "section-chevron";
        chevron.style.cssText = `
                    transition: transform 0.3s ease;
                    color: var(--text-secondary, #7D8590);
                `;
        chevron.innerHTML = `
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z"/>
                    </svg>
                `;

        if (section.collapsed) {
          chevron.style.transform = "rotate(-90deg)";
        }

        header.appendChild(chevron);
        header.addEventListener("click", () => this.toggleSection(section.id));
      }

      element.appendChild(header);
    }

    // Create content container
    const contentContainer = document.createElement("div");
    contentContainer.className = "section-content";
    contentContainer.style.cssText = `
            padding: ${section.title ? "12px" : "8px"};
            transition: max-height 0.3s ease, padding 0.3s ease, opacity 0.2s ease;
            overflow: hidden;
            ${
              section.collapsed
                ? "max-height: 0; padding: 0; opacity: 0;"
                : "max-height: 1000px; opacity: 1;"
            }
        `;

    if (typeof section.content === "string") {
      contentContainer.innerHTML = section.content;
    } else {
      contentContainer.appendChild(section.content);
    }

    element.appendChild(contentContainer);

    return element;
  }

  private toggleSection(id: string): void {
    const section = this.sections.get(id);
    if (!section || !section.collapsible) return;

    section.collapsed = !section.collapsed;
    this.sections.set(id, section);

    // Animate the specific section
    const sectionElement = this.element.querySelector(
      `[data-section-id="${id}"]`,
    );
    if (sectionElement) {
      const content = sectionElement.querySelector(
        ".section-content",
      ) as HTMLElement;
      const chevron = sectionElement.querySelector(
        ".section-chevron",
      ) as HTMLElement;

      if (section.collapsed) {
        content.style.maxHeight = "0";
        content.style.padding = "0";
        content.style.opacity = "0";
        chevron.style.transform = "rotate(-90deg)";
      } else {
        content.style.maxHeight = "1000px";
        content.style.padding = section.title ? "12px" : "8px";
        content.style.opacity = "1";
        chevron.style.transform = "rotate(0deg)";
      }
    }
  }

  public toggleCollapse(): void {
    const isCollapsed = this.element.classList.contains("collapsed");
    console.log("toggleCollapse called, isCollapsed:", isCollapsed);

    if (isCollapsed) {
      // Expand sidebar
      console.log("Expanding sidebar to width:", this.config.width);
      this.element.classList.remove("collapsed");
      this.element.style.width = `${this.config.width}px`;

      // Show content after expansion starts
      setTimeout(() => {
        const content = this.element.querySelector(
          ".sidebar-content",
        ) as HTMLElement;
        const titleText = this.element.querySelector(
          ".sidebar-title-text",
        ) as HTMLElement;
        const collapseBtn = this.element.querySelector(
          ".sidebar-collapse-btn svg",
        ) as HTMLElement;
        const sidebarTitle = this.element.querySelector(
          ".sidebar-title",
        ) as HTMLElement;

        content.style.opacity = "1";
        content.style.pointerEvents = "auto";
        titleText.style.opacity = "1";
        sidebarTitle.style.justifyContent = "space-between";

        // Update collapse button icon to show collapse arrow
        collapseBtn.innerHTML =
          '<path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/>';
        collapseBtn.parentElement!.title = "Collapse Sidebar";

        // Remove floating button when expanded
        this.removeFloatingExpandButton();
      }, 100);
    } else {
      // Collapse sidebar
      console.log("Collapsing sidebar to minimal width");
      this.element.classList.add("collapsed");
      this.element.style.width = "60px";

      // Hide content immediately but keep structure
      const content = this.element.querySelector(
        ".sidebar-content",
      ) as HTMLElement;
      const titleText = this.element.querySelector(
        ".sidebar-title-text",
      ) as HTMLElement;
      const collapseBtn = this.element.querySelector(
        ".sidebar-collapse-btn svg",
      ) as HTMLElement;
      const sidebarTitle = this.element.querySelector(
        ".sidebar-title",
      ) as HTMLElement;

      content.style.opacity = "0";
      content.style.pointerEvents = "none";
      titleText.style.opacity = "0";
      sidebarTitle.style.justifyContent = "center";

      // Update collapse button icon to show expand arrow
      collapseBtn.innerHTML =
        '<path d="M8.59 16.59L10 18l6-6-6-6-1.41 1.41L13.17 12z"/>';
      collapseBtn.parentElement!.title = "Expand Sidebar";

      // Create hover tooltip for collapsed state
      this.element.title = "WASM Components - Click to expand";

      // Create floating expand button functionality
      this.createFloatingExpandButton();
    }

    // Dispatch collapse event for other components to listen to
    window.dispatchEvent(
      new CustomEvent("sidebarToggle", {
        detail: { collapsed: !isCollapsed },
      }),
    );
  }

  public getElement(): HTMLElement {
    return this.element;
  }

  public getWidth(): number {
    return this.element.offsetWidth;
  }

  public setWidth(width: number): void {
    const newWidth = Math.max(
      this.config.minWidth,
      Math.min(this.config.maxWidth, width),
    );
    this.element.style.width = `${newWidth}px`;
  }

  public isCollapsed(): boolean {
    return this.element.classList.contains("collapsed");
  }

  private createFloatingExpandButton(): void {
    // No floating button needed - sidebar remains accessible in collapsed state
    // The sidebar itself can be clicked to expand
    const sidebar = this.element;

    // Add click handler to entire sidebar when collapsed
    const expandHandler = (e: MouseEvent) => {
      if (this.element.classList.contains("collapsed")) {
        // Only expand if clicking on the sidebar itself, not buttons
        const target = e.target as HTMLElement;
        if (!target.closest(".sidebar-collapse-btn")) {
          this.toggleCollapse();
        }
      }
    };

    sidebar.removeEventListener("click", expandHandler);
    sidebar.addEventListener("click", expandHandler);

    // Add hover effect for collapsed sidebar
    if (this.element.classList.contains("collapsed")) {
      sidebar.style.cursor = "pointer";
      sidebar.addEventListener("mouseenter", () => {
        if (this.element.classList.contains("collapsed")) {
          sidebar.style.background = "var(--bg-tertiary, #1C2333)";
        }
      });
      sidebar.addEventListener("mouseleave", () => {
        if (this.element.classList.contains("collapsed")) {
          sidebar.style.background = this.config.backgroundColor;
        }
      });
    }
  }

  private removeFloatingExpandButton(): void {
    // Remove hover effects and click handlers from sidebar when expanded
    const sidebar = this.element;
    sidebar.style.cursor = "default";
    sidebar.title = "";

    // Clone and replace to remove all event listeners
    const newSidebar = sidebar.cloneNode(true) as HTMLElement;
    sidebar.parentNode?.replaceChild(newSidebar, sidebar);
    this.element = newSidebar;

    // Re-setup necessary event listeners
    this.setupCollapseButton();
  }

  private setupCollapseButton(): void {
    const collapseBtn = this.element.querySelector(
      ".sidebar-collapse-btn",
    ) as HTMLButtonElement;
    if (collapseBtn) {
      collapseBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.toggleCollapse();
      });

      // Add hover effects to button
      collapseBtn.addEventListener("mouseenter", () => {
        collapseBtn.style.background = "var(--bg-secondary, #151B2C)";
        collapseBtn.style.color = "var(--text-primary, #E6EDF3)";
        collapseBtn.style.borderColor = "var(--accent-wasm, #654FF0)";
      });

      collapseBtn.addEventListener("mouseleave", () => {
        collapseBtn.style.background = "var(--bg-primary, #0F1419)";
        collapseBtn.style.color = "var(--text-secondary, #7D8590)";
        collapseBtn.style.borderColor = "var(--border-color, #2A3441)";
      });
    }
  }

  private addResponsiveStyles(): void {
    const style = document.createElement("style");
    style.id = "sidebar-responsive-styles";

    // Remove existing styles if any
    const existingStyle = document.getElementById("sidebar-responsive-styles");
    if (existingStyle) {
      existingStyle.remove();
    }

    style.textContent = `
            /* Sidebar responsive styles */
            .modern-sidebar.collapsed {
                width: 60px !important;
            }

            .modern-sidebar.collapsed .sidebar-content {
                opacity: 0;
                pointer-events: none;
                transition: opacity 200ms ease;
            }

            .modern-sidebar.collapsed .sidebar-title-text {
                opacity: 0;
                transition: opacity 200ms ease;
            }

            .modern-sidebar .sidebar-content {
                opacity: 1;
                pointer-events: auto;
                transition: opacity 200ms ease;
            }

            .modern-sidebar .sidebar-title-text {
                opacity: 1;
                transition: opacity 200ms ease;
            }

            /* Custom scrollbar for sidebar content */
            .modern-sidebar .sidebar-content::-webkit-scrollbar {
                width: 6px;
            }

            .modern-sidebar .sidebar-content::-webkit-scrollbar-track {
                background: var(--bg-primary, #0F1419);
                border-radius: 3px;
            }

            .modern-sidebar .sidebar-content::-webkit-scrollbar-thumb {
                background: var(--border-color, #2A3441);
                border-radius: 3px;
            }

            .modern-sidebar .sidebar-content::-webkit-scrollbar-thumb:hover {
                background: var(--accent-wasm, #654FF0);
            }
        `;

    document.head.appendChild(style);
  }
}
