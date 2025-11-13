/**
 * View Switcher Component
 * Provides UI for switching between different diagram view modes
 */

export interface ViewMode {
    id: string;
    label: string;
    icon: string;
    tooltip: string;
}

export class ViewSwitcher {
    private container: HTMLElement;
    private currentMode: string = 'component';
    private onModeChange?: (mode: string) => void;
    
    private viewModes: ViewMode[] = [
        {
            id: 'component',
            label: 'Component View',
            icon: '📦',
            tooltip: 'View WASM components and their connections'
        },
        {
            id: 'uml-interface',
            label: 'UML View',
            icon: '📐',
            tooltip: 'View components in UML-style class diagram format'
        },
        {
            id: 'wit-interface',
            label: 'WIT Interface',
            icon: '🔗',
            tooltip: 'View WIT interfaces with packages, functions, and types'
        },
        {
            id: 'wit-dependencies',
            label: 'Dependencies',
            icon: '🕸️',
            tooltip: 'View interface dependencies and relationships'
        }
    ];
    
    constructor() {
        this.container = this.createViewSwitcher();
    }
    
    private createViewSwitcher(): HTMLElement {
        const container = document.createElement('div');
        container.className = 'view-switcher';
        
        // Add view mode indicator
        const indicator = document.createElement('div');
        indicator.className = 'view-mode-indicator';
        indicator.innerHTML = `
            <span class="indicator-label">View:</span>
            <span class="indicator-mode">${this.getViewModeLabel(this.currentMode)}</span>
        `;
        container.appendChild(indicator);

        // Add return to component view button (shown when not in component view)
        const returnBtn = document.createElement('button');
        returnBtn.className = 'return-to-component-btn';
        returnBtn.innerHTML = '<span class="return-arrow">←</span> <span class="return-label">Back to Component View</span>';
        returnBtn.style.display = this.currentMode === 'component' ? 'none' : 'flex';
        returnBtn.onclick = () => this.switchMode('component');
        returnBtn.title = 'Return to the original component view';
        container.appendChild(returnBtn);

        // Add mode buttons
        this.viewModes.forEach(mode => {
            const button = document.createElement('button');
            button.className = `view-mode-btn ${mode.id === this.currentMode ? 'active' : ''}`;
            button.title = mode.tooltip;
            button.innerHTML = `
                <span class="view-mode-icon">${mode.icon}</span>
                <span class="view-mode-label">${mode.label}</span>
            `;

            button.onclick = () => this.switchMode(mode.id);
            container.appendChild(button);
        });

        // Add help tooltip button
        const helpBtn = this.createHelpTooltip();
        container.appendChild(helpBtn);

        this.addStyles();
        return container;
    }

    private createHelpTooltip(): HTMLElement {
        const helpBtn = document.createElement('button');
        helpBtn.className = 'view-mode-help';
        helpBtn.innerHTML = '?';
        helpBtn.title = `View Modes transform how you see your WASM components:\n\n• Component View: Original component connections\n• UML View: Transformed to UML class diagram\n• WIT Interface: Shows WIT type structure\n• Dependencies: Shows interface relationships\n\nNote: Switching views doesn't create new diagrams or lose data.`;

        return helpBtn;
    }
    
