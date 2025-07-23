import { FloatingPanel, FloatingPanelConfig, FloatingPanelEvents } from './FloatingPanel.js';
import { McpClient } from '../mcp/client.js';
import { WasmComponentInfo } from '../types/wasm-component.js';

export interface DragEventData {
    componentName: string;
    componentInfo: WasmComponentInfo;
}

export class WasmComponentPanel extends FloatingPanel {
    private mcpClient: McpClient;
    private components: WasmComponentInfo[] = [];
    private dragData?: DragEventData;
    private isLoading: boolean = false;
    private onComponentUpload?: () => void;
    private onLoadComponent?: (elementId: string) => Promise<void>;
    private onUnloadComponent?: (elementId: string) => Promise<void>;
    private onTranspileComponent?: (elementId: string) => Promise<void>;
    private onReleaseComponent?: (elementId: string) => Promise<void>;

    constructor(
        mcpClient: McpClient,
        onComponentUpload?: () => void,
        config: Partial<FloatingPanelConfig> = {},
        events: FloatingPanelEvents = {}
    ) {
        const defaultConfig: FloatingPanelConfig = {
            title: 'Runtime WASM Components (Client-side)',
            width: 350,
            height: 500,
            minWidth: 280,
            minHeight: 300,
            initialPosition: { x: 20, y: 100 },
            resizable: true,
            draggable: true,
            closable: true,
            collapsible: true,
            className: 'wasm-component-panel',
            zIndex: 1000,
            ...config
        };

        super(defaultConfig, events);
        
        this.mcpClient = mcpClient;
        this.onComponentUpload = onComponentUpload;
        this.setupComponentEventHandlers();
    }

    protected createContent(): string {
        return `
            <div class="wasm-panel-toolbar">
                <button class="upload-component-btn" title="Upload WASM Component">
                    📁 Upload Component
                </button>
                <button class="refresh-components-btn" title="Refresh component list">
                    🔄 Refresh
                </button>
            </div>
            
            <!-- Components in Diagram Section -->
            <div class="diagram-components-section">
                <div class="section-header">
                    <h4>Components in Diagram</h4>
                    <span class="diagram-component-count">0</span>
                </div>
                <div class="diagram-components-list">
                    <div class="empty-state">
                        <div class="empty-icon">📋</div>
                        <p>No components in current diagram</p>
                        <p class="empty-hint">Drag components from sidebar to add them</p>
                    </div>
                </div>
            </div>

            <!-- WIT Analysis Section -->
            <div class="wit-analysis-section" style="margin-top: 20px;">
                <div class="section-header">
                    <h4>WIT Interface Analysis</h4>
                    <button class="analyze-wit-btn" title="Analyze WIT interfaces">🔍 Analyze</button>
                </div>
                <div class="wit-analysis-content">
                    <div class="empty-state">
                        <div class="empty-icon">🔍</div>
                        <p>No WIT analysis available</p>
                        <p class="empty-hint">Click 'Analyze' to examine component interfaces</p>
                    </div>
                </div>
            </div>
            
            <!-- Transpiled Components Section -->
            <div class="transpiled-components-section" style="margin-top: 20px;">
                <div class="section-header">
                    <h4>Transpiled Components</h4>
                    <span class="transpiled-component-count">0</span>
                </div>
                <div class="transpiled-components-list">
                    <div class="empty-state">
                        <div class="empty-icon">⚡</div>
                        <p>No transpiled components</p>
                        <p class="empty-hint">Load and transpile components to enable interfaces</p>
                    </div>
                </div>
            </div>

            <!-- Test Harness Section -->
            <div class="test-harness-section" style="margin-top: 20px;">
                <div class="section-header">
                    <h4>Interface Test Harnesses</h4>
                    <span class="test-harness-count">0</span>
                </div>
                <div class="test-harness-list">
                    <div class="empty-state">
                        <div class="empty-icon">🧪</div>
                        <p>No test harnesses available</p>
                        <p class="empty-hint">Transpile components to generate test harnesses</p>
                    </div>
                </div>
            </div>

            <!-- Uploaded Components Section -->
            <div class="uploaded-components-section" style="margin-top: 20px;">
                <div class="section-header">
                    <h4>Uploaded Components</h4>
                    <span class="uploaded-component-count">0</span>
                </div>
                <div class="uploaded-components-list">
                    <div class="empty-state">
                        <div class="empty-icon">📦</div>
                        <p>No uploaded components</p>
                        <p class="empty-hint">Use the Upload button to add custom WASM files</p>
                    </div>
                </div>
            </div>
        `;
    }

    private setupComponentEventHandlers(): void {
        // Upload button
        const uploadBtn = this.contentElement.querySelector('.upload-component-btn') as HTMLButtonElement;
        uploadBtn?.addEventListener('click', () => {
            this.onComponentUpload?.();
        });

        // Refresh button
        const refreshBtn = this.contentElement.querySelector('.refresh-components-btn') as HTMLButtonElement;
        refreshBtn?.addEventListener('click', () => {
            this.loadComponents();
        });

        // WIT Analysis button
        const witAnalyzeBtn = this.contentElement.querySelector('.analyze-wit-btn') as HTMLButtonElement;
        witAnalyzeBtn?.addEventListener('click', () => {
            this.analyzeWitInterfaces();
        });

        // Retry button (initially hidden)
        const retryBtn = this.contentElement.querySelector('.retry-btn') as HTMLButtonElement;
        retryBtn?.addEventListener('click', () => {
            this.loadComponents();
        });

        // Style buttons
        this.styleButtons();
    }

