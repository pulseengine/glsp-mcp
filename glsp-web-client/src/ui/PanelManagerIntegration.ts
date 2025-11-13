/**
 * PanelManagerIntegration - Coordinates all panels with consistent behavior
 * Integrates sidebar, floating panels, and minimized panels bar
 */

import { MinimizedPanelsBar } from './MinimizedPanelsBar.js';
import { FloatingPanel } from './FloatingPanel.js';

export class PanelManagerIntegration {
    private minimizedBar: MinimizedPanelsBar;
    private panels: Map<string, FloatingPanel> = new Map();

    constructor() {
        // Create minimized panels bar at the top
        const appElement = document.querySelector('.app-container') || document.body;
        this.minimizedBar = new MinimizedPanelsBar(appElement as HTMLElement);

        // Setup global keyboard shortcuts
        this.setupKeyboardShortcuts();

        // Adjust canvas top position when minimized bar visibility changes
        window.addEventListener('minimizedBarVisibilityChange', (event: Event) => {
            const customEvent = event as CustomEvent<{ visible: boolean; height: number }>;
            this.adjustCanvasPosition(customEvent.detail.height);
        });
    }

    /**
     * Register a floating panel with the manager
     */
    public registerPanel(id: string, panel: FloatingPanel, icon?: string): void {
        this.panels.set(id, panel);

        // Override the panel's minimize behavior to use the minimized bar
        const originalMinimize = panel.minimizeToHeader.bind(panel);
        panel.minimizeToHeader = () => {
            this.minimizePanel(id, panel, icon);
        };
    }

    /**
     * Minimize a panel to the top bar
     */
    private minimizePanel(id: string, panel: FloatingPanel, icon?: string): void {
        const element = panel.getElement();
        const title = panel.getTitle();

        // Add minimize animation class
        element.classList.add('minimizing');

        // After animation, hide panel and add to bar
        setTimeout(() => {
            panel.hide();
            element.classList.remove('minimizing');

            // Add to minimized bar
            this.minimizedBar.addPanel({
                id,
                title,
                icon: icon || '📋',
                onRestore: () => {
                    this.restorePanel(id, panel);
                },
                onClose: () => {
                    // Optional: allow closing from minimized bar
                    this.panels.delete(id);
                }
            });
        }, 300); // Match animation duration
    }

    /**
     * Restore a panel from the minimized bar
     */
    private restorePanel(id: string, panel: FloatingPanel): void {
        const element = panel.getElement();

        // Show panel with restore animation
        element.classList.add('restoring');
        panel.show();

        setTimeout(() => {
            element.classList.remove('restoring');
        }, 300);
    }

    /**
     * Setup global keyboard shortcuts for panels
     */
    private setupKeyboardShortcuts(): void {
        document.addEventListener('keydown', (e) => {
            // Ctrl/Cmd + M = Minimize active panel
            if ((e.ctrlKey || e.metaKey) && e.key === 'm') {
                e.preventDefault();
                this.minimizeActivePanel();
            }

            // Ctrl/Cmd + Shift + M = Restore all panels
            if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'M') {
                e.preventDefault();
                this.restoreAllPanels();
            }
        });
    }

    private minimizeActivePanel(): void {
        // Find the topmost visible panel
        let topPanel: { id: string; panel: FloatingPanel; zIndex: number } | null = null;

        this.panels.forEach((panel, id) => {
            if (panel.isVisible()) {
                const zIndex = parseInt(panel.getElement().style.zIndex || '0');
                if (!topPanel || zIndex > topPanel.zIndex) {
                    topPanel = { id, panel, zIndex };
                }
            }
        });

        if (topPanel) {
            topPanel.panel.minimizeToHeader();
        }
    }

    private restoreAllPanels(): void {
        // This would restore all minimized panels
        // Implementation depends on tracking minimized panels
    }

    private adjustCanvasPosition(barHeight: number): void {
        const canvas = document.getElementById('diagram-canvas');
        if (canvas) {
            const parentContainer = canvas.parentElement;
            if (parentContainer) {
                // Adjust top margin/padding to account for minimized bar
                parentContainer.style.marginTop = `${barHeight}px`;
                parentContainer.style.transition = 'margin-top 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
            }
        }
    }

    public getMinimizedBar(): MinimizedPanelsBar {
        return this.minimizedBar;
    }

    public getAllPanels(): Map<string, FloatingPanel> {
        return this.panels;
    }

    /**
     * Minimize all panels at once (useful for "Focus Mode")
     */
    public minimizeAll(): void {
        this.panels.forEach((panel, id) => {
            if (panel.isVisible()) {
                panel.minimizeToHeader();
            }
        });
    }

    /**
     * Toggle focus mode (minimize all panels)
     */
    public toggleFocusMode(): void {
        const hasVisiblePanels = Array.from(this.panels.values()).some(p => p.isVisible());

        if (hasVisiblePanels) {
            this.minimizeAll();
        } else {
            this.restoreAllPanels();
        }
    }
}

// Global singleton instance
let panelManager: PanelManagerIntegration | null = null;

export function getPanelManager(): PanelManagerIntegration {
    if (!panelManager) {
        panelManager = new PanelManagerIntegration();
    }
    return panelManager;
}

export function initializePanelManager(): PanelManagerIntegration {
    panelManager = new PanelManagerIntegration();
    return panelManager;
}