    private addStyles(): void {
        const style = document.createElement('style');
        style.textContent = `
            .view-switcher {
                display: flex;
                align-items: center;
                gap: 8px;
                background: var(--bg-tertiary);
                border: 1px solid var(--border);
                border-radius: var(--radius-md);
                padding: 4px 8px;
                margin: 0 16px;
            }

            .view-mode-indicator {
                display: flex;
                align-items: center;
                gap: 4px;
                padding: 4px 8px;
                background: var(--bg-secondary);
                border-radius: var(--radius-sm);
                border-left: 3px solid var(--accent-wasm);
                margin-right: 4px;
                transition: all 0.2s ease;
            }

            .view-mode-indicator.transformed-view {
                background: var(--accent-info, #58A6FF);
                color: white;
                border-left-color: white;
                font-weight: 600;
                padding: 6px 12px;
                box-shadow: 0 2px 8px rgba(88, 166, 255, 0.3);
            }

            .view-mode-indicator.transformed-view .indicator-label {
                color: rgba(255, 255, 255, 0.9);
            }

            .view-mode-indicator.transformed-view .indicator-mode {
                color: white;
            }

            .indicator-label {
                font-size: 11px;
                color: var(--text-secondary);
                font-weight: 600;
                text-transform: uppercase;
                letter-spacing: 0.5px;
            }

            .indicator-mode {
                font-size: 12px;
                color: var(--text-primary);
                font-weight: 500;
            }

            .return-to-component-btn {
                display: flex;
                align-items: center;
                gap: 6px;
                padding: 6px 12px;
                background: var(--accent-success, #3FB950);
                color: white;
                border: none;
                border-radius: var(--radius-sm);
                cursor: pointer;
                font-size: 13px;
                font-weight: 600;
                transition: all 0.2s ease;
                white-space: nowrap;
                margin-right: 8px;
            }

            .return-to-component-btn:hover {
                background: #4CC95F;
                transform: translateX(-2px);
            }

            .return-arrow {
                font-size: 14px;
                font-weight: bold;
            }

            .return-label {
                display: none;
            }

            @media (min-width: 900px) {
                .return-label {
                    display: inline;
                }
            }

            .view-mode-btn {
                display: flex;
                align-items: center;
                gap: 6px;
                padding: 6px 12px;
                background: transparent;
                border: 1px solid transparent;
                border-radius: var(--radius-sm);
                color: var(--text-secondary);
                cursor: pointer;
                transition: all 0.2s ease;
                font-size: 13px;
                font-weight: 500;
                white-space: nowrap;
            }
            
            .view-mode-btn:hover {
                background: var(--bg-secondary);
                color: var(--text-primary);
                border-color: var(--border);
            }
            
            .view-mode-btn.active {
                background: var(--accent-wasm);
                color: white;
                border-color: var(--accent-wasm);
            }
            
            .view-mode-icon {
                font-size: 16px;
            }
            
            .view-mode-label {
                display: none;
            }
            
            @media (min-width: 1200px) {
                .view-mode-label {
                    display: inline;
                }
            }

            .view-mode-help {
                width: 24px;
                height: 24px;
                border-radius: 50%;
                background: var(--accent-info, #58A6FF);
                color: white;
                border: none;
                cursor: help;
                font-size: 14px;
                font-weight: bold;
                display: flex;
                align-items: center;
                justify-content: center;
                margin-left: 4px;
                transition: all 0.2s ease;
                flex-shrink: 0;
            }

            .view-mode-help:hover {
                background: #79B8FF;
                transform: scale(1.1);
            }

            /* Compact mode for smaller screens */
            @media (max-width: 768px) {
                .view-switcher {
                    gap: 2px;
                    padding: 2px;
                }
                
                .view-mode-btn {
                    padding: 4px 8px;
                    font-size: 12px;
                }
                
                .view-mode-icon {
                    font-size: 14px;
                }
            }
        `;
        document.head.appendChild(style);
    }
    
    public switchMode(modeId: string): void {
        if (modeId === this.currentMode) return;

        console.log(`ViewSwitcher: Switching from ${this.currentMode} to ${modeId}`);

        this.currentMode = modeId;
        
        // Update button states
        this.container.querySelectorAll('.view-mode-btn').forEach(btn => {
            const mode = this.viewModes.find(m => 
                btn.querySelector('.view-mode-label')?.textContent === m.label
            );
            btn.classList.toggle('active', mode?.id === modeId);
        });

        // Update view mode indicator
        const indicator = this.container.querySelector('.view-mode-indicator');
        const indicatorMode = this.container.querySelector('.indicator-mode');
        if (indicatorMode) {
            indicatorMode.textContent = this.getViewModeLabel(modeId);
        }

        // Add visual badge for transformed views
        if (indicator) {
            if (modeId === 'component') {
                indicator.classList.remove('transformed-view');
            } else {
                indicator.classList.add('transformed-view');
            }
        }

        // Update return button visibility
        const returnBtn = this.container.querySelector('.return-to-component-btn') as HTMLElement;
        if (returnBtn) {
            returnBtn.style.display = modeId === 'component' ? 'none' : 'flex';
        }

        // Show visual feedback that mode is changing
        const activeBtn = this.container.querySelector('.view-mode-btn.active') as HTMLElement;
        if (activeBtn) {
            activeBtn.style.opacity = '0.6';
            setTimeout(() => {
                activeBtn.style.opacity = '1';
            }, 300);
        }
        
        // Notify listener (AppController.handleViewModeChange)
        if (this.onModeChange) {
            console.log(`ViewSwitcher: Notifying mode change handler for ${modeId}`);
            this.onModeChange(modeId);
        }
    }

    private getViewModeLabel(modeId: string): string {
        const mode = this.viewModes.find(m => m.id === modeId);
        return mode ? mode.label : modeId;
    }
    
    public setModeChangeHandler(handler: (mode: string) => void): void {
        this.onModeChange = handler;
    }
    
    public getElement(): HTMLElement {
        return this.container;
    }
    
    public getCurrentMode(): string {
        return this.currentMode;
    }
    
    public setMode(modeId: string): void {
        if (this.viewModes.find(m => m.id === modeId)) {
            this.switchMode(modeId);
        }
    }
    
    public showForDiagramType(diagramType: string): void {
        // Show/hide view switcher based on diagram type
        // ONLY show for wasm-component (the only type that actually supports view transformations)
        if (diagramType === 'wasm-component') {
            this.container.style.display = 'flex';
        } else {
            this.container.style.display = 'none';
        }
    }
}