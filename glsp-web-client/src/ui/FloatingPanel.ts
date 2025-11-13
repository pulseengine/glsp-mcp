export interface FloatingPanelConfig {
    title: string;
    width?: number;
    height?: number;
    minWidth?: number;
    minHeight?: number;
    maxWidth?: number;
    maxHeight?: number;
    initialPosition?: { x: number; y: number };
    resizable?: boolean;
    draggable?: boolean;
    closable?: boolean;
    collapsible?: boolean;
    className?: string;
    zIndex?: number;
}

export interface FloatingPanelEvents {
    onClose?: () => void;
    onCollapse?: (collapsed: boolean) => void;
    onMove?: (position: { x: number; y: number }) => void;
    onResize?: (size: { width: number; height: number }) => void;
    onMinimizeToHeader?: () => void;
}

export abstract class FloatingPanel {
    protected element: HTMLElement;
    protected headerElement!: HTMLElement;
    protected contentElement!: HTMLElement;
    protected config: Required<FloatingPanelConfig>;
    protected events: FloatingPanelEvents;
    protected isCollapsed: boolean = false;
    protected isDragging: boolean = false;
    protected isResizing: boolean = false;
    protected originalHeight: number = 0;
    
    private dragStartPos: { x: number; y: number } = { x: 0, y: 0 };
    private elementStartPos: { x: number; y: number } = { x: 0, y: 0 };

    constructor(config: FloatingPanelConfig, events: FloatingPanelEvents = {}) {
        this.config = {
            width: 400,
            height: 300,
            minWidth: 200,
            minHeight: 150,
            maxWidth: 800,
            maxHeight: 600,
            initialPosition: { x: 100, y: 100 },
            resizable: true,
            draggable: true,
            closable: true,
            collapsible: true,
            className: '',
            zIndex: 1000,
            ...config
        };
        this.events = events;
        
        this.element = this.createElement();
        this.setupEventHandlers();
        this.applyInitialStyles();
    }

    private createElement(): HTMLElement {
        const panel = document.createElement('div');
        panel.className = `floating-panel ${this.config.className}`;
        
        panel.innerHTML = `
            <div class="floating-panel-header">
                <div class="floating-panel-title">${this.config.title}</div>
                <div class="floating-panel-controls">
                    ${this.config.collapsible ? '<button class="panel-btn collapse-btn" title="Collapse">−</button>' : ''}
                    ${this.config.closable ? '<button class="panel-btn close-btn" title="Minimize to Header">×</button>' : ''}
                </div>
            </div>
            <div class="floating-panel-content">
                ${this.createContent()}
            </div>
            ${this.config.resizable ? '<div class="floating-panel-resize-handle"></div>' : ''}
        `;

        this.headerElement = panel.querySelector('.floating-panel-header') as HTMLElement;
        this.contentElement = panel.querySelector('.floating-panel-content') as HTMLElement;

        return panel;
    }

    private applyInitialStyles(): void {
        const style = this.element.style;
        style.position = 'fixed';
        style.width = `${this.config.width}px`;
        style.height = `${this.config.height}px`;
        style.left = `${this.config.initialPosition.x}px`;
        style.top = `${this.config.initialPosition.y}px`;
        style.zIndex = this.config.zIndex.toString();
        style.backgroundColor = 'var(--bg-secondary, #151B2C)';
        style.border = '1px solid var(--border-color, #2A3441)';
        style.borderRadius = '8px';
        style.boxShadow = '0 10px 30px rgba(0, 0, 0, 0.3)';
        style.display = 'none';
        style.fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        style.color = 'var(--text-primary, #E5E9F0)';
        style.overflow = 'hidden';
        style.boxSizing = 'border-box';
        // style.transition = 'height 0.3s ease'; // DISABLED: Causes blur in dialogs

        if (this.config.resizable) {
            style.resize = 'both';
            style.minWidth = `${this.config.minWidth}px`;
            style.minHeight = `${this.config.minHeight}px`;
            style.maxWidth = `${this.config.maxWidth}px`;
            style.maxHeight = `${this.config.maxHeight}px`;
        }

        // Header styles
        this.headerElement.style.cssText = `
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 12px 16px;
            background: var(--bg-tertiary, #1C2333);
            border-bottom: 1px solid var(--border-color, #2A3441);
            cursor: ${this.config.draggable ? 'move' : 'default'};
            user-select: none;
        `;

        // Title styles
        const titleElement = this.element.querySelector('.floating-panel-title') as HTMLElement;
        titleElement.style.cssText = `
            font-weight: 600;
            font-size: 14px;
            color: var(--text-primary, #E5E9F0);
        `;

        // Controls styles
        const controlsElement = this.element.querySelector('.floating-panel-controls') as HTMLElement;
        controlsElement.style.cssText = `
            display: flex;
            gap: 8px;
        `;

        // Button styles
        const buttons = this.element.querySelectorAll('.panel-btn');
        buttons.forEach(button => {
            const btn = button as HTMLElement;
            btn.style.cssText = `
                background: none;
                border: none;
                color: var(--text-secondary, #A0A9BA);
                font-size: 16px;
                width: 24px;
                height: 24px;
                border-radius: 4px;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: all 0.2s ease;
            `;

            btn.addEventListener('mouseenter', () => {
                btn.style.backgroundColor = 'var(--bg-primary, #0F1419)';
                btn.style.color = 'var(--text-primary, #E5E9F0)';
            });

            btn.addEventListener('mouseleave', () => {
                btn.style.backgroundColor = 'transparent';
                btn.style.color = 'var(--text-secondary, #A0A9BA)';
            });
        });

        // Content styles
        this.contentElement.style.cssText = `
            padding: 16px;
            height: calc(100% - 49px);
            overflow-y: auto;
            overflow-x: hidden;
            box-sizing: border-box;
        `;

        // Resize handle styles
        if (this.config.resizable) {
            const resizeHandle = this.element.querySelector('.floating-panel-resize-handle') as HTMLElement;
            if (resizeHandle) {
                resizeHandle.style.cssText = `
                    position: absolute;
                    bottom: 0;
                    right: 0;
                    width: 16px;
                    height: 16px;
                    cursor: se-resize;
                    background: linear-gradient(-45deg, transparent 30%, var(--border-color, #2A3441) 30%, var(--border-color, #2A3441) 40%, transparent 40%, transparent 60%, var(--border-color, #2A3441) 60%, var(--border-color, #2A3441) 70%, transparent 70%);
                `;
            }
        }
    }