    private styleButtons(): void {
        const uploadBtn = this.contentElement.querySelector('.upload-component-btn') as HTMLButtonElement;
        const refreshBtn = this.contentElement.querySelector('.refresh-components-btn') as HTMLButtonElement;

        const buttonStyle = `
            padding: 8px 12px;
            border: none;
            border-radius: 6px;
            font-size: 13px;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.2s ease;
            display: flex;
            align-items: center;
            gap: 6px;
        `;

        if (uploadBtn) {
            uploadBtn.style.cssText = buttonStyle + `
                background: linear-gradient(90deg, #4A9EFF, #00D4AA);
                color: white;
                flex: 1;
            `;
            uploadBtn.addEventListener('mouseenter', () => {
                uploadBtn.style.transform = 'translateY(-1px)';
                uploadBtn.style.boxShadow = '0 4px 12px rgba(74, 158, 255, 0.4)';
            });
            uploadBtn.addEventListener('mouseleave', () => {
                uploadBtn.style.transform = 'translateY(0)';
                uploadBtn.style.boxShadow = 'none';
            });
        }

        if (refreshBtn) {
            refreshBtn.style.cssText = buttonStyle + `
                background: var(--bg-primary, #0F1419);
                color: var(--text-secondary, #A0A9BA);
                border: 1px solid var(--border-color, #2A3441);
                min-width: 40px;
                justify-content: center;
            `;
            refreshBtn.addEventListener('mouseenter', () => {
                refreshBtn.style.backgroundColor = 'var(--bg-tertiary, #1C2333)';
                refreshBtn.style.color = 'var(--text-primary, #E5E9F0)';
            });
            refreshBtn.addEventListener('mouseleave', () => {
                refreshBtn.style.backgroundColor = 'var(--bg-primary, #0F1419)';
                refreshBtn.style.color = 'var(--text-secondary, #A0A9BA)';
            });
        }

        // Toolbar styles
        const toolbar = this.contentElement.querySelector('.wasm-panel-toolbar') as HTMLElement;
        if (toolbar) {
            toolbar.style.cssText = `
                display: flex;
                gap: 8px;
                margin-bottom: 20px;
            `;
        }

        // Section styles
        const sections = this.contentElement.querySelectorAll('.section-header');
        sections.forEach(section => {
            const header = section as HTMLElement;
            header.style.cssText = `
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 12px;
                padding-bottom: 8px;
                border-bottom: 1px solid var(--border-color, #2A3441);
            `;

            const h4 = header.querySelector('h4') as HTMLElement;
            if (h4) {
                h4.style.cssText = `
                    margin: 0;
                    font-size: 14px;
                    font-weight: 600;
                    color: var(--text-primary, #E5E9F0);
                `;
            }

            const count = header.querySelector('span') as HTMLElement;
            if (count) {
                count.style.cssText = `
                    background: var(--bg-primary, #0F1419);
                    color: var(--text-secondary, #A0A9BA);
                    padding: 2px 8px;
                    border-radius: 12px;
                    font-size: 12px;
                    font-weight: 500;
                `;
            }
        });
    }

    public async loadComponents(): Promise<void> {
        if (this.isLoading) return;

        this.isLoading = true;
        this.showLoadingState();

        try {
            const timeoutDuration = 10000; // 10 seconds
            let timeoutId: number;
            let countdownId: number;
            
            const timeoutPromise = new Promise<never>((_, reject) => {
                let remainingTime = timeoutDuration / 1000;
                const timeoutTextElement = this.contentElement.querySelector('.timeout-text') as HTMLElement;
                const timeoutProgressElement = this.contentElement.querySelector('.timeout-progress') as HTMLElement;

                countdownId = window.setInterval(() => {
                    remainingTime--;
                    if (timeoutTextElement) {
                        timeoutTextElement.textContent = `${remainingTime}s`;
                    }
                    if (timeoutProgressElement) {
                        const progress = ((timeoutDuration / 1000 - remainingTime) / (timeoutDuration / 1000)) * 100;
                        timeoutProgressElement.style.width = `${progress}%`;
                    }
                    if (remainingTime <= 0) {
                        clearInterval(countdownId);
                    }
                }, 1000);

                timeoutId = window.setTimeout(() => {
                    clearInterval(countdownId);
                    reject(new Error('Loading timeout - backend may be unavailable'));
                }, timeoutDuration);
            });

            const loadPromise = this.mcpClient.readResource('wasm://components/list');

            try {
                const data = await Promise.race([loadPromise, timeoutPromise]);
                clearTimeout(timeoutId!);
                clearInterval(countdownId!);

                const mcpData = data as { content?: Array<{ text?: string }> };
                if (data && mcpData.content && mcpData.content[0]) {
                    const componentData = JSON.parse(mcpData.content[0].text || '[]');
                    this.components = Array.isArray(componentData) ? componentData : [];
                    this.renderComponents();
                } else {
                    this.components = [];
                    this.showEmptyState();
                }
            } catch (error) {
                clearTimeout(timeoutId!);
                clearInterval(countdownId!);
                throw error;
            }
        } catch (error) {
            console.error('Failed to load WASM components:', error);
            this.showErrorState(error instanceof Error ? error.message : 'Unknown error');
        } finally {
            this.isLoading = false;
        }
    }

