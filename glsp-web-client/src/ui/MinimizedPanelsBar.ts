/**
 * MinimizedPanelsBar - Top bar for minimized panels
 * Provides a consistent place for panels to minimize to
 */

export interface MinimizedPanel {
    id: string;
    title: string;
    icon?: string;
    color?: string;
    onRestore: () => void;
    onClose?: () => void;
}

export class MinimizedPanelsBar {
    private element: HTMLElement;
    private panels: Map<string, MinimizedPanel> = new Map();
    private isVisible: boolean = false;

    constructor(container: HTMLElement) {
        this.element = this.createBar();
        container.appendChild(this.element);
    }

    private createBar(): HTMLElement {
        const bar = document.createElement('div');
        bar.className = 'minimized-panels-bar';
        bar.style.cssText = `
            position: fixed;
            top: 60px; /* Below main header */
            left: 0;
            right: 0;
            height: 0;
            background: var(--bg-secondary, #151B2C);
            border-bottom: 1px solid var(--border, #30363D);
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 0 16px;
            overflow-x: auto;
            overflow-y: hidden;
            z-index: 900;
            transition: height 0.3s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.3s ease;
            opacity: 0;
            pointer-events: none;
        `;

        return bar;
    }

    private updateVisibility(): void {
        if (this.panels.size > 0 && !this.isVisible) {
            this.element.style.height = '48px';
            this.element.style.opacity = '1';
            this.element.style.pointerEvents = 'auto';
            this.isVisible = true;

            // Dispatch event to notify other components
            window.dispatchEvent(new CustomEvent('minimizedBarVisibilityChange', {
                detail: { visible: true, height: 48 }
            }));
        } else if (this.panels.size === 0 && this.isVisible) {
            this.element.style.height = '0';
            this.element.style.opacity = '0';
            this.element.style.pointerEvents = 'none';
            this.isVisible = false;

            window.dispatchEvent(new CustomEvent('minimizedBarVisibilityChange', {
                detail: { visible: false, height: 0 }
            }));
        }
    }

    public addPanel(panel: MinimizedPanel): void {
        if (this.panels.has(panel.id)) {
            return; // Already minimized
        }

        this.panels.set(panel.id, panel);
        const panelElement = this.createPanelElement(panel);
        this.element.appendChild(panelElement);
        this.updateVisibility();
    }

    public removePanel(id: string): void {
        const panelElement = this.element.querySelector(`[data-panel-id="${id}"]`);
        if (panelElement) {
            panelElement.remove();
        }
        this.panels.delete(id);
        this.updateVisibility();
    }

    private createPanelElement(panel: MinimizedPanel): HTMLElement {
        const element = document.createElement('div');
        element.className = 'minimized-panel';
        element.dataset.panelId = panel.id;
        element.style.cssText = `
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 8px 12px;
            background: var(--bg-tertiary, #1C2333);
            border: 1px solid var(--border, #30363D);
            border-radius: 6px;
            cursor: pointer;
            transition: all 0.2s ease;
            white-space: nowrap;
            font-size: 14px;
            color: var(--text-primary, #E6EDF3);
            user-select: none;
            min-width: 120px;
            max-width: 200px;
        `;

        // Icon
        if (panel.icon) {
            const icon = document.createElement('span');
            icon.textContent = panel.icon;
            icon.style.cssText = `
                font-size: 16px;
                flex-shrink: 0;
            `;
            element.appendChild(icon);
        }

        // Title
        const title = document.createElement('span');
        title.textContent = panel.title;
        title.style.cssText = `
            flex: 1;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        `;
        element.appendChild(title);

        // Restore button
        const restoreBtn = document.createElement('button');
        restoreBtn.className = 'panel-restore-btn';
        restoreBtn.title = 'Restore';
        restoreBtn.style.cssText = `
            background: none;
            border: none;
            color: var(--text-secondary, #7D8590);
            cursor: pointer;
            padding: 4px;
            border-radius: 4px;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.2s ease;
            flex-shrink: 0;
        `;
        restoreBtn.innerHTML = `
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19 7v4H5.83l3.58-3.59L8 6l-6 6 6 6 1.41-1.41L5.83 13H21V7z"/>
            </svg>
        `;

        restoreBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            panel.onRestore();
            this.removePanel(panel.id);
        });

        element.appendChild(restoreBtn);

        // Close button (optional)
        if (panel.onClose) {
            const closeBtn = document.createElement('button');
            closeBtn.className = 'panel-close-btn';
            closeBtn.title = 'Close';
            closeBtn.style.cssText = `
                background: none;
                border: none;
                color: var(--text-secondary, #7D8590);
                cursor: pointer;
                padding: 4px;
                border-radius: 4px;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: all 0.2s ease;
                flex-shrink: 0;
            `;
            closeBtn.innerHTML = `
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                </svg>
            `;

            closeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                panel.onClose!();
                this.removePanel(panel.id);
            });

            element.appendChild(closeBtn);
        }

        // Click to restore
        element.addEventListener('click', () => {
            panel.onRestore();
            this.removePanel(panel.id);
        });

        // Hover effects
        element.addEventListener('mouseenter', () => {
            element.style.background = 'var(--bg-primary, #0A0E1A)';
            element.style.borderColor = 'var(--accent-wasm, #654FF0)';
            element.style.transform = 'translateY(-2px)';
            element.style.boxShadow = '0 4px 12px rgba(101, 79, 240, 0.2)';
        });

        element.addEventListener('mouseleave', () => {
            element.style.background = 'var(--bg-tertiary, #1C2333)';
            element.style.borderColor = 'var(--border, #30363D)';
            element.style.transform = 'translateY(0)';
            element.style.boxShadow = 'none';
        });

        // Button hover effects
        [restoreBtn, closeBtn].filter(Boolean).forEach(btn => {
            if (!btn) return;

            btn.addEventListener('mouseenter', () => {
                btn.style.background = 'var(--bg-secondary, #151B2C)';
                btn.style.color = 'var(--text-primary, #E6EDF3)';
            });

            btn.addEventListener('mouseleave', () => {
                btn.style.background = 'none';
                btn.style.color = 'var(--text-secondary, #7D8590)';
            });
        });

        return element;
    }

    public hasPanel(id: string): boolean {
        return this.panels.has(id);
    }

    public getElement(): HTMLElement {
        return this.element;
    }

    public getHeight(): number {
        return this.isVisible ? 48 : 0;
    }

    public isShowing(): boolean {
        return this.isVisible;
    }
}