    private setupEventHandlers(): void {
        // Close button
        const closeBtn = this.element.querySelector('.close-btn') as HTMLButtonElement;
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                console.log('Close button clicked for', this.config.title);
                this.minimizeToHeader();
            });
        }

        // Collapse button
        const collapseBtn = this.element.querySelector('.collapse-btn') as HTMLButtonElement;
        if (collapseBtn) {
            collapseBtn.addEventListener('click', () => {
                this.toggleCollapse();
            });
        }

        // Double-click title to collapse
        this.headerElement?.querySelector('.floating-panel-title')?.addEventListener('dblclick', () => {
            if (this.config.collapsible) {
                this.toggleCollapse();
            }
        });

        // Dragging
        if (this.config.draggable) {
            this.headerElement.addEventListener('mousedown', (e) => {
                if ((e.target as HTMLElement).closest('.panel-btn')) return;
                this.startDragging(e);
            });
        }

        // Resizing
        if (this.config.resizable) {
            const resizeHandle = this.element.querySelector('.floating-panel-resize-handle') as HTMLElement;
            if (resizeHandle) {
                resizeHandle.addEventListener('mousedown', (e) => {
                    this.startResizing(e);
                });
            }
        }

        // Global mouse events
        document.addEventListener('mousemove', (e) => {
            if (this.isDragging) {
                this.handleDragging(e);
            } else if (this.isResizing) {
                this.handleResizing(e);
            }
        });

        document.addEventListener('mouseup', () => {
            this.stopDragging();
            this.stopResizing();
        });

        // Bring to front on click
        this.element.addEventListener('mousedown', () => {
            this.bringToFront();
        });
    }

    private startDragging(e: MouseEvent): void {
        this.isDragging = true;
        this.dragStartPos = { x: e.clientX, y: e.clientY };
        this.elementStartPos = {
            x: parseInt(this.element.style.left),
            y: parseInt(this.element.style.top)
        };
        this.element.style.userSelect = 'none';
        document.body.style.userSelect = 'none';
    }

    private handleDragging(e: MouseEvent): void {
        if (!this.isDragging) return;

        const deltaX = e.clientX - this.dragStartPos.x;
        const deltaY = e.clientY - this.dragStartPos.y;
        
        const newX = Math.max(0, Math.min(
            window.innerWidth - this.element.offsetWidth,
            this.elementStartPos.x + deltaX
        ));
        const newY = Math.max(0, Math.min(
            window.innerHeight - this.element.offsetHeight,
            this.elementStartPos.y + deltaY
        ));

        this.element.style.left = `${newX}px`;
        this.element.style.top = `${newY}px`;

        this.events.onMove?.({ x: newX, y: newY });
    }

    private stopDragging(): void {
        if (!this.isDragging) return;
        this.isDragging = false;
        this.element.style.userSelect = '';
        document.body.style.userSelect = '';
    }

    private startResizing(e: MouseEvent): void {
        e.preventDefault();
        this.isResizing = true;
        this.dragStartPos = { x: e.clientX, y: e.clientY };
    }

    private handleResizing(e: MouseEvent): void {
        if (!this.isResizing) return;

        const deltaX = e.clientX - this.dragStartPos.x;
        const deltaY = e.clientY - this.dragStartPos.y;
        
        const currentWidth = this.element.offsetWidth;
        const currentHeight = this.element.offsetHeight;
        
        const newWidth = Math.max(this.config.minWidth, Math.min(this.config.maxWidth, currentWidth + deltaX));
        const newHeight = Math.max(this.config.minHeight, Math.min(this.config.maxHeight, currentHeight + deltaY));

        this.element.style.width = `${newWidth}px`;
        this.element.style.height = `${newHeight}px`;

        this.dragStartPos = { x: e.clientX, y: e.clientY };
        this.events.onResize?.({ width: newWidth, height: newHeight });
    }

    private stopResizing(): void {
        this.isResizing = false;
    }

    private bringToFront(): void {
        // Find highest z-index among all floating panels (including derived classes)
        const panels = document.querySelectorAll('.floating-panel, .ai-assistant-panel, .wasm-component-panel, .component-upload-panel');
        let maxZ = 1000; // Base z-index for floating panels
        
        panels.forEach(panel => {
            if (panel !== this.element) { // Don't compare with self
                const z = parseInt((panel as HTMLElement).style.zIndex || '0');
                if (z >= maxZ) maxZ = z;
            }
        });
        
        // Set this panel's z-index to be above all others
        this.element.style.zIndex = (maxZ + 1).toString();
    }

    public show(): void {
        this.element.style.display = 'block';
        this.element.classList.remove('minimizing');
        this.element.classList.add('restoring');

        setTimeout(() => {
            this.element.classList.remove('restoring');
        }, 300);

        this.bringToFront();
        document.body.appendChild(this.element);
        this.onShow();
    }

    public hide(): void {
        this.element.classList.add('minimizing');

        setTimeout(() => {
            this.element.style.display = 'none';
            this.element.classList.remove('minimizing');
        }, 300);

        this.onHide();
    }

    public close(): void {
        this.hide();
        this.events.onClose?.();
    }

    public minimizeToHeader(): void {
        console.log('FloatingPanel: minimizeToHeader called for', this.config.title);
        this.hide();
        if (this.events.onMinimizeToHeader) {
            console.log('FloatingPanel: calling onMinimizeToHeader callback');
            this.events.onMinimizeToHeader();
        } else {
            console.warn('FloatingPanel: onMinimizeToHeader callback not set for', this.config.title);
        }
    }

    public toggleCollapse(): void {
        this.isCollapsed = !this.isCollapsed;
        const collapseBtn = this.element.querySelector('.collapse-btn') as HTMLButtonElement;
        const resizeHandle = this.element.querySelector('.floating-panel-resize-handle') as HTMLElement;
        
        if (this.isCollapsed) {
            // Store current height before collapsing
            this.originalHeight = this.element.offsetHeight;
            
            // Hide content
            this.contentElement.style.display = 'none';
            
            // Set to header height only
            this.element.style.height = '49px'; // Header height (padding + content + border)
            this.element.style.minHeight = '49px';
            this.element.style.resize = 'none'; // Disable resize when collapsed
            
            // Hide resize handle
            if (resizeHandle) {
                resizeHandle.style.display = 'none';
            }
            
            // Update button
            if (collapseBtn) collapseBtn.textContent = '+';
        } else {
            // Restore content
            this.contentElement.style.display = 'block';
            
            // Restore original height
            this.element.style.height = `${this.originalHeight || this.config.height}px`;
            this.element.style.minHeight = `${this.config.minHeight}px`;
            
            // Re-enable resize if configured
            if (this.config.resizable) {
                this.element.style.resize = 'both';
                // Show resize handle
                if (resizeHandle) {
                    resizeHandle.style.display = 'block';
                }
            }
            
            // Update button
            if (collapseBtn) collapseBtn.textContent = '−';
        }

        this.events.onCollapse?.(this.isCollapsed);
    }

    public setTitle(title: string): void {
        const titleElement = this.element.querySelector('.floating-panel-title') as HTMLElement;
        titleElement.textContent = title;
    }

    public getElement(): HTMLElement {
        return this.element;
    }

    public getContentElement(): HTMLElement {
        return this.contentElement;
    }

    public updatePosition(x: number, y: number): void {
        this.element.style.left = `${x}px`;
        this.element.style.top = `${y}px`;
    }

    public updateSize(width: number, height: number): void {
        this.element.style.width = `${width}px`;
        this.element.style.height = `${height}px`;
        this.config.width = width;
        this.config.height = height;
    }

    public getPosition(): { x: number; y: number } {
        return {
            x: parseInt(this.element.style.left),
            y: parseInt(this.element.style.top)
        };
    }

    public getSize(): { width: number; height: number } {
        return {
            width: this.element.offsetWidth,
            height: this.element.offsetHeight
        };
    }

    public isVisible(): boolean {
        return this.element.style.display !== 'none';
    }

    public getTitle(): string {
        return this.config.title;
    }

    // Abstract method to be implemented by subclasses
    protected abstract createContent(): string;

    // Optional methods for subclasses to override
    protected onShow(): void {}
    protected onHide(): void {}
    protected onContentUpdate(): void {}
}