    private showLoadingState(): void {
        const loadingState = this.contentElement.querySelector('.loading-state') as HTMLElement;
        const emptyState = this.contentElement.querySelector('.empty-state') as HTMLElement;
        const errorState = this.contentElement.querySelector('.error-state') as HTMLElement;
        const componentsList = this.contentElement.querySelector('.wasm-components-list') as HTMLElement;

        // Clear existing components
        const existingComponents = componentsList.querySelectorAll('.component-item');
        existingComponents.forEach(item => item.remove());

        // Show loading, hide others
        loadingState.style.display = 'flex';
        emptyState.style.display = 'none';
        errorState.style.display = 'none';

        // Style loading state
        loadingState.style.cssText += `
            flex-direction: column;
            align-items: center;
            gap: 12px;
            padding: 40px 20px;
            color: var(--text-secondary, #A0A9BA);
        `;

        // Style loading spinner
        const spinner = loadingState.querySelector('.loading-spinner') as HTMLElement;
        if (spinner) {
            spinner.style.cssText = `
                width: 32px;
                height: 32px;
                border: 3px solid var(--border-color, #2A3441);
                border-top: 3px solid var(--accent-info, #4A9EFF);
                border-radius: 50%;
                animation: spin 1s linear infinite;
            `;
        }

        // Style timeout indicator
        const timeoutIndicator = loadingState.querySelector('.loading-timeout-indicator') as HTMLElement;
        if (timeoutIndicator) {
            timeoutIndicator.style.cssText = `
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 8px;
                margin-top: 16px;
                width: 100%;
            `;

            const progressContainer = document.createElement('div');
            progressContainer.style.cssText = `
                width: 120px;
                height: 4px;
                background: var(--border-color, #2A3441);
                border-radius: 2px;
                overflow: hidden;
            `;

            const progress = timeoutIndicator.querySelector('.timeout-progress') as HTMLElement;
            if (progress) {
                progress.style.cssText = `
                    height: 100%;
                    width: 0%;
                    background: var(--accent-warning, #F0B72F);
                    border-radius: 2px;
                    transition: width 1s linear;
                `;
                progressContainer.appendChild(progress);
                timeoutIndicator.prepend(progressContainer);
            }
        }
    }

    private showEmptyState(): void {
        const loadingState = this.contentElement.querySelector('.loading-state') as HTMLElement;
        const emptyState = this.contentElement.querySelector('.empty-state') as HTMLElement;
        const errorState = this.contentElement.querySelector('.error-state') as HTMLElement;

        loadingState.style.display = 'none';
        emptyState.style.display = 'flex';
        errorState.style.display = 'none';

        // Style empty state
        emptyState.style.cssText += `
            flex-direction: column;
            align-items: center;
            gap: 12px;
            padding: 40px 20px;
            text-align: center;
            color: var(--text-secondary, #A0A9BA);
        `;

        this.updateComponentCount(0);
    }

    private showErrorState(message: string): void {
        const loadingState = this.contentElement.querySelector('.loading-state') as HTMLElement;
        const emptyState = this.contentElement.querySelector('.empty-state') as HTMLElement;
        const errorState = this.contentElement.querySelector('.error-state') as HTMLElement;

        loadingState.style.display = 'none';
        emptyState.style.display = 'none';
        errorState.style.display = 'flex';

        // Update error message
        const errorMessageElement = errorState.querySelector('.error-message') as HTMLElement;
        if (errorMessageElement) {
            errorMessageElement.textContent = message;
        }

        // Style error state
        errorState.style.cssText += `
            flex-direction: column;
            align-items: center;
            gap: 12px;
            padding: 40px 20px;
            text-align: center;
            color: var(--accent-error, #F85149);
        `;

        this.updateComponentCount(0);
    }

    private renderComponents(): void {
        const loadingState = this.contentElement.querySelector('.loading-state') as HTMLElement;
        const emptyState = this.contentElement.querySelector('.empty-state') as HTMLElement;
        const errorState = this.contentElement.querySelector('.error-state') as HTMLElement;
        const componentsList = this.contentElement.querySelector('.wasm-components-list') as HTMLElement;

        // Hide loading states
        loadingState.style.display = 'none';
        emptyState.style.display = 'none';
        errorState.style.display = 'none';

        // Clear existing components
        const existingComponents = componentsList.querySelectorAll('.component-item');
        existingComponents.forEach(item => item.remove());

        if (this.components.length === 0) {
            this.showEmptyState();
            return;
        }

        // Render components
        this.components.forEach(component => {
            const componentElement = this.createComponentElement(component);
            componentsList.appendChild(componentElement);
        });

        this.updateComponentCount(this.components.length);
    }

