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
            width: 300,
            minWidth: 200,
            maxWidth: 500,
            resizable: true,
            backgroundColor: 'var(--bg-secondary, #151B2C)',
            borderColor: 'var(--border, #30363D)',
            animationDuration: 300,
            ...config
        };
        
        this.element = this.createElement();
        container.appendChild(this.element);
        
        if (this.config.resizable) {
            this.setupResize();
        }
    }
    
    private createElement(): HTMLElement {
        const sidebar = document.createElement('div');
        sidebar.className = 'modern-sidebar';
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
                padding: 16px;
                border-bottom: 1px solid ${this.config.borderColor};
                display: flex;
                align-items: center;
                justify-content: space-between;
            ">
                <h3 style="
                    margin: 0;
                    font-size: 16px;
                    font-weight: 600;
                    color: var(--text-primary, #E6EDF3);
                ">Components</h3>
                <button class="sidebar-collapse-btn" style="
                    background: none;
                    border: none;
                    color: var(--text-secondary, #7D8590);
                    cursor: pointer;
                    padding: 8px;
                    border-radius: 4px;
                    transition: all 0.2s ease;
                    min-width: 32px;
                    min-height: 32px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                " title="Collapse Sidebar">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/>
                    </svg>
                </button>
            </div>
            <div class="sidebar-content" style="
                flex: 1;
                overflow-y: auto;
                overflow-x: hidden;
                padding: 8px;
            "></div>
        `;
        
        // Setup collapse button
        const collapseBtn = sidebar.querySelector('.sidebar-collapse-btn') as HTMLButtonElement;
        collapseBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            console.log('Sidebar collapse button clicked, current state:', this.element.classList.contains('collapsed'));
            this.toggleCollapse();
        });
        
        // Add double-click to expand when collapsed (backup method)
        sidebar.addEventListener('dblclick', (_e) => {
            if (this.element.classList.contains('collapsed')) {
                console.log('Double-click detected on collapsed sidebar - expanding');
                this.toggleCollapse();
            }
        });
        
        return sidebar;
    }
    
    private setupResize(): void {
        // Create resize handle
        this.resizeHandle = document.createElement('div');
        this.resizeHandle.className = 'sidebar-resize-handle';
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
        
        this.resizeHandle.addEventListener('mouseenter', () => {
            this.resizeHandle!.style.background = 'var(--accent-wasm, #654FF0)';
        });
        
        this.resizeHandle.addEventListener('mouseleave', () => {
            if (!this.isResizing) {
                this.resizeHandle!.style.background = 'transparent';
            }
        });
        
        this.element.appendChild(this.resizeHandle);
        
        // Resize event handlers
        this.resizeHandle.addEventListener('mousedown', (e) => this.startResize(e));
        document.addEventListener('mousemove', (e) => this.handleResize(e));
        document.addEventListener('mouseup', () => this.stopResize());
    }
    
    private startResize(e: MouseEvent): void {
        this.isResizing = true;
        this.startWidth = this.element.offsetWidth;
        this.startX = e.clientX;
        document.body.style.cursor = 'ew-resize';
        document.body.style.userSelect = 'none';
    }
    
    private handleResize(e: MouseEvent): void {
        if (!this.isResizing) return;
        
        const deltaX = e.clientX - this.startX;
        const newWidth = Math.max(
            this.config.minWidth,
            Math.min(this.config.maxWidth, this.startWidth + deltaX)
        );
        
        this.element.style.width = `${newWidth}px`;
    }
    
    private stopResize(): void {
        if (!this.isResizing) return;
        
        this.isResizing = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        
        if (this.resizeHandle) {
            this.resizeHandle.style.background = 'transparent';
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

    public hasSection(id: string): boolean {
        return this.sections.has(id);
    }

    private renderSections(): void {
        const content = this.element.querySelector('.sidebar-content') as HTMLElement;
        content.innerHTML = '';
        
        // Sort sections by order
        const sortedSections = Array.from(this.sections.values()).sort(
            (a, b) => (a.order ?? 999) - (b.order ?? 999)
        );
        
        sortedSections.forEach(section => {
            const sectionElement = this.createSectionElement(section);
            content.appendChild(sectionElement);
        });
    }
    
    private createSectionElement(section: SidebarSection): HTMLElement {
        const element = document.createElement('div');
        element.className = 'sidebar-section';
        element.dataset.sectionId = section.id;
        element.style.cssText = `
            margin-bottom: 16px;
            background: var(--bg-primary, #0F1419);
            border: 1px solid var(--border-color, #2A3441);
            border-radius: 8px;
            overflow: hidden;
            transition: all 0.3s ease;
        `;
        
        // Create header if title exists
        if (section.title) {
            const header = document.createElement('div');
            header.className = 'section-header';
            header.style.cssText = `
                padding: 12px 16px;
                background: var(--bg-tertiary, #1C2333);
                border-bottom: 1px solid var(--border-color, #2A3441);
                display: flex;
                align-items: center;
                justify-content: space-between;
                cursor: ${section.collapsible ? 'pointer' : 'default'};
                user-select: none;
            `;
            
            const titleContainer = document.createElement('div');
            titleContainer.style.cssText = `
                display: flex;
                align-items: center;
                gap: 8px;
            `;
            
            if (section.icon) {
                const icon = document.createElement('span');
                icon.textContent = section.icon;
                icon.style.fontSize = '18px';
                titleContainer.appendChild(icon);
            }
            
            const title = document.createElement('h4');
            title.textContent = section.title;
            title.style.cssText = `
                margin: 0;
                font-size: 14px;
                font-weight: 600;
                color: var(--text-primary, #E6EDF3);
            `;
            titleContainer.appendChild(title);
            
            header.appendChild(titleContainer);
            
            if (section.collapsible) {
                const chevron = document.createElement('div');
                chevron.className = 'section-chevron';
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
                    chevron.style.transform = 'rotate(-90deg)';
                }
                
                header.appendChild(chevron);
                header.addEventListener('click', () => this.toggleSection(section.id));
            }
            
            element.appendChild(header);
        }
        
        // Create content container
        const contentContainer = document.createElement('div');
        contentContainer.className = 'section-content';
        contentContainer.style.cssText = `
            padding: ${section.title ? '16px' : '0'};
            transition: max-height 0.3s ease, padding 0.3s ease;
            overflow: hidden;
            ${section.collapsed ? 'max-height: 0; padding: 0;' : 'max-height: 1000px;'}
        `;
        
        if (typeof section.content === 'string') {
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
        const sectionElement = this.element.querySelector(`[data-section-id="${id}"]`);
        if (sectionElement) {
            const content = sectionElement.querySelector('.section-content') as HTMLElement;
            const chevron = sectionElement.querySelector('.section-chevron') as HTMLElement;
            
            if (section.collapsed) {
                content.style.maxHeight = '0';
                content.style.padding = '0';
                chevron.style.transform = 'rotate(-90deg)';
            } else {
                content.style.maxHeight = '1000px';
                content.style.padding = '16px';
                chevron.style.transform = 'rotate(0deg)';
            }
        }
    }
    
    public toggleCollapse(): void {
        const isCollapsed = this.element.classList.contains('collapsed');
        console.log('toggleCollapse called, isCollapsed:', isCollapsed);
        
        if (isCollapsed) {
            // Expand sidebar
            console.log('Expanding sidebar to width:', this.config.width);
            this.element.classList.remove('collapsed');
            this.element.style.width = `${this.config.width}px`;
            document.body.classList.remove('sidebar-collapsed');
            
            // Show content after expansion starts
            setTimeout(() => {
                const content = this.element.querySelector('.sidebar-content') as HTMLElement;
                const header = this.element.querySelector('.sidebar-header h3') as HTMLElement;
                const collapseBtn = this.element.querySelector('.sidebar-collapse-btn svg') as HTMLElement;
                
                content.style.display = 'block';
                header.style.display = 'block';
                
                // Update collapse button icon to show collapse arrow
                collapseBtn.innerHTML = '<path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/>';
                collapseBtn.parentElement!.title = 'Collapse Sidebar';
                
                // Remove floating button when expanded
                this.removeFloatingExpandButton();
            }, 150);
        } else {
            // Collapse sidebar
            console.log('Collapsing sidebar to 50px');
            this.element.classList.add('collapsed');
            this.element.style.width = '50px';
            document.body.classList.add('sidebar-collapsed');
            
            // Hide content immediately but keep button visible
            const content = this.element.querySelector('.sidebar-content') as HTMLElement;
            const header = this.element.querySelector('.sidebar-header h3') as HTMLElement;
            const collapseBtn = this.element.querySelector('.sidebar-collapse-btn svg') as HTMLElement;
            const headerDiv = this.element.querySelector('.sidebar-header') as HTMLElement;
            
            content.style.display = 'none';
            header.style.display = 'none';
            // Keep header div visible so button stays accessible
            headerDiv.style.display = 'flex';
            
            // Update collapse button icon to show expand arrow
            collapseBtn.innerHTML = '<path d="M8.59 16.59L10 18l6-6-6-6-1.41 1.41L13.17 12z"/>';
            collapseBtn.parentElement!.title = 'Expand Sidebar';
            
            // Add a floating backup expand button
            this.createFloatingExpandButton();
        }
        
        // Dispatch collapse event for other components to listen to
        window.dispatchEvent(new CustomEvent('sidebarToggle', { 
            detail: { collapsed: !isCollapsed } 
        }));
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
            Math.min(this.config.maxWidth, width)
        );
        this.element.style.width = `${newWidth}px`;
    }
    
    public isCollapsed(): boolean {
        return this.element.classList.contains('collapsed');
    }
    
    private createFloatingExpandButton(): void {
        // Remove any existing floating button first
        this.removeFloatingExpandButton();
        
        const floatingBtn = document.createElement('button');
        floatingBtn.id = 'floating-expand-btn';
        floatingBtn.innerHTML = `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8.59 16.59L10 18l6-6-6-6-1.41 1.41L13.17 12z"/>
            </svg>
        `;
        floatingBtn.style.cssText = `
            position: fixed;
            top: 80px;
            left: 8px;
            width: 36px;
            height: 36px;
            background: var(--accent-wasm);
            border: none;
            border-radius: 8px;
            color: white;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 4px 12px rgba(101, 79, 240, 0.4);
            z-index: 10000;
            transition: all 0.3s ease;
            opacity: 0.8;
        `;
        
        floatingBtn.addEventListener('mouseenter', () => {
            floatingBtn.style.opacity = '1';
            floatingBtn.style.transform = 'scale(1.1)';
        });
        
        floatingBtn.addEventListener('mouseleave', () => {
            floatingBtn.style.opacity = '0.8';
            floatingBtn.style.transform = 'scale(1)';
        });
        
        floatingBtn.addEventListener('click', () => {
            console.log('Floating expand button clicked');
            this.toggleCollapse();
        });
        
        floatingBtn.title = 'Expand Sidebar';
        document.body.appendChild(floatingBtn);
    }
    
    private removeFloatingExpandButton(): void {
        const existingBtn = document.getElementById('floating-expand-btn');
        if (existingBtn) {
            existingBtn.remove();
        }
    }

    /**
     * Update the sidebar title based on the diagram type
     */
    public updateTitle(title: string, icon?: string): void {
        const titleElement = this.element.querySelector('.sidebar-header h3');
        if (titleElement) {
            titleElement.textContent = icon ? `${icon} ${title}` : title;
        }
    }
}