    private createComponentElement(component: WasmComponentInfo): HTMLElement {
        const element = document.createElement('div');
        element.className = 'component-item';
        element.draggable = true;
        
        const statusColor = component.status === 'available' ? 'var(--accent-success, #3FB950)' : 'var(--accent-error, #F85149)';
        const statusIcon = component.status === 'available' ? '✅' : '❌';

        element.innerHTML = `
            <div class="component-header">
                <div class="component-name">${component.name}</div>
                <div class="component-status" style="color: ${statusColor};">${statusIcon}</div>
            </div>
            <div class="component-description">${component.description}</div>
            <div class="component-meta">
                <span class="interface-count">${component.interfaces} interfaces</span>
                ${component.lastSeen ? `<span class="last-seen">Last seen: ${component.lastSeen}</span>` : ''}
            </div>
        `;

        // Style component element
        element.style.cssText = `
            padding: 12px;
            margin-bottom: 8px;
            background: var(--bg-primary, #0F1419);
            border: 1px solid var(--border-color, #2A3441);
            border-radius: 6px;
            cursor: grab;
            transition: all 0.2s ease;
            user-select: none;
        `;

        // Component styling
        this.styleComponentElement(element);

        // Drag events
        element.addEventListener('dragstart', (e) => {
            this.dragData = { componentName: component.name, componentInfo: component };
            e.dataTransfer!.setData('application/wasm-component', JSON.stringify(this.dragData));
            element.style.opacity = '0.5';
        });

        element.addEventListener('dragend', () => {
            element.style.opacity = '1';
            this.dragData = undefined;
        });

        return element;
    }

    private styleComponentElement(element: HTMLElement): void {
        element.addEventListener('mouseenter', () => {
            element.style.backgroundColor = 'var(--bg-tertiary, #1C2333)';
            element.style.borderColor = 'var(--border-bright, #3D444D)';
            element.style.transform = 'translateY(-1px)';
        });

        element.addEventListener('mouseleave', () => {
            element.style.backgroundColor = 'var(--bg-primary, #0F1419)';
            element.style.borderColor = 'var(--border-color, #2A3441)';
            element.style.transform = 'translateY(0)';
        });

        // Style component parts
        const header = element.querySelector('.component-header') as HTMLElement;
        if (header) {
            header.style.cssText = `
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 8px;
            `;
        }

        const name = element.querySelector('.component-name') as HTMLElement;
        if (name) {
            name.style.cssText = `
                font-weight: 600;
                color: var(--text-primary, #E5E9F0);
                font-size: 14px;
            `;
        }

        const description = element.querySelector('.component-description') as HTMLElement;
        if (description) {
            description.style.cssText = `
                color: var(--text-secondary, #A0A9BA);
                font-size: 12px;
                margin-bottom: 8px;
                line-height: 1.4;
            `;
        }

        const meta = element.querySelector('.component-meta') as HTMLElement;
        if (meta) {
            meta.style.cssText = `
                display: flex;
                gap: 12px;
                font-size: 11px;
                color: var(--text-dim, #484F58);
            `;
        }
    }

    private updateComponentCount(count: number): void {
        const countElement = this.contentElement.querySelector('.component-count') as HTMLElement;
        if (countElement) {
            countElement.textContent = count.toString();
        }
    }

    public updateClientSideComponents(components: import('../wasm/WasmComponentManager.js').WasmComponent[]): void {
        const transpiledComponentsList = this.contentElement.querySelector('.transpiled-components-list') as HTMLElement;
        const transpiledCountElement = this.contentElement.querySelector('.transpiled-component-count') as HTMLElement;

        // Check if elements exist before proceeding
        if (!transpiledComponentsList) {
            console.warn('WasmComponentPanel: transpiled-components-list element not found');
            return;
        }

        // Clear existing
        const existingComponents = transpiledComponentsList.querySelectorAll('.client-component-item');
        existingComponents.forEach(item => item.remove());

        if (components.length === 0) {
            const emptyState = transpiledComponentsList.querySelector('.empty-state') as HTMLElement;
            if (emptyState) emptyState.style.display = 'flex';
        } else {
            const emptyState = transpiledComponentsList.querySelector('.empty-state') as HTMLElement;
            if (emptyState) emptyState.style.display = 'none';

            components.forEach(component => {
                const element = this.createClientComponentElement(component);
                transpiledComponentsList.appendChild(element);
            });
        }

        if (transpiledCountElement) {
            transpiledCountElement.textContent = components.length.toString();
        }
    }

    private createClientComponentElement(component: import('../wasm/WasmComponentManager.js').WasmComponent): HTMLElement {
        const element = document.createElement('div');
        element.className = 'client-component-item';
        
        element.innerHTML = `
            <div class="component-header">
                <div class="component-name">${component.metadata?.name || 'Unknown'}</div>
                <div class="component-status loaded">🔧</div>
            </div>
            <div class="component-description">Client-side transpiled component</div>
            <div class="component-meta">
                <span class="size-info">${this.formatFileSize(component.metadata?.size || 0)}</span>
                <span class="type-info">Transpiled</span>
            </div>
        `;

        // Reuse component styling
        element.style.cssText = `
            padding: 12px;
            margin-bottom: 8px;
            background: var(--bg-primary, #0F1419);
            border: 1px solid var(--border-color, #2A3441);
            border-radius: 6px;
            transition: all 0.2s ease;
        `;

        this.styleComponentElement(element);
        return element;
    }

    private formatFileSize(bytes: number): string {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    }

    // Public methods for component events
    public onComponentAdded(componentName: string): void {
        console.log(`Component added to diagram: ${componentName}`);
        // Could add visual feedback here
    }

    public onComponentAddFailed(componentName: string, error: string): void {
        console.error(`Failed to add component ${componentName}:`, error);
        // Could show error notification
    }

    protected onShow(): void {
        // Load components when panel is shown
        this.loadComponents();
    }
    
    // Set component lifecycle callbacks
    public setComponentLifecycleCallbacks(callbacks: {
        onLoad?: (elementId: string) => Promise<void>;
        onUnload?: (elementId: string) => Promise<void>;
        onTranspile?: (elementId: string) => Promise<void>;
        onRelease?: (elementId: string) => Promise<void>;
    }): void {
        this.onLoadComponent = callbacks.onLoad;
        this.onUnloadComponent = callbacks.onUnload;
        this.onTranspileComponent = callbacks.onTranspile;
        this.onReleaseComponent = callbacks.onRelease;
    }

    // Update components from current diagram
    public updateDiagramComponents(components: Array<{
        elementId: string;
        name: string;
        status: 'available' | 'missing' | 'loaded' | 'transpiled';
        isLoaded: boolean;
        isTranspiled: boolean;
    }>): void {
        const listElement = this.contentElement.querySelector('.diagram-components-list') as HTMLElement;
        const countElement = this.contentElement.querySelector('.diagram-component-count') as HTMLElement;
        
        if (!listElement) return;
        
        countElement.textContent = components.length.toString();
        
        if (components.length === 0) {
            listElement.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">📋</div>
                    <p>No components in current diagram</p>
                    <p class="empty-hint">Drag components from sidebar to add them</p>
                </div>
            `;
            return;
        }
        
        listElement.innerHTML = '';
        components.forEach(comp => {
            const element = this.createDiagramComponentElement(comp);
            listElement.appendChild(element);
        });
    }

    private createDiagramComponentElement(component: {
        elementId: string;
        name: string;
        status: string;
        isLoaded: boolean;
        isTranspiled: boolean;
    }): HTMLElement {
        const element = document.createElement('div');
        element.className = 'diagram-component-item';
        
        const statusClass = component.isTranspiled ? 'transpiled' : 
                          component.isLoaded ? 'loaded' : 'unloaded';
        
        element.innerHTML = `
            <div class="component-header">
                <div class="component-name">${component.name}</div>
                <div class="component-actions">
                    ${!component.isLoaded ? 
                        `<button class="load-btn" data-element-id="${component.elementId}" title="Load WASM">📥</button>` : 
                        `<button class="unload-btn" data-element-id="${component.elementId}" title="Unload WASM">📤</button>`
                    }
                    ${component.isLoaded && !component.isTranspiled ? 
                        `<button class="transpile-btn" data-element-id="${component.elementId}" title="Transpile">⚡</button>` : ''
                    }
                    ${component.isTranspiled ? 
                        `<button class="release-btn" data-element-id="${component.elementId}" title="Release">🗑️</button>` : ''
                    }
                </div>
            </div>
            <div class="component-status ${statusClass}">
                ${component.isTranspiled ? '⚡ Transpiled' : 
                  component.isLoaded ? '✅ Loaded' : '⭕ Not loaded'}
            </div>
        `;
        
        // Style the component
        element.style.cssText = `
            padding: 12px;
            margin-bottom: 8px;
            background: var(--bg-primary, #0F1419);
            border: 1px solid var(--border-color, #2A3441);
            border-radius: 6px;
            transition: all 0.2s ease;
        `;
        
        // Add event listeners for buttons
        this.setupDiagramComponentEvents(element, component);
        
        return element;
    }

    private setupDiagramComponentEvents(element: HTMLElement, component: import('../wasm/WasmComponentManager.js').WasmComponent): void {
        // Load button
        const loadBtn = element.querySelector('.load-btn') as HTMLButtonElement;
        loadBtn?.addEventListener('click', () => this.handleLoadComponent(component.elementId));
        
        // Unload button
        const unloadBtn = element.querySelector('.unload-btn') as HTMLButtonElement;
        unloadBtn?.addEventListener('click', () => this.handleUnloadComponent(component.elementId));
        
        // Transpile button
        const transpileBtn = element.querySelector('.transpile-btn') as HTMLButtonElement;
        transpileBtn?.addEventListener('click', () => this.handleTranspileComponent(component.elementId));
        
        // Release button
        const releaseBtn = element.querySelector('.release-btn') as HTMLButtonElement;
        releaseBtn?.addEventListener('click', () => this.handleReleaseComponent(component.elementId));
    }

    private async handleLoadComponent(elementId: string): Promise<void> {
        console.log('Loading component:', elementId);
        if (this.onLoadComponent) {
            try {
                await this.onLoadComponent(elementId);
                // Refresh the components display
                // This will be called from WasmRuntimeManager after successful load
            } catch (error) {
                console.error('Failed to load component:', error);
                // TODO: Show error notification
            }
        }
    }

    private async handleUnloadComponent(elementId: string): Promise<void> {
        console.log('Unloading component:', elementId);
        if (this.onUnloadComponent) {
            try {
                await this.onUnloadComponent(elementId);
            } catch (error) {
                console.error('Failed to unload component:', error);
            }
        }
    }

    private async handleTranspileComponent(elementId: string): Promise<void> {
        console.log('Transpiling component:', elementId);
        if (this.onTranspileComponent) {
            try {
                await this.onTranspileComponent(elementId);
            } catch (error) {
                console.error('Failed to transpile component:', error);
            }
        }
    }

    private async handleReleaseComponent(elementId: string): Promise<void> {
        console.log('Releasing component:', elementId);
        if (this.onReleaseComponent) {
            try {
                await this.onReleaseComponent(elementId);
            } catch (error) {
                console.error('Failed to release component:', error);
            }
        }
    }

    // Update transpiled components list
    public updateTranspiledComponents(components: Array<{
        name: string;
        interfaces: string[];
        source: string;
    }>): void {
        const listElement = this.contentElement.querySelector('.transpiled-components-list') as HTMLElement;
        const countElement = this.contentElement.querySelector('.transpiled-component-count') as HTMLElement;
        
        if (!listElement) return;
        
        countElement.textContent = components.length.toString();
        
        if (components.length === 0) {
            listElement.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">⚡</div>
                    <p>No transpiled components</p>
                    <p class="empty-hint">Load and transpile components to enable interfaces</p>
                </div>
            `;
            return;
        }
        
        listElement.innerHTML = '';
        components.forEach(comp => {
            const element = this.createTranspiledComponentElement(comp);
            listElement.appendChild(element);
        });
    }

    private createTranspiledComponentElement(component: {
        name: string;
        interfaces: string[];
        source: string;
    }): HTMLElement {
        const element = document.createElement('div');
        element.className = 'transpiled-component-item';
        
        element.innerHTML = `
            <div class="component-name">${component.name}</div>
            <div class="component-interfaces">
                ${component.interfaces.map(i => `<span class="interface-tag">${i}</span>`).join('')}
            </div>
            <div class="component-source">From: ${component.source}</div>
        `;
        
        element.style.cssText = `
            padding: 12px;
            margin-bottom: 8px;
            background: var(--bg-primary, #0F1419);
            border: 1px solid var(--accent-wasm, #654FF0);
            border-radius: 6px;
        `;
        
        return element;
    }


    // Update test harnesses
    public updateTestHarnesses(harnesses: Array<{
        interfaceName: string;
        componentName: string;
        methods: string[];
    }>): void {
        const listElement = this.contentElement.querySelector('.test-harness-list') as HTMLElement;
        const countElement = this.contentElement.querySelector('.test-harness-count') as HTMLElement;
        
        if (!listElement) return;
        
        countElement.textContent = harnesses.length.toString();
        
        if (harnesses.length === 0) {
            listElement.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">🧪</div>
                    <p>No test harnesses available</p>
                    <p class="empty-hint">Transpile components to generate test harnesses</p>
                </div>
            `;
            return;
        }
        
        listElement.innerHTML = '';
        harnesses.forEach(harness => {
            const element = this.createTestHarnessElement(harness);
            listElement.appendChild(element);
        });
    }

    private createTestHarnessElement(harness: {
        interfaceName: string;
        componentName: string;
        methods: string[];
    }): HTMLElement {
        const element = document.createElement('div');
        element.className = 'test-harness-item';
        element.draggable = true;
        
        element.innerHTML = `
            <div class="harness-header">
                <div class="harness-name">🧪 ${harness.interfaceName}</div>
                <div class="harness-source">from ${harness.componentName}</div>
            </div>
            <div class="harness-methods">
                ${harness.methods.map(m => `<span class="method-tag">${m}()</span>`).join('')}
            </div>
        `;
        
        element.style.cssText = `
            padding: 12px;
            margin-bottom: 8px;
            background: var(--bg-primary, #0F1419);
            border: 1px solid var(--accent-success, #3FB950);
            border-radius: 6px;
            cursor: grab;
        `;
        
        // Make test harness draggable
        element.addEventListener('dragstart', (e) => {
            const dragData = {
                type: 'test-harness',
                interfaceName: harness.interfaceName,
                componentName: harness.componentName,
                methods: harness.methods
            };
            e.dataTransfer!.setData('application/wasm-test-harness', JSON.stringify(dragData));
            element.style.opacity = '0.5';
        });
        
        element.addEventListener('dragend', () => {
            element.style.opacity = '1';
        });
        
        return element;
    }

    // WIT Analysis Methods

    private async analyzeWitInterfaces(): Promise<void> {
        const analysisContent = this.contentElement.querySelector('.wit-analysis-content') as HTMLElement;
        if (!analysisContent) return;

        // Show loading state
        analysisContent.innerHTML = `
            <div class="loading-state">
                <div class="spinner">🔄</div>
                <p>Analyzing WIT interfaces...</p>
            </div>
        `;

        try {
            // Get WIT overview from WASM Component Manager using MCP resources
            const overview = await this.getWitInterfacesOverview();
            const typesData = await this.getWitTypesCatalog();
            const dependenciesData = await this.getWitDependenciesGraph();

            this.displayWitAnalysisResults(overview, typesData, dependenciesData);
            
        } catch (error) {
            console.error('Failed to analyze WIT interfaces:', error);
            analysisContent.innerHTML = `
                <div class="error-state">
                    <div class="error-icon">❌</div>
                    <p>Failed to analyze WIT interfaces</p>
                    <p class="error-details">${error instanceof Error ? error.message : 'Unknown error'}</p>
                    <button class="retry-wit-btn">Try Again</button>
                </div>
            `;

            const retryBtn = analysisContent.querySelector('.retry-wit-btn') as HTMLButtonElement;
            retryBtn?.addEventListener('click', () => this.analyzeWitInterfaces());
        }
    }

    private async getWitInterfacesOverview(): Promise<{ interfaces?: unknown[] }> {
        // Call MCP resource directly using the client
        try {
            const result = await this.mcpClient.readResource('wasm://wit/interfaces');
            return JSON.parse(result.text || '{}');
        } catch (error) {
            throw new Error('Failed to fetch WIT interfaces overview');
        }
    }

    private async getWitTypesCatalog(): Promise<{ types?: Array<{ name: string; kind: string }> }> {
        try {
            const result = await this.mcpClient.readResource('wasm://wit/types');
            return JSON.parse(result.text || '{}');
        } catch (error) {
            throw new Error('Failed to fetch WIT types catalog');
        }
    }

    private async getWitDependenciesGraph(): Promise<{ dependencies?: Array<{ name: string; version?: string }> }> {
        try {
            const result = await this.mcpClient.readResource('wasm://wit/dependencies');
            return JSON.parse(result.text || '{}');
        } catch (error) {
            throw new Error('Failed to fetch WIT dependencies graph');
        }
    }

    private displayWitAnalysisResults(overview: { summary?: { imports?: number; exports?: number; types?: number; dependencies?: number } }, typesData: { types?: Array<{ name: string; kind: string }> }, dependenciesData: { dependencies?: Array<{ name: string; version?: string }> }): void {
        const analysisContent = this.contentElement.querySelector('.wit-analysis-content') as HTMLElement;
        if (!analysisContent) return;

        const summary = overview.summary || {};
        const interfaces = overview.interfaces || [];
        const types = typesData.types || [];
        const dependencies = dependenciesData.nodes || [];

        analysisContent.innerHTML = `
            <div class="wit-analysis-results">
                <!-- Summary Cards -->
                <div class="wit-summary-cards">
                    <div class="summary-card">
                        <div class="card-value">${summary.totalInterfaces || 0}</div>
                        <div class="card-label">Total Interfaces</div>
                    </div>
                    <div class="summary-card">
                        <div class="card-value">${summary.totalImports || 0}</div>
                        <div class="card-label">Imports</div>
                    </div>
                    <div class="summary-card">
                        <div class="card-value">${summary.totalExports || 0}</div>
                        <div class="card-label">Exports</div>
                    </div>
                    <div class="summary-card">
                        <div class="card-value">${types.length}</div>
                        <div class="card-label">Types</div>
                    </div>
                </div>

                <!-- Interfaces List -->
                <div class="wit-interfaces-section">
                    <h5>📋 Interfaces</h5>
                    <div class="interfaces-list">
                        ${interfaces.length > 0 ? 
                            interfaces.map((iface) => `
                                <div class="interface-item">
                                    <div class="interface-header">
                                        <span class="interface-name">${iface.name}</span>
                                        <span class="interface-type ${iface.type}">${iface.type}</span>
                                    </div>
                                    <div class="interface-meta">
                                        <span class="function-count">${iface.functions} functions</span>
                                        <span class="component-count">${(iface.components || []).length} components</span>
                                    </div>
                                </div>
                            `).join('') : 
                            '<p class="no-data">No interfaces found</p>'
                        }
                    </div>
                </div>

                <!-- Types Section -->
                <div class="wit-types-section">
                    <h5>🔧 Types</h5>
                    <div class="types-list">
                        ${types.length > 0 ? 
                            types.slice(0, 10).map((type) => `
                                <div class="type-item">
                                    <span class="type-name">${type.type}</span>
                                    <span class="type-usage">${type.usedIn}</span>
                                </div>
                            `).join('') : 
                            '<p class="no-data">No types found</p>'
                        }
                        ${types.length > 10 ? `<p class="more-types">... and ${types.length - 10} more types</p>` : ''}
                    </div>
                </div>

                <!-- Dependencies Section -->
                <div class="wit-dependencies-section">
                    <h5>🔗 Components</h5>
                    <div class="dependencies-list">
                        ${dependencies.length > 0 ? 
                            dependencies.map((dep) => `
                                <div class="dependency-item">
                                    <span class="dependency-name">${dep.id}</span>
                                    <div class="dependency-stats">
                                        <span class="stat">${dep.interfaces} interfaces</span>
                                        <span class="stat">${dep.dependencies} deps</span>
                                    </div>
                                </div>
                            `).join('') : 
                            '<p class="no-data">No components found</p>'
                        }
                    </div>
                </div>

                <!-- Detailed Analysis Button -->
                <div class="wit-actions">
                    <button class="detailed-analysis-btn">📊 View Detailed Analysis</button>
                </div>
            </div>
        `;

        // Style the analysis results
        this.styleWitAnalysisResults(analysisContent);

        // Set up detailed analysis button
        const detailedBtn = analysisContent.querySelector('.detailed-analysis-btn') as HTMLButtonElement;
        detailedBtn?.addEventListener('click', () => this.showDetailedWitAnalysis());
    }

    private styleWitAnalysisResults(_container: HTMLElement): void {
        const style = document.createElement('style');
        style.textContent = `
            .wit-analysis-results {
                padding: 16px;
                background: var(--bg-primary, #0F1419);
                border-radius: 6px;
            }

            .wit-summary-cards {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(80px, 1fr));
                gap: 8px;
                margin-bottom: 16px;
            }

            .summary-card {
                background: var(--bg-tertiary, #1C2333);
                border: 1px solid var(--border-color, #2A3441);
                border-radius: 4px;
                padding: 8px;
                text-align: center;
            }

            .card-value {
                font-size: 18px;
                font-weight: bold;
                color: var(--accent-wasm, #654FF0);
            }

            .card-label {
                font-size: 11px;
                color: var(--text-secondary, #A0A9BA);
                margin-top: 2px;
            }

            .wit-interfaces-section, .wit-types-section, .wit-dependencies-section {
                margin-bottom: 16px;
            }

            .wit-interfaces-section h5, .wit-types-section h5, .wit-dependencies-section h5 {
                margin: 0 0 8px 0;
                font-size: 13px;
                color: var(--text-primary, #E5E9F0);
            }

            .interface-item, .type-item, .dependency-item {
                background: var(--bg-secondary, #0D1117);
                border: 1px solid var(--border-color, #2A3441);
                border-radius: 4px;
                padding: 8px;
                margin-bottom: 4px;
            }

            .interface-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 4px;
            }

            .interface-name {
                font-weight: 500;
                color: var(--text-primary, #E5E9F0);
                font-size: 12px;
            }

            .interface-type {
                padding: 2px 6px;
                border-radius: 2px;
                font-size: 10px;
                font-weight: 500;
            }

            .interface-type.import {
                background: rgba(79, 172, 254, 0.2);
                color: #4FACFE;
            }

            .interface-type.export {
                background: rgba(63, 185, 80, 0.2);
                color: #3FB950;
            }

            .interface-meta, .dependency-stats {
                display: flex;
                gap: 8px;
                font-size: 11px;
                color: var(--text-secondary, #A0A9BA);
            }

            .type-item {
                display: flex;
                justify-content: space-between;
                align-items: center;
            }

            .type-name {
                font-family: monospace;
                font-size: 11px;
                color: var(--accent-success, #3FB950);
            }

            .type-usage {
                font-size: 10px;
                color: var(--text-secondary, #A0A9BA);
            }

            .dependency-item {
                display: flex;
                justify-content: space-between;
                align-items: center;
            }

            .dependency-name {
                font-size: 12px;
                color: var(--text-primary, #E5E9F0);
            }

            .stat {
                font-size: 10px;
                color: var(--text-secondary, #A0A9BA);
            }

            .wit-actions {
                margin-top: 16px;
            }

            .detailed-analysis-btn {
                width: 100%;
                padding: 8px;
                background: var(--accent-wasm, #654FF0);
                color: white;
                border: none;
                border-radius: 4px;
                font-size: 12px;
                cursor: pointer;
                transition: background 0.2s ease;
            }

            .detailed-analysis-btn:hover {
                background: #5940E0;
            }

            .no-data {
                text-align: center;
                color: var(--text-secondary, #A0A9BA);
                font-style: italic;
                padding: 16px;
                font-size: 12px;
            }

            .more-types {
                text-align: center;
                color: var(--text-secondary, #A0A9BA);
                font-size: 11px;
                margin-top: 8px;
            }

            .loading-state, .error-state {
                text-align: center;
                padding: 24px;
            }

            .spinner {
                font-size: 24px;
                animation: spin 1s linear infinite;
            }

            @keyframes spin {
                from { transform: rotate(0deg); }
                to { transform: rotate(360deg); }
            }

            .error-icon {
                font-size: 24px;
                margin-bottom: 8px;
            }

            .error-details {
                font-size: 11px;
                color: var(--text-secondary, #A0A9BA);
                margin: 8px 0;
            }

            .retry-wit-btn {
                padding: 6px 12px;
                background: var(--accent-danger, #F85149);
                color: white;
                border: none;
                border-radius: 4px;
                font-size: 12px;
                cursor: pointer;
            }
        `;

        if (!document.head.querySelector('style[data-wit-analysis]')) {
            style.setAttribute('data-wit-analysis', 'true');
            document.head.appendChild(style);
        }
    }

    private async showDetailedWitAnalysis(): Promise<void> {
        // This could open a modal or new panel with detailed WIT information
        console.log('Showing detailed WIT analysis...');
        // For now, just log the action - this could be extended to show more detailed views
        try {
            const componentsData = await this.mcpClient.readResource('wasm://components/list');
            const parsedData = JSON.parse(componentsData.text || '{}');
            console.log('Detailed component data:', parsedData);
            
            // Could show a detailed modal with raw WIT content for each component
            alert('Detailed WIT analysis would be shown here. Check console for component data.');
        } catch (error) {
            console.error('Failed to get detailed analysis:', error);
        }
    }
}