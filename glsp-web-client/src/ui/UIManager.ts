import { getNodeTypesForDiagram, getEdgeTypesForDiagram } from '../diagrams/diagram-type-registry.js';
import { diagramTypeRegistry, DiagramTypeConfig } from '../diagrams/diagram-type-registry.js';
import { statusManager, ConnectionStatus, StatusListener, CombinedStatus } from '../services/StatusManager.js';
import { AIAssistantPanel, AIAssistantEvents } from './AIAssistantPanel.js';
import { SidebarComponent } from './sidebar/SidebarComponent.js';
import { ToolboxSection, createDefaultTools } from './sidebar/sections/ToolboxSection.js';
import { PropertiesSection, Property } from './sidebar/sections/PropertiesSection.js';
import { ComponentLibrarySection } from './sidebar/sections/ComponentLibrarySection.js';
import { DiagramControlsSection } from './sidebar/sections/DiagramControlsSection.js';
import { ThemeController } from './ThemeController.js';
import { WasmComponent } from '../types/wasm-component.js';

interface WitInterfaceInfo {
    imports?: Array<{
        name?: string;
        functions?: Array<{
            name: string;
            params?: Array<{ name: string; type: string }>;
            results?: Array<{ name: string; type: string }>;
        }>;
    }>;
    exports?: Array<{
        name?: string;
        functions?: Array<{
            name: string;
            params?: Array<{ name: string; type: string }>;
            results?: Array<{ name: string; type: string }>;
        }>;
    }>;
    dependencies?: Array<{
        package: string;
        version?: string;
    }>;
}
import { HeaderIconManager } from './HeaderIconManager.js';
import { dialogManager } from './dialogs/DialogManager.js';
import { DiagramTypeDialog } from './dialogs/specialized/DiagramTypeDialog.js';
import { DiagramNameDialog } from './dialogs/specialized/DiagramNameDialog.js';
import { ConfirmDialog } from './dialogs/base/ConfirmDialog.js';
import { AlertDialog } from './dialogs/base/AlertDialog.js';
import { PromptDialog } from './dialogs/base/PromptDialog.js';
import { WorkspaceSelector } from './WorkspaceSelector.js';
import { detectEnvironment } from '../utils/environment.js';

export class UIManager {
    private toolbarElement: HTMLElement;
    private statusElement: HTMLElement;
    private diagramListElement: HTMLElement;
    private aiAssistantPanel: AIAssistantPanel;
    private _wasmPaletteElement: HTMLElement;
    private currentMode: string = 'select';
    private currentNodeType: string = '';
    private currentEdgeType: string = '';
    private currentEdgeCreationType: string = 'straight';
    private aiEvents: AIAssistantEvents = {};
    private themeController: ThemeController;
    private headerIconManager: HeaderIconManager;
    private statusListener?: StatusListener;
    
    // Modern sidebar components
    private sidebar?: SidebarComponent;
    private diagramControlsSection?: DiagramControlsSection;
    private toolboxSection?: ToolboxSection;
    private propertiesSection?: PropertiesSection;
    private componentLibrarySection?: ComponentLibrarySection;
    private workspaceSelector?: WorkspaceSelector;

    constructor() {
        console.log('UIManager: Creating UI elements');
        this.toolbarElement = this.createToolbar();
        this.statusElement = this.createStatusBar();
        this.diagramListElement = this.createDiagramList();
        this.aiAssistantPanel = new AIAssistantPanel(this.aiEvents, {}, {
            onMinimizeToHeader: () => this.minimizeAIPanelToHeader()
        });
        this._wasmPaletteElement = document.createElement('div'); // Placeholder
        
        // Setup unified status listening
        statusManager.addListener((status: CombinedStatus) => {
            this.updateUnifiedStatus(status.connection);
        });
        
        // Setup keyboard shortcuts
        this.setupKeyboardShortcuts();
        
        // Initialize theme controller
        this.themeController = new ThemeController();
        
        // Initialize header icon manager
        this.headerIconManager = new HeaderIconManager();
        
        // Setup responsive header coordination
        this.setupResponsiveHeaderCoordination();
        
        // Set up diagram status listener for header icons
        this.statusListener = (status: CombinedStatus) => {
            this.updateDiagramHeaderIcon(status);
        };
        statusManager.addListener(this.statusListener);
        
        // Listen for forced header icon updates
        window.addEventListener('force-header-icon-update', () => {
            console.log('UIManager: Force header icon update requested');
            // Force cleanup any orphaned diagram icons
            this.headerIconManager.forceRemoveAllDiagramIcons();
            const currentStatus = statusManager.getCombinedStatus();
            this.updateDiagramHeaderIcon(currentStatus);
        });
        
        console.log('UIManager: UI elements created');
    }

    public getToolbarElement(): HTMLElement { return this.toolbarElement; }
    public getStatusElement(): HTMLElement { return this.statusElement; }
    public getDiagramListElement(): HTMLElement { return this.diagramListElement; }
    public getAIPanelElement(): HTMLElement { return this.aiAssistantPanel.getElement(); }
    public getAIAssistantPanel(): AIAssistantPanel { return this.aiAssistantPanel; }
    public getThemeController(): ThemeController { return this.themeController; }
    public getHeaderIconManager(): HeaderIconManager { return this.headerIconManager; }
    public getSidebar(): SidebarComponent | undefined { return this.sidebar; }
    
    public initializeModernSidebar(container: HTMLElement, onDiagramTypeChange?: (type: string) => void): void {
        // Create sidebar component
        this.sidebar = new SidebarComponent(container, {
            width: 300,
            minWidth: 250,
            maxWidth: 500,
            resizable: true
        });
        
        // Initialize diagram controls section
        this.diagramControlsSection = new DiagramControlsSection(onDiagramTypeChange);
        
        // Initialize toolbox section
        this.toolboxSection = new ToolboxSection((tool) => {
            console.log('Tool selected:', tool);
            // Handle tool selection
            if (tool.id.startsWith('node-')) {
                this.setMode('create-node');
                this.currentNodeType = tool.id.replace('node-', '');
            } else if (tool.id.startsWith('edge-')) {
                this.setMode('create-edge');
                this.currentEdgeType = tool.id.replace('edge-', '');
            } else if (tool.id === 'interface-linker') {
                // Interface linker handles its own mode change through its action
                // Don't override the mode here
            } else {
                this.setMode(tool.id);
            }
        });
        
        // Add default tools
        const defaultTools = createDefaultTools();
        defaultTools.forEach(tool => this.toolboxSection!.addTool(tool));
        
        // Initialize properties section
        this.propertiesSection = new PropertiesSection();
        
        // Initialize WASM component library section
        this.componentLibrarySection = new ComponentLibrarySection();
        
        // Initialize workspace selector
        const env = detectEnvironment();
        if (env.isDesktop) {
            this.workspaceSelector = new WorkspaceSelector(document.createElement('div'), (workspacePath) => {
                console.log('Workspace changed to:', workspacePath);
                // You can add additional handling here if needed
            });
        }
        
        // Add sections to sidebar
        console.log('UIManager: Adding sidebar sections...');
        
        // Add workspace selector first (at top)
        if (this.workspaceSelector) {
            const workspaceSection = this.workspaceSelector.createSidebarSection();
            if (workspaceSection) {
                this.sidebar.addSection(workspaceSection);
                console.log('UIManager: Workspace selector section added');
            }
        }
        
        this.sidebar.addSection(this.diagramControlsSection.createSection());
        console.log('UIManager: Diagram controls section added');
        this.sidebar.addSection(this.toolboxSection.createSection());
        console.log('UIManager: Toolbox section added');
        this.sidebar.addSection(this.propertiesSection.createSection());
        console.log('UIManager: Properties section added');
        this.sidebar.addSection(this.componentLibrarySection.createSection());
        console.log('UIManager: Component library section added');
        
        // Add existing diagram list to sidebar
        this.sidebar.addSection({
            id: 'diagrams',
            title: 'Diagrams',
            icon: '📊',
            collapsible: true,
            collapsed: false,
            order: 5,
            content: this.diagramListElement
        });
    }

    /**
     * Update sidebar sections based on the current diagram type (Context-Aware Sidebar)
     * Shows/hides sections dynamically to provide relevant tools for each diagram type
     */
    public updateSidebarSections(diagramType: string): void {
        if (!this.sidebar) {
            console.warn('UIManager: Cannot update sidebar sections - sidebar not initialized');
            return;
        }

        console.log('UIManager: Updating sidebar sections for diagram type:', diagramType);

        // Define which sections should be visible for each diagram type
        const sectionVisibility: Record<string, Set<string>> = {
            'workflow': new Set(['workspace', 'diagram-controls', 'toolbox', 'properties', 'diagrams']),
            'bpmn': new Set(['workspace', 'diagram-controls', 'toolbox', 'properties', 'diagrams']),
            'uml-class': new Set(['workspace', 'diagram-controls', 'toolbox', 'properties', 'diagrams']),
            'system-architecture': new Set(['workspace', 'diagram-controls', 'toolbox', 'properties', 'diagrams']),
            'wasm-component': new Set(['workspace', 'diagram-controls', 'wasm-view-modes', 'component-library', 'properties', 'diagrams']),
            'wit-schema': new Set(['workspace', 'diagram-controls', 'toolbox', 'properties', 'diagrams']),
            // Legacy support
            'wit-interface': new Set(['workspace', 'diagram-controls', 'toolbox', 'properties', 'diagrams'])
        };

        const visibleSections = sectionVisibility[diagramType] || new Set(['diagram-controls', 'toolbox', 'properties', 'diagrams']);

        // Handle WASM-specific view modes section
        if (diagramType === 'wasm-component' && !this.sidebar.hasSection('wasm-view-modes')) {
            this.addWasmViewModesSection();
        } else if (diagramType !== 'wasm-component' && this.sidebar.hasSection('wasm-view-modes')) {
            this.sidebar.removeSection('wasm-view-modes');
        }

        // Show/hide toolbox based on diagram type
        if (visibleSections.has('toolbox') && !visibleSections.has('component-library')) {
            // Show toolbox for non-WASM diagrams
            if (!this.sidebar.hasSection('toolbox')) {
                this.sidebar.addSection(this.toolboxSection!.createSection());
            }
        } else {
            // Hide toolbox for WASM diagrams (they use component library instead)
            if (this.sidebar.hasSection('toolbox')) {
                this.sidebar.removeSection('toolbox');
            }
        }

        // Show/hide component library based on diagram type
        if (visibleSections.has('component-library')) {
            if (!this.sidebar.hasSection('component-library')) {
                this.sidebar.addSection(this.componentLibrarySection!.createSection());
            }
        } else {
            if (this.sidebar.hasSection('component-library')) {
                this.sidebar.removeSection('component-library');
            }
        }

        console.log('UIManager: Sidebar sections updated for', diagramType);
    }

    /**
     * Add WASM view modes section to sidebar (for wasm-component diagrams)
     */
    private addWasmViewModesSection(): void {
        if (!this.sidebar) return;

        const viewModesContainer = document.createElement('div');
        viewModesContainer.className = 'wasm-view-modes';
        viewModesContainer.innerHTML = `
            <div class="view-modes-header" style="
                padding: 8px 12px;
                background: var(--bg-secondary);
                border-bottom: 1px solid var(--border);
                margin-bottom: 12px;
                border-radius: var(--radius-sm);
            ">
                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                    <span style="font-weight: 600; color: var(--text-primary); font-size: 13px;">View Mode</span>
                    <button class="view-mode-help-mini" style="
                        background: var(--accent-info);
                        color: white;
                        border: none;
                        width: 18px;
                        height: 18px;
                        border-radius: 50%;
                        font-size: 11px;
                        cursor: pointer;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        font-weight: bold;
                    " title="View modes transform how you see the diagram without changing data">?</button>
                </div>
                <div style="font-size: 11px; color: var(--text-secondary);">
                    Transform visualization without changing data
                </div>
            </div>
            <div class="view-mode-buttons" style="
                display: flex;
                flex-direction: column;
                gap: 8px;
                padding: 0 8px;
            ">
                <button class="view-mode-btn" data-mode="component" style="
                    background: var(--accent-success);
                    color: white;
                    border: none;
                    padding: 10px 14px;
                    border-radius: var(--radius-sm);
                    cursor: pointer;
                    font-size: 13px;
                    font-weight: 600;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    transition: all 0.2s ease;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.2);
                ">
                    <span>📦</span>
                    <span>Component View</span>
                </button>
                <button class="view-mode-btn" data-mode="uml-interface" style="
                    background: var(--bg-tertiary);
                    color: var(--text-primary);
                    border: 1px solid var(--border);
                    padding: 10px 14px;
                    border-radius: var(--radius-sm);
                    cursor: pointer;
                    font-size: 13px;
                    font-weight: 500;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    transition: all 0.2s ease;
                ">
                    <span>🏗️</span>
                    <span>UML View</span>
                </button>
                <button class="view-mode-btn" data-mode="wit-interface" style="
                    background: var(--bg-tertiary);
                    color: var(--text-primary);
                    border: 1px solid var(--border);
                    padding: 10px 14px;
                    border-radius: var(--radius-sm);
                    cursor: pointer;
                    font-size: 13px;
                    font-weight: 500;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    transition: all 0.2s ease;
                ">
                    <span>🔷</span>
                    <span>WIT Interface</span>
                </button>
                <button class="view-mode-btn" data-mode="wit-dependencies" style="
                    background: var(--bg-tertiary);
                    color: var(--text-primary);
                    border: 1px solid var(--border);
                    padding: 10px 14px;
                    border-radius: var(--radius-sm);
                    cursor: pointer;
                    font-size: 13px;
                    font-weight: 500;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    transition: all 0.2s ease;
                ">
                    <span>🔗</span>
                    <span>Dependencies</span>
                </button>
            </div>
        `;

        // Add hover effects
        const buttons = viewModesContainer.querySelectorAll('.view-mode-btn');
        buttons.forEach(btn => {
            btn.addEventListener('mouseenter', () => {
                (btn as HTMLElement).style.transform = 'translateX(4px)';
                if ((btn as HTMLElement).dataset.mode !== 'component') {
                    (btn as HTMLElement).style.background = 'var(--accent-wasm)';
                    (btn as HTMLElement).style.color = 'white';
                    (btn as HTMLElement).style.borderColor = 'var(--accent-wasm)';
                }
            });
            btn.addEventListener('mouseleave', () => {
                (btn as HTMLElement).style.transform = 'translateX(0)';
                if ((btn as HTMLElement).dataset.mode !== 'component') {
                    (btn as HTMLElement).style.background = 'var(--bg-tertiary)';
                    (btn as HTMLElement).style.color = 'var(--text-primary)';
                    (btn as HTMLElement).style.borderColor = 'var(--border)';
                }
            });

            // Click handler - dispatch view mode change event
            btn.addEventListener('click', () => {
                const mode = (btn as HTMLElement).dataset.mode;
                console.log('UIManager: View mode button clicked:', mode);
                window.dispatchEvent(new CustomEvent('view-mode-change', { detail: { mode } }));

                // Update button states
                buttons.forEach(b => {
                    if ((b as HTMLElement).dataset.mode === mode) {
                        (b as HTMLElement).style.background = 'var(--accent-success)';
                        (b as HTMLElement).style.color = 'white';
                        (b as HTMLElement).style.borderColor = 'var(--accent-success)';
                    } else {
                        (b as HTMLElement).style.background = 'var(--bg-tertiary)';
                        (b as HTMLElement).style.color = 'var(--text-primary)';
                        (b as HTMLElement).style.borderColor = 'var(--border)';
                    }
                });
            });
        });

        this.sidebar.addSection({
            id: 'wasm-view-modes',
            title: 'View Modes',
            icon: '👁️',
            collapsible: true,
            collapsed: false,
            order: 2,
            content: viewModesContainer
        });
    }

    private createToolbar(): HTMLElement {
        const toolbar = document.createElement('div');
        toolbar.className = 'glsp-toolbar';
        this.updateToolbarContent(toolbar, 'workflow');
        return toolbar;
    }
    
    public updateToolbarContent(toolbar: HTMLElement, diagramType: string): void {
        const nodeTypes = getNodeTypesForDiagram(diagramType);
        const edgeTypes = getEdgeTypesForDiagram(diagramType);
        const availableTypes = diagramTypeRegistry.getAvailableTypes();
        
        console.log('=== UPDATING TOOLBAR ===');
        console.log('Diagram type:', diagramType);
        console.log('Node type labels:', nodeTypes.map(n => n.label));
        console.log('Edge type labels:', edgeTypes.map(e => e.label));
        
        // Store current values before updating innerHTML
        const currentMode = this.currentMode;
        const currentNodeType = this.currentNodeType;
        const currentEdgeType = this.currentEdgeType;
        const currentEdgeCreationType = this.currentEdgeCreationType;
        
        const env = detectEnvironment();
        console.log('UIManager: detectEnvironment result:', env);
        const workspaceHtml = env.isDesktop ? `
            <div class="toolbar-group">
                <label>Workspace:</label>
                <div id="workspace-selector-container"></div>
            </div>
        ` : '';
        console.log('UIManager: workspaceHtml generated:', workspaceHtml);
        
        const newHTML = `
            ${workspaceHtml}
            <div class="toolbar-group">
                <label>Diagram Type: (${new Date().getSeconds()}s)</label>
                <select id="diagram-type-select">
                    ${availableTypes.map(type => 
                        `<option value="${type.type}" ${type.type === diagramType ? 'selected' : ''}>${type.label}</option>`
                    ).join('')}
                </select>
            </div>
            <div class="toolbar-group">
                <label>Mode:</label>
                <button id="mode-select" class="active">Select</button>
                <button id="mode-pan">Pan</button>
            </div>
            <div class="toolbar-group">
                <label>Create Node:</label>
                ${nodeTypes.map(nodeType => 
                    `<button class="node-type" data-type="${nodeType.type}" title="${nodeType.icon || ''}">
                        ${nodeType.icon || ''} ${nodeType.label}
                    </button>`
                ).join('')}
            </div>
            <div class="toolbar-group">
                <label>Create Edge:</label>
                ${edgeTypes.map(edgeType => 
                    `<button class="edge-type" data-type="${edgeType.type}">${edgeType.label}</button>`
                ).join('')}
            </div>
            <div class="toolbar-group">
                <label>Edge Shape:</label>
                <button class="edge-creation-type active" data-creation-type="straight" title="Straight edges">—</button>
                <button class="edge-creation-type" data-creation-type="curved" title="Curved edges">∿</button>
                <button class="edge-creation-type" data-creation-type="orthogonal" title="Orthogonal edges">┐</button>
                <button class="edge-creation-type" data-creation-type="bezier" title="Bezier edges">⤴</button>
            </div>
            <div class="toolbar-group">
                <button id="apply-layout">Apply Layout</button>
                <button id="zoom-in">Zoom In</button>
                <button id="zoom-out">Zoom Out</button>
                <button id="fit-content">Fit</button>
                <button id="reset-view">Reset</button>
            </div>
            <div class="toolbar-group">
                <label>Edit:</label>
                <button id="delete-selected" title="Delete selected elements (Delete key)">🗑️ Delete</button>
            </div>
            <div class="toolbar-group">
                <button id="toggle-ai-assistant" class="ai-toggle">🤖 AI Assistant</button>
            </div>
        `;
        
        // console.log('Generated HTML for toolbar:', newHTML);
        toolbar.innerHTML = newHTML;
        
        // Initialize workspace selector if in desktop mode
        console.log('UIManager: Environment isDesktop:', env.isDesktop);
        if (env.isDesktop) {
            const workspaceContainer = toolbar.querySelector('#workspace-selector-container') as HTMLElement;
            console.log('UIManager: Workspace container found:', !!workspaceContainer);
            if (workspaceContainer) {
                console.log('UIManager: Creating WorkspaceSelector');
                this.workspaceSelector = new WorkspaceSelector(workspaceContainer, (workspacePath) => {
                    console.log('Workspace changed to:', workspacePath);
                    // Refresh UI components that depend on workspace content
                    this.refreshWorkspaceUI();
                });
                console.log('UIManager: WorkspaceSelector created successfully');
            } else {
                console.log('UIManager: workspace-selector-container not found in toolbar');
            }
        }
        
        // Restore current values
        this.currentMode = currentMode;
        this.currentNodeType = currentNodeType;
        this.currentEdgeType = currentEdgeType;
        this.currentEdgeCreationType = currentEdgeCreationType;
        
        // Re-setup event handlers for the newly created elements
        console.log('Re-setting up toolbar button handlers after content update');
        this.setupToolbarButtonHandlers(toolbar);
        
        // Re-setup diagram type change handler if needed
        this.setupDiagramTypeChangeHandler(toolbar);
    }

    private setupToolbarButtonHandlers(toolbar?: HTMLElement): void {
        const toolbarEl = toolbar || this.toolbarElement;
        
        // Mode buttons
        toolbarEl.querySelector('#mode-select')?.addEventListener('click', () => {
            this.setMode('select');
        });
        
        toolbarEl.querySelector('#mode-pan')?.addEventListener('click', () => {
            this.setMode('pan');
        });
        
        // Node creation buttons
        toolbarEl.querySelectorAll('.node-type').forEach(button => {
            button.addEventListener('click', (e) => {
                const btn = e.currentTarget as HTMLButtonElement;
                const nodeType = btn.getAttribute('data-type');
                console.log('Node type button clicked:', nodeType);
                if (nodeType) {
                    this.setMode('create-node');
                    this.currentNodeType = nodeType;
                    this.updateActiveButton(btn, '.node-type');
                    console.log('Set mode to create-node, nodeType:', this.currentNodeType);
                }
            });
        });
        
        // Edge creation buttons
        toolbarEl.querySelectorAll('.edge-type').forEach(button => {
            button.addEventListener('click', (e) => {
                const btn = e.currentTarget as HTMLButtonElement;
                const edgeType = btn.getAttribute('data-type');
                console.log('Edge type button clicked:', edgeType);
                if (edgeType) {
                    this.setMode('create-edge');
                    this.currentEdgeType = edgeType;
                    this.updateActiveButton(btn, '.edge-type');
                    console.log('Set mode to create-edge, edgeType:', this.currentEdgeType);
                }
            });
        });
        
        // Edge creation type buttons (shape selection)
        toolbarEl.querySelectorAll('.edge-creation-type').forEach(button => {
            button.addEventListener('click', (e) => {
                const btn = e.currentTarget as HTMLButtonElement;
                const creationType = btn.getAttribute('data-creation-type');
                console.log('Edge creation type button clicked:', creationType);
                if (creationType) {
                    this.currentEdgeCreationType = creationType;
                    this.updateActiveButton(btn, '.edge-creation-type');
                    
                    // Dispatch custom event to notify other components
                    window.dispatchEvent(new CustomEvent('edge-creation-type-change', { 
                        detail: { creationType } 
                    }));
                    
                    console.log('Set edge creation type:', this.currentEdgeCreationType);
                }
            });
        });
        
        // View control buttons
        toolbarEl.querySelector('#zoom-in')?.addEventListener('click', () => {
            window.dispatchEvent(new CustomEvent('toolbar-zoom', { detail: { direction: 'in' } }));
        });
        
        toolbarEl.querySelector('#zoom-out')?.addEventListener('click', () => {
            window.dispatchEvent(new CustomEvent('toolbar-zoom', { detail: { direction: 'out' } }));
        });
        
        toolbarEl.querySelector('#fit-content')?.addEventListener('click', () => {
            window.dispatchEvent(new CustomEvent('toolbar-fit-content'));
        });
        
        toolbarEl.querySelector('#reset-view')?.addEventListener('click', () => {
            window.dispatchEvent(new CustomEvent('toolbar-reset-view'));
        });
        
        toolbarEl.querySelector('#apply-layout')?.addEventListener('click', () => {
            window.dispatchEvent(new CustomEvent('toolbar-apply-layout'));
        });

        // Delete button
        toolbarEl.querySelector('#delete-selected')?.addEventListener('click', () => {
            window.dispatchEvent(new CustomEvent('toolbar-delete-selected'));
        });

        // AI Assistant toggle
        toolbarEl.querySelector('#toggle-ai-assistant')?.addEventListener('click', () => {
            const isVisible = this.aiAssistantPanel.getElement().style.display !== 'none';
            if (isVisible) {
                this.hideAIPanel();
            } else {
                this.showAIPanel();
            }
        });
    }
    
    private setMode(mode: string): void {
        this.currentMode = mode;
        window.dispatchEvent(new CustomEvent('toolbar-mode-change', { detail: { mode } }));
        
        // Update active button styling
        if (mode === 'select') {
            const selectBtn = this.toolbarElement?.querySelector('#mode-select');
            if (selectBtn) this.updateActiveButton(selectBtn, '#mode-select, #mode-pan');
        } else if (mode === 'pan') {
            const panBtn = this.toolbarElement?.querySelector('#mode-pan');
            if (panBtn) this.updateActiveButton(panBtn, '#mode-select, #mode-pan');
        }
    }
    
    private updateActiveButton(activeBtn: Element | null, selector: string): void {
        if (!activeBtn) return;
        
        // Find the toolbar element that contains the button
        const toolbar = activeBtn.closest('.glsp-toolbar') || this.toolbarElement;
        
        toolbar.querySelectorAll(selector).forEach(btn => {
            btn.classList.remove('active');
        });
        activeBtn.classList.add('active');
    }
    
    public getCurrentMode(): string {
        return this.currentMode;
    }
    
    public getCurrentNodeType(): string {
        return this.currentNodeType;
    }
    
    public getCurrentEdgeType(): string {
        return this.currentEdgeType;
    }
    
    public getCurrentEdgeCreationType(): string {
        return this.currentEdgeCreationType;
    }
    
    private onDiagramTypeChangeCallback?: (newType: string) => void;

    public setupToolbarEventHandlers(onDiagramTypeChange: (newType: string) => void): void {
        // Store the callback for later use
        this.onDiagramTypeChangeCallback = onDiagramTypeChange;
        
        // Setup diagram type change handler
        this.setupDiagramTypeChangeHandler();
        
        // Setup all other toolbar button handlers
        this.setupToolbarButtonHandlers();
    }

    private setupDiagramTypeChangeHandler(toolbar?: HTMLElement): void {
        const toolbarEl = toolbar || this.toolbarElement;
        if (!this.onDiagramTypeChangeCallback) return;

        const selectElement = toolbarEl.querySelector('#diagram-type-select');
        if (selectElement) {
            selectElement.addEventListener('change', (e) => {
                const select = e.target as HTMLSelectElement;
                if (this.onDiagramTypeChangeCallback) {
                    this.onDiagramTypeChangeCallback(select.value);
                }
            });
        }
    }
    
    public setupAIPanelEventHandlers(
        onCreateDiagram: (prompt: string) => Promise<void>,
        onTestAIDiagram: () => Promise<void>,
        onAnalyzeDiagram: () => Promise<void>,
        onOptimizeLayout: () => Promise<void>
    ): void {
        // Setup AI events for the new panel
        this.aiEvents = {
            onCreateDiagram,
            onTestDiagram: onTestAIDiagram,
            onAnalyzeDiagram,
            onOptimizeLayout
        };

        // Recreate the AI panel with proper events
        this.aiAssistantPanel = new AIAssistantPanel(this.aiEvents, {}, {
            onMinimizeToHeader: () => this.minimizeAIPanelToHeader()
        });
    }

    public showAIPanel(): void {
        this.aiAssistantPanel.show();
    }

    public hideAIPanel(): void {
        this.aiAssistantPanel.hide();
    }


    public addAIMessage(sender: 'AI' | 'User', content: string): void {
        this.aiAssistantPanel.addMessage({
            sender: sender.toLowerCase() as 'ai' | 'user',
            content,
            timestamp: new Date()
        });
    }

    private createStatusBar(): HTMLElement {
        const status = document.createElement('div');
        status.className = 'glsp-status';
        status.innerHTML = '<span id="status-text">Initializing...</span>';
        return status;
    }

    private createDiagramList(): HTMLElement {
        const list = document.createElement('div');
        list.className = 'glsp-diagram-list';
        list.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
                <h3 style="margin: 0;">Diagrams</h3>
                <button id="create-new-diagram-btn" style="
                    background: var(--accent-wasm); 
                    color: white; 
                    border: none; 
                    padding: 6px 12px; 
                    border-radius: var(--radius-sm); 
                    cursor: pointer; 
                    font-size: 12px;
                    transition: all 0.2s ease;
                " title="Create New Diagram">+ New</button>
            </div>
            <ul id="diagram-list"></ul>
        `;
        return list;
    }

    /** @deprecated - Use AIAssistantPanel instead */
    private createAIPanel(): HTMLElement {
        const panel = document.createElement('div');
        panel.className = 'ai-assistant';
        panel.innerHTML = `
            <div class="ai-header">
                <div class="ai-title">
                    <div class="ai-icon">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
                            <path d="M12 2L2 7L12 12L22 7L12 2Z"/>
                            <path d="M2 17L12 22L22 17"/>
                            <path d="M2 12L12 17L22 12"/>
                        </svg>
                    </div>
                    WASM Assistant
                </div>
                <div class="ai-header-actions">
                    <button class="ai-minimize-btn" title="Minimize">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M19 9l-7 7-7-7"/>
                        </svg>
                    </button>
                </div>
            </div>
            <div class="ai-status-bar" id="ai-status-display">
                <span id="ai-connection-status" style="color: var(--accent-error);">Offline</span>
                <div class="ai-model-section">
                    <select id="ai-model-select">
                        <option value="">Loading models...</option>
                    </select>
                </div>
            </div>
            
            <div class="ai-chat" id="ai-chat">
                <div class="ai-message">
                    <div class="message-avatar">AI</div>
                    <div class="message-content">
                        Hello! I can help you design and optimize your WebAssembly component architecture. What would you like to build?
                    </div>
                </div>
            </div>
            
            <div class="ai-input">
                <input type="text" class="ai-prompt" id="ai-prompt" placeholder="Ask about WASM components, optimization, or architecture...">
                <button id="ai-send-btn" style="background: var(--accent-wasm); border: none; color: white; padding: 10px 20px; border-radius: var(--radius-sm); cursor: pointer;">
                    Send
                </button>
            </div>
            
            <div class="ai-quick-actions" style="padding: 12px 16px; border-top: 1px solid var(--border); display: flex; gap: 8px; flex-wrap: wrap;">
                <button class="quick-action-btn" data-action="create" style="background: var(--bg-tertiary); border: 1px solid var(--border); color: var(--text-secondary); padding: 6px 12px; border-radius: var(--radius-sm); cursor: pointer; font-size: 12px;">
                    📝 Create Diagram
                </button>
                <button class="quick-action-btn" data-action="analyze" style="background: var(--bg-tertiary); border: 1px solid var(--border); color: var(--text-secondary); padding: 6px 12px; border-radius: var(--radius-sm); cursor: pointer; font-size: 12px;">
                    🔍 Analyze
                </button>
                <button class="quick-action-btn" data-action="optimize" style="background: var(--bg-tertiary); border: 1px solid var(--border); color: var(--text-secondary); padding: 6px 12px; border-radius: var(--radius-sm); cursor: pointer; font-size: 12px;">
                    ⚡ Optimize
                </button>
                <button class="quick-action-btn" data-action="test" style="background: var(--bg-tertiary); border: 1px solid var(--border); color: var(--text-secondary); padding: 6px 12px; border-radius: var(--radius-sm); cursor: pointer; font-size: 12px;">
                    🧪 Test
                </button>
            </div>
        `;
        
        // Setup drag functionality
        this.setupAIPanelDragging(panel);
        
        return panel;
    }

    private setupAIPanelDragging(panel: HTMLElement): void {
        const header = panel.querySelector('.ai-header') as HTMLElement;
        const minimizeBtn = panel.querySelector('.ai-minimize-btn') as HTMLElement;
        let isDragging = false;
        let startX = 0;
        let startY = 0;
        let startLeft = 0;
        let startTop = 0;

        // Make header draggable (but not the minimize button)
        header.style.cursor = 'move';
        
        // Minimize button handler
        minimizeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            panel.classList.toggle('minimized');
            const icon = minimizeBtn.querySelector('svg');
            if (panel.classList.contains('minimized')) {
                icon?.setAttribute('style', 'transform: rotate(180deg);');
            } else {
                icon?.setAttribute('style', 'transform: rotate(0deg);');
            }
        });

        // Drag handlers
        header.addEventListener('mousedown', (e) => {
            // Don't drag if clicking on minimize button
            if ((e.target as HTMLElement).closest('.ai-minimize-btn')) {
                return;
            }
            
            isDragging = true;
            startX = e.clientX;
            startY = e.clientY;
            
            const rect = panel.getBoundingClientRect();
            startLeft = rect.left;
            startTop = rect.top;
            
            // Change cursor for the whole document while dragging
            document.body.style.cursor = 'move';
            document.body.style.userSelect = 'none';
            
            e.preventDefault();
        });

        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            
            const deltaX = e.clientX - startX;
            const deltaY = e.clientY - startY;
            
            let newLeft = startLeft + deltaX;
            let newTop = startTop + deltaY;
            
            // Constrain to viewport
            const maxLeft = window.innerWidth - panel.offsetWidth;
            const maxTop = window.innerHeight - panel.offsetHeight;
            
            newLeft = Math.max(0, Math.min(newLeft, maxLeft));
            newTop = Math.max(0, Math.min(newTop, maxTop));
            
            panel.style.left = newLeft + 'px';
            panel.style.top = newTop + 'px';
            panel.style.right = 'auto';
            panel.style.bottom = 'auto';
        });

        document.addEventListener('mouseup', () => {
            if (isDragging) {
                isDragging = false;
                document.body.style.cursor = '';
                document.body.style.userSelect = '';
            }
        });
    }

    private setupKeyboardShortcuts(): void {
        document.addEventListener('keydown', (e) => {
            // Only trigger if not in an input field
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) {
                return;
            }
            
            if (e.key.toLowerCase() === 'h') {
                e.preventDefault();
                this.showShortcutsPopup();
            }
            
            // Sidebar toggle shortcut
            if ((e.key.toLowerCase() === 'b') && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                this.toggleSidebar();
            }
            
            // ESC to close popups
            if (e.key === 'Escape') {
                this.closeShortcutsPopup();
            }
        });
    }

    private showShortcutsPopup(): void {
        // Remove existing popup if any
        const existing = document.getElementById('shortcuts-popup');
        if (existing) {
            existing.remove();
            return;
        }

        const popup = this.createShortcutsPopup();
        document.body.appendChild(popup);
        
        // Focus for keyboard events
        popup.focus();
    }

    private createShortcutsPopup(): HTMLElement {
        const popup = document.createElement('div');
        popup.id = 'shortcuts-popup';
        popup.className = 'shortcuts-popup';
        popup.tabIndex = -1; // Make focusable
        
        popup.innerHTML = `
            <div class="shortcuts-header">
                <div class="shortcuts-title">
                    <div class="shortcuts-icon">⌨️</div>
                    Keyboard Shortcuts
                </div>
                <div class="shortcuts-header-actions">
                    <button class="shortcuts-close-btn" title="Close (Esc)">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                        </svg>
                    </button>
                </div>
            </div>
            
            <div class="shortcuts-content">
                <div class="shortcuts-section">
                    <h4>General</h4>
                    <div class="shortcut-item">
                        <kbd>H</kbd>
                        <span>Show/Hide this help</span>
                    </div>
                    <div class="shortcut-item">
                        <kbd>Ctrl+B</kbd>
                        <span>Toggle Sidebar</span>
                    </div>
                    <div class="shortcut-item">
                        <kbd>Ctrl+N</kbd>
                        <span>New Diagram</span>
                    </div>
                    <div class="shortcut-item">
                        <kbd>Ctrl+S</kbd>
                        <span>Save Diagram</span>
                    </div>
                    <div class="shortcut-item">
                        <kbd>Delete</kbd>
                        <span>Delete Selected Element</span>
                    </div>
                </div>
                
                <div class="shortcuts-section">
                    <h4>Navigation</h4>
                    <div class="shortcut-item">
                        <kbd>Ctrl++</kbd>
                        <span>Zoom In</span>
                    </div>
                    <div class="shortcut-item">
                        <kbd>Ctrl+-</kbd>
                        <span>Zoom Out</span>
                    </div>
                    <div class="shortcut-item">
                        <kbd>Ctrl+0</kbd>
                        <span>Fit to Content</span>
                    </div>
                    <div class="shortcut-item">
                        <kbd>Ctrl+R</kbd>
                        <span>Reset View</span>
                    </div>
                    <div class="shortcut-item">
                        <kbd>Space + Drag</kbd>
                        <span>Pan Canvas</span>
                    </div>
                </div>
                
                <div class="shortcuts-section">
                    <h4>Selection & Editing</h4>
                    <div class="shortcut-item">
                        <kbd>Click</kbd>
                        <span>Select Element</span>
                    </div>
                    <div class="shortcut-item">
                        <kbd>Ctrl+Click</kbd>
                        <span>Multi-select</span>
                    </div>
                    <div class="shortcut-item">
                        <kbd>Drag</kbd>
                        <span>Move Element</span>
                    </div>
                    <div class="shortcut-item">
                        <kbd>Ctrl+A</kbd>
                        <span>Select All</span>
                    </div>
                </div>
                
                <div class="shortcuts-section">
                    <h4>WASM Components</h4>
                    <div class="shortcut-item">
                        <kbd>Click Switch</kbd>
                        <span>Load/Unload Component</span>
                    </div>
                    <div class="shortcut-item">
                        <kbd>Click Loaded</kbd>
                        <span>View Execution Examples</span>
                    </div>
                </div>
            </div>
            
            <div class="shortcuts-footer">
                <span>Press <kbd>Esc</kbd> or <kbd>Enter</kbd> to close</span>
            </div>
        `;

        // Setup event handlers
        this.setupShortcutsPopupHandlers(popup);
        
        return popup;
    }

    private setupShortcutsPopupHandlers(popup: HTMLElement): void {
        // Close button
        const closeBtn = popup.querySelector('.shortcuts-close-btn');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                popup.remove();
            });
        }

        // Keyboard handlers
        popup.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' || e.key === 'Enter') {
                e.preventDefault();
                popup.remove();
            }
        });

        // Click outside to close
        popup.addEventListener('click', (e) => {
            if (e.target === popup) {
                popup.remove();
            }
        });

        // Make draggable
        this.setupPopupDragging(popup);
    }

    private setupPopupDragging(popup: HTMLElement): void {
        const header = popup.querySelector('.shortcuts-header') as HTMLElement;
        let isDragging = false;
        let startX = 0;
        let startY = 0;
        let startLeft = 0;
        let startTop = 0;

        header.style.cursor = 'move';
        
        header.addEventListener('mousedown', (e) => {
            // Don't drag if clicking on close button
            if ((e.target as HTMLElement).closest('.shortcuts-close-btn')) {
                return;
            }
            
            isDragging = true;
            startX = e.clientX;
            startY = e.clientY;
            
            const rect = popup.getBoundingClientRect();
            startLeft = rect.left;
            startTop = rect.top;
            
            document.body.style.cursor = 'move';
            document.body.style.userSelect = 'none';
            
            e.preventDefault();
        });

        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            
            const deltaX = e.clientX - startX;
            const deltaY = e.clientY - startY;
            
            let newLeft = startLeft + deltaX;
            let newTop = startTop + deltaY;
            
            // Constrain to viewport
            const maxLeft = window.innerWidth - popup.offsetWidth;
            const maxTop = window.innerHeight - popup.offsetHeight;
            
            newLeft = Math.max(0, Math.min(newLeft, maxLeft));
            newTop = Math.max(0, Math.min(newTop, maxTop));
            
            popup.style.left = newLeft + 'px';
            popup.style.top = newTop + 'px';
            popup.style.right = 'auto';
            popup.style.bottom = 'auto';
        });

        document.addEventListener('mouseup', () => {
            if (isDragging) {
                isDragging = false;
                document.body.style.cursor = '';
                document.body.style.userSelect = '';
            }
        });
    }

    private updateUnifiedStatus(status: ConnectionStatus): void {
        console.log('UIManager: Updating unified status:', status);
        
        // Get MCP health metrics (defensive access during initialization)
        const healthMetrics = (window as any).appController?.getMcpService()?.getConnectionHealthMetrics() || {
            connected: false,
            reconnectAttempts: 0,
            maxReconnectAttempts: 5,
            lastPingTime: undefined,
            avgPingTime: undefined,
            sessionId: undefined,
            reconnecting: false,
            nextReconnectIn: undefined
        };
        
        // Update enhanced header status chip
        this.updateHeaderStatusChip(status, healthMetrics);

        // Update footer status  
        const footerIndicator = document.querySelector('#connection-indicator-status');
        const footerSpan = footerIndicator?.parentElement?.querySelector('span');
        console.log('UIManager: Footer indicator found:', !!footerIndicator, !!footerSpan);
        if (footerIndicator && footerSpan) {
            footerIndicator.className = `status-indicator ${status.mcp ? '' : 'disconnected'}`;
            footerSpan.textContent = status.message;
        }

        // Update AI Assistant Panel connection status
        if (this.aiAssistantPanel) {
            this.aiAssistantPanel.updateConnectionStatus(status.ai);
        }

        // Update main status bar
        const statusText = this.statusElement.querySelector('#status-text');
        console.log('UIManager: Status text element found:', !!statusText);
        if (statusText) {
            statusText.textContent = status.message;
            console.log('UIManager: Updated status text to:', status.message);
        }

        // Update sidebar connection status if it exists
        // TODO: Implement getSection method or use updateSection
        // const diagramControlsSection = this.sidebar?.getSection('diagram-controls');
        // if (diagramControlsSection) {
        //     console.log('UIManager: Updating sidebar diagram controls status');
        // }
    }

    private updateHeaderStatusChip(status: ConnectionStatus, healthMetrics: import('../mcp/client.js').ConnectionHealthMetrics): void {
        const statusChip = document.querySelector('.status-chip');
        if (!statusChip) return;

        // Create enhanced status chip HTML
        const isConnected = healthMetrics.connected;
        const isReconnecting = healthMetrics.reconnecting;
        
        let statusText = 'MCP Connected';
        let statusClass = '';
        let detailsText = '';
        
        if (isReconnecting) {
            statusText = 'MCP Reconnecting';
            statusClass = 'connecting';
            const nextReconnect = healthMetrics.nextReconnectIn;
            if (nextReconnect && nextReconnect > 0) {
                detailsText = `Retry in ${Math.ceil(nextReconnect / 1000)}s (${healthMetrics.reconnectAttempts}/${healthMetrics.maxReconnectAttempts})`;
            } else {
                detailsText = `Attempt ${healthMetrics.reconnectAttempts}/${healthMetrics.maxReconnectAttempts}`;
            }
        } else if (!isConnected) {
            statusText = 'MCP Disconnected';
            statusClass = 'disconnected';
            if (healthMetrics.reconnectAttempts >= healthMetrics.maxReconnectAttempts) {
                detailsText = 'Max retries reached';
            } else {
                detailsText = 'Connection failed';
            }
        } else {
            statusText = 'MCP Connected';
            statusClass = '';
            if (healthMetrics.lastPingTime !== undefined) {
                detailsText = `${healthMetrics.lastPingTime}ms`;
                if (healthMetrics.avgPingTime !== undefined) {
                    detailsText += ` (avg: ${Math.round(healthMetrics.avgPingTime)}ms)`;
                }
            }
        }

        // Update status chip with enhanced information
        statusChip.innerHTML = `
            <div class="status-indicator ${statusClass}" id="connection-indicator"></div>
            <div class="connection-details">
                <span class="connection-main-status">${statusText}</span>
                ${detailsText ? `<span class="connection-sub-status">${detailsText}</span>` : ''}
            </div>
            ${!isConnected && healthMetrics.reconnectAttempts < healthMetrics.maxReconnectAttempts ? 
                `<button class="reconnect-btn" onclick="window.appController.getMcpService().manualReconnect().catch(console.error)" title="Manual Reconnect">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/>
                        <path d="M21 3v5h-5"/>
                        <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/>
                        <path d="M3 21v-5h5"/>
                    </svg>
                </button>` : ''
            }
        `;

        // Add enhanced CSS if not already added
        if (!document.querySelector('#enhanced-status-styles')) {
            const style = document.createElement('style');
            style.id = 'enhanced-status-styles';
            style.textContent = `
                .status-chip {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    padding: 8px 12px;
                    background: var(--bg-tertiary);
                    border: 1px solid var(--border);
                    border-radius: var(--radius-sm);
                    font-size: 13px;
                    min-width: 180px;
                }
                
                .connection-details {
                    display: flex;
                    flex-direction: column;
                    gap: 2px;
                    flex: 1;
                }
                
                .connection-main-status {
                    font-weight: 600;
                    color: var(--text-primary);
                    font-size: 13px;
                }
                
                .connection-sub-status {
                    font-size: 11px;
                    color: var(--text-secondary);
                    font-family: var(--font-mono);
                }
                
                .reconnect-btn {
                    background: transparent;
                    border: 1px solid var(--border);
                    color: var(--text-secondary);
                    padding: 4px;
                    border-radius: var(--radius-sm);
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    transition: all 0.2s ease;
                    width: 24px;
                    height: 24px;
                }
                
                .reconnect-btn:hover {
                    background: var(--accent-wasm);
                    border-color: var(--accent-wasm);
                    color: white;
                    transform: rotate(90deg);
                }
                
                .status-indicator.connecting {
                    background: var(--accent-warning);
                    animation: pulse-glow 1.5s ease-in-out infinite;
                }
            `;
            document.head.appendChild(style);
        }
    }

    public updateStatus(message: string): void {
        // Legacy method - now just updates the main status text
        const statusText = this.statusElement.querySelector('#status-text');
        if (statusText) {
            statusText.textContent = message;
        }
    }

    public updateDiagramList(diagrams: import('../services/DiagramService.js').DiagramMetadata[], loadDiagramCallback: (diagramId: string) => void, deleteDiagramCallback?: (diagramId: string, diagramName: string) => void): void {
        console.log('UIManager: updateDiagramList called with', diagrams.length, 'diagrams');
        const listElement = this.diagramListElement.querySelector('#diagram-list');
        console.log('UIManager: diagram list element found:', !!listElement);
        if (listElement) {
            listElement.innerHTML = '';

            // Group diagrams by type
            const grouped = diagrams.reduce((acc, diagram) => {
                const type = diagram.diagramType || 'workflow';
                if (!acc[type]) acc[type] = [];
                acc[type].push(diagram);
                return acc;
            }, {} as Record<string, import('../services/DiagramService.js').DiagramMetadata[]>);

            // Add diagram grouping styles if not already added
            this.addDiagramGroupingStyles();

            // Render grouped sections
            Object.entries(grouped).forEach(([type, typeDiagrams]) => {
                const section = this.createDiagramSection(type, typeDiagrams, loadDiagramCallback, deleteDiagramCallback);
                listElement.appendChild(section);
            });
        } else {
            console.error('UIManager: diagram-list element not found in diagramListElement');
        }
    }

    private createDiagramSection(
        type: string,
        diagrams: import('../services/DiagramService.js').DiagramMetadata[],
        loadDiagramCallback: (diagramId: string) => void,
        deleteDiagramCallback?: (diagramId: string, diagramName: string) => void
    ): HTMLElement {
        const section = document.createElement('div');
        section.className = 'diagram-section';

        // Create collapsible header
        const header = document.createElement('div');
        header.className = 'diagram-section-header';
        header.innerHTML = `
            <span class="section-icon">${this.getTypeIcon(type)}</span>
            <span class="section-title">${this.getTypeLabel(type)}</span>
            <span class="section-count">${diagrams.length}</span>
            <span class="section-chevron">▼</span>
        `;

        // Create content container
        const content = document.createElement('div');
        content.className = 'diagram-section-content';

        // Add diagram items
        diagrams.forEach((diagram) => {
            const item = this.createDiagramListItem(diagram, loadDiagramCallback, deleteDiagramCallback);
            content.appendChild(item);
        });

        // Make header collapsible
        header.addEventListener('click', () => {
            const isCollapsed = content.classList.toggle('collapsed');
            header.classList.toggle('collapsed', isCollapsed);
            const chevron = header.querySelector('.section-chevron');
            if (chevron) {
                chevron.textContent = isCollapsed ? '▶' : '▼';
            }
        });

        section.appendChild(header);
        section.appendChild(content);

        return section;
    }

    private createDiagramListItem(
        diagram: import('../services/DiagramService.js').DiagramMetadata,
        loadDiagramCallback: (diagramId: string) => void,
        deleteDiagramCallback?: (diagramId: string, diagramName: string) => void
    ): HTMLElement {
        const li = document.createElement('li');
        li.className = 'diagram-item';
        li.innerHTML = `
            <div class="diagram-item-content">
                <div class="diagram-item-name">${diagram.name}</div>
            </div>
            <div class="diagram-item-actions">
                <button class="load-btn" title="Load diagram">Load</button>
                <button class="delete-btn" title="Delete diagram">×</button>
            </div>
        `;

        // Add load event listener
        li.querySelector('.load-btn')!.addEventListener('click', () => {
            console.log('UIManager: Load button clicked for diagram:', diagram.id);
            loadDiagramCallback(diagram.id);
        });

        // Add delete event listener if callback provided
        if (deleteDiagramCallback) {
            li.querySelector('.delete-btn')!.addEventListener('click', async (e) => {
                e.stopPropagation();
                console.log('UIManager: Delete button clicked for diagram:', diagram.id);
                deleteDiagramCallback(diagram.id, diagram.name);
            });
        }

        return li;
    }

    private getTypeIcon(type: string): string {
        const iconMap: Record<string, string> = {
            'workflow': '📊',
            'bpmn': '📊',
            'uml-class': '🏗️',
            'system-architecture': '🏭',
            'wasm-component': '📦',
            'wit-schema': '🔷',
            // Legacy support for old 'wit-interface' diagram type
            'wit-interface': '🔷'
        };
        return iconMap[type] || '📋';
    }

    private getTypeLabel(type: string): string {
        const labelMap: Record<string, string> = {
            'workflow': 'Workflow Diagrams',
            'bpmn': 'BPMN Diagrams',
            'uml-class': 'UML Class Diagrams',
            'system-architecture': 'System Architecture',
            'wasm-component': 'WASM Components',
            'wit-schema': 'WIT Schemas',
            // Legacy support for old 'wit-interface' diagram type
            'wit-interface': 'WIT Schemas'
        };
        return labelMap[type] || type.split('-').map(word =>
            word.charAt(0).toUpperCase() + word.slice(1)
        ).join(' ');
    }

    private addDiagramGroupingStyles(): void {
        // Check if styles already added
        if (document.querySelector('#diagram-grouping-styles')) return;

        const style = document.createElement('style');
        style.id = 'diagram-grouping-styles';
        style.textContent = `
            .diagram-section {
                margin-bottom: 12px;
            }

            .diagram-section-header {
                display: flex;
                align-items: center;
                gap: 8px;
                padding: 8px 12px;
                background: var(--bg-tertiary);
                border-radius: var(--radius-sm);
                cursor: pointer;
                transition: all 0.2s ease;
                user-select: none;
            }

            .diagram-section-header:hover {
                background: var(--bg-secondary);
                transform: translateX(2px);
            }

            .diagram-section-header.collapsed {
                opacity: 0.7;
            }

            .section-icon {
                font-size: 16px;
                flex-shrink: 0;
            }

            .section-title {
                flex: 1;
                font-size: 13px;
                font-weight: 600;
                color: var(--text-primary);
            }

            .section-count {
                background: var(--accent-wasm);
                color: white;
                padding: 2px 8px;
                border-radius: 10px;
                font-size: 11px;
                font-weight: 600;
                flex-shrink: 0;
            }

            .section-chevron {
                font-size: 10px;
                color: var(--text-secondary);
                transition: transform 0.2s ease;
                flex-shrink: 0;
            }

            .diagram-section-content {
                padding: 4px 0 4px 12px;
                max-height: 1000px;
                overflow: hidden;
                transition: max-height 0.3s ease, opacity 0.3s ease;
                opacity: 1;
            }

            .diagram-section-content.collapsed {
                max-height: 0;
                opacity: 0;
                padding: 0 0 0 12px;
            }

            .diagram-item {
                display: flex;
                align-items: center;
                gap: 8px;
                padding: 8px 12px;
                margin: 4px 0;
                background: var(--bg-secondary);
                border-radius: var(--radius-sm);
                transition: all 0.2s ease;
                list-style: none;
            }

            .diagram-item:hover {
                background: var(--bg-tertiary);
                transform: translateX(4px);
            }

            .diagram-item-content {
                flex: 1;
                min-width: 0;
            }

            .diagram-item-name {
                font-weight: 500;
                font-size: 13px;
                color: var(--text-primary);
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }

            .diagram-item-actions {
                display: flex;
                gap: 4px;
                flex-shrink: 0;
            }

            .diagram-item .load-btn {
                background: var(--accent-wasm);
                color: white;
                border: none;
                padding: 4px 10px;
                border-radius: var(--radius-sm);
                cursor: pointer;
                font-size: 11px;
                font-weight: 600;
                transition: all 0.2s ease;
            }

            .diagram-item .load-btn:hover {
                background: var(--accent-info);
                transform: scale(1.05);
            }

            .diagram-item .delete-btn {
                background: transparent;
                color: var(--text-secondary);
                border: 1px solid var(--border);
                padding: 4px 8px;
                border-radius: var(--radius-sm);
                cursor: pointer;
                font-size: 14px;
                font-weight: bold;
                transition: all 0.2s ease;
                line-height: 1;
            }

            .diagram-item .delete-btn:hover {
                background: var(--accent-error);
                border-color: var(--accent-error);
                color: white;
                transform: scale(1.1);
            }

            /* Empty state for no diagrams in section */
            .diagram-section-content:empty::after {
                content: 'No diagrams';
                display: block;
                padding: 12px;
                color: var(--text-dim);
                font-size: 12px;
                text-align: center;
                font-style: italic;
            }
        `;
        document.head.appendChild(style);
    }
    
    public setupCreateDiagramButton(createDiagramCallback: () => void): void {
        const createBtn = this.diagramListElement.querySelector('#create-new-diagram-btn');
        if (createBtn) {
            createBtn.addEventListener('click', () => {
                console.log('UIManager: Create new diagram button clicked');
                createDiagramCallback();
            });
            
            // Add hover effect
            createBtn.addEventListener('mouseenter', () => {
                (createBtn as HTMLElement).style.background = 'var(--accent-info)';
            });
            createBtn.addEventListener('mouseleave', () => {
                (createBtn as HTMLElement).style.background = 'var(--accent-wasm)';
            });
        } else {
            console.error('UIManager: Create new diagram button not found');
        }
    }

    // Removed - now handled by updateUnifiedStatus

    public updateAIModelSelect(models: string[], currentModel: string, onModelChange: (modelName: string) => void): void {
        // Update AI events to include model change handler
        this.aiEvents.onModelChange = onModelChange;
        
        // Update the AI panel with new model information
        this.aiAssistantPanel.updateModelSelection(models, currentModel);
    }

    public updateAIOutput(content: string): void {
        // For the chat interface, we'll add messages instead of replacing content
        if (content.includes('ai-thinking')) {
            this.addAIMessage('AI', '🤖 Thinking...');
        } else if (content.includes('ai-error')) {
            const errorMatch = content.match(/ai-error[^>]*>([^<]+)</);
            if (errorMatch) {
                this.addAIMessage('AI', `❌ ${errorMatch[1]}`);
            }
        } else if (content.includes('ai-response')) {
            // Extract the response content
            const responseMatch = content.match(/<h4[^>]*>(.*?)<\/h4>/);
            if (responseMatch) {
                this.addAIMessage('AI', responseMatch[1]);
            }
        }
    }
    
    // Modern sidebar methods
    public updateSelectedElement(elementId: string, elementType: string, properties?: Record<string, unknown>): void {
        if (!this.propertiesSection) return;
        
        console.log('UIManager: updateSelectedElement called', { elementId, elementType, properties });
        
        this.propertiesSection.clearSelection();
        this.propertiesSection.setSelectedObject(elementId, elementType);
        
        // Add property groups based on element type
        if (elementType === 'node' && properties) {
            // General properties for all nodes
            this.propertiesSection.addPropertyGroup({
                id: 'general',
                label: 'General Properties',
                properties: [
                    { key: 'id', label: 'Element ID', value: elementId, type: 'text', readonly: true },
                    { key: 'label', label: 'Label', value: properties.label || '', type: 'text' },
                    { key: 'type', label: 'Node Type', value: properties.type || 'task', type: 'text', readonly: true }
                ]
            });

            // Position and size properties
            if (properties.bounds) {
                this.propertiesSection.addPropertyGroup({
                    id: 'layout',
                    label: 'Layout',
                    properties: [
                        { key: 'x', label: 'X Position', value: Math.round(properties.bounds.x || 0), type: 'number' },
                        { key: 'y', label: 'Y Position', value: Math.round(properties.bounds.y || 0), type: 'number' },
                        { key: 'width', label: 'Width', value: Math.round(properties.bounds.width || 100), type: 'number' },
                        { key: 'height', label: 'Height', value: Math.round(properties.bounds.height || 50), type: 'number' }
                    ]
                });
            }

            // WASM component specific properties
            if (properties.type === 'wasm-component') {
                const wasmProperties: Property[] = [
                    { key: 'componentName', label: 'Component Name', value: properties.componentName || 'Unknown', type: 'text', readonly: true },
                    { key: 'isLoaded', label: 'Loaded', value: properties.isLoaded ? 'Yes' : 'No', type: 'text', readonly: true },
                    { key: 'status', label: 'Status', value: properties.status || 'unknown', type: 'text', readonly: true }
                ];
                
                if (properties.witError) {
                    wasmProperties.push({ key: 'witError', label: 'WIT Error', value: properties.witError, type: 'text', readonly: true });
                } else if (properties.witInfo) {
                    // Add WIT summary information
                    wasmProperties.push(
                        { key: 'importsCount', label: 'Imports', value: properties.importsCount || 0, type: 'number', readonly: true },
                        { key: 'exportsCount', label: 'Exports', value: properties.exportsCount || 0, type: 'number', readonly: true },
                        { key: 'totalFunctions', label: 'Total Functions', value: properties.totalFunctions || 0, type: 'number', readonly: true },
                        { key: 'dependenciesCount', label: 'Dependencies', value: properties.dependenciesCount || 0, type: 'number', readonly: true }
                    );
                    
                    if (properties.witInfo.worldName) {
                        wasmProperties.push({ key: 'worldName', label: 'World', value: properties.witInfo.worldName, type: 'text', readonly: true });
                    }
                } else {
                    wasmProperties.push({ key: 'interfaces', label: 'Interface Count', value: Array.isArray(properties.interfaces) ? properties.interfaces.length : (properties.interfaces || 0), type: 'number', readonly: true });
                }
                
                this.propertiesSection.addPropertyGroup({
                    id: 'wasm-component',
                    label: 'WASM Component',
                    properties: wasmProperties
                });
                
                // Add WIT Interfaces section if available
                if (properties.witInfo && !properties.witError) {
                    this.addWitInterfacesSection(properties.witInfo);
                }
            }

            // Custom properties from the element
            if (properties.properties && Object.keys(properties.properties).length > 0) {
                const customProps = Object.entries(properties.properties)
                    .filter(([key, _value]) => !['label', 'type', 'bounds'].includes(key))
                    .map(([key, value]) => ({
                        key,
                        label: key.charAt(0).toUpperCase() + key.slice(1).replace(/([A-Z])/g, ' $1'),
                        value: typeof value === 'object' ? JSON.stringify(value) : String(value),
                        type: 'text' as const,
                        readonly: true
                    }));

                if (customProps.length > 0) {
                    this.propertiesSection.addPropertyGroup({
                        id: 'custom',
                        label: 'Custom Properties',
                        properties: customProps
                    });
                }
            }
        } else if (elementType === 'edge' && properties) {
            // General properties for edges
            this.propertiesSection.addPropertyGroup({
                id: 'general',
                label: 'General Properties',
                properties: [
                    { key: 'id', label: 'Element ID', value: elementId, type: 'text', readonly: true },
                    { key: 'label', label: 'Label', value: properties.label || '', type: 'text' },
                    { key: 'type', label: 'Edge Type', value: properties.type || 'flow', type: 'text', readonly: true }
                ]
            });

            // Connection properties
            this.propertiesSection.addPropertyGroup({
                id: 'connection',
                label: 'Connection',
                properties: [
                    { key: 'sourceId', label: 'Source Element', value: properties.sourceId || 'Unknown', type: 'text', readonly: true },
                    { key: 'targetId', label: 'Target Element', value: properties.targetId || 'Unknown', type: 'text', readonly: true },
                    { key: 'routingPoints', label: 'Routing Points', value: properties.routingPoints ? properties.routingPoints.length : 0, type: 'number', readonly: true }
                ]
            });
        }
    }
    
    public clearSelectedElement(): void {
        if (this.propertiesSection) {
            this.propertiesSection.clearSelection();
        }
    }
    
    public clearWasmComponents(): void {
        if (this.componentLibrarySection) {
            // Clear all components from the library
            // We'll need to add a clear method to ComponentLibrarySection
            console.log('UIManager: Clearing WASM components from library');
        }
    }
    
    public addWasmComponentToLibrary(component: WasmComponent): void {
        if (!this.componentLibrarySection) {
            console.warn('UIManager: Cannot add WASM component - componentLibrarySection not initialized');
            return;
        }
        
        console.log('UIManager: Adding WASM component to library:', component.name);
        
        this.componentLibrarySection.addComponent({
            id: component.id || component.name,
            name: component.name,
            category: this.categorizeWasmComponent(component),
            description: component.description || 'WASM Component',
            icon: this.getWasmComponentIcon(component),
            version: component.version,
            status: component.status || 'available',
            path: component.path,  // Include the path
            interfaces: component.interfaces,  // Include interfaces
            onSelect: () => {
                console.log('WASM component selected:', component.name);
                // Could show component details in properties panel
            }
        });
    }
    
    private categorizeWasmComponent(component: WasmComponent): string {
        // If component already has a category, use it
        if (component.category) {
            return component.category;
        }
        
        const name = component.name.toLowerCase();
        
        if (name.includes('physics') || name.includes('simulation')) return 'Simulation';
        if (name.includes('image') || name.includes('graphics') || name.includes('render') || name.includes('process')) return 'Media';
        if (name.includes('crypto') || name.includes('hash') || name.includes('encrypt')) return 'Security';
        if (name.includes('data') || name.includes('analytics') || name.includes('math') || name.includes('calculat')) return 'Computation';
        if (name.includes('audio') || name.includes('sound')) return 'Audio';
        if (name.includes('network') || name.includes('http')) return 'Network';
        if (name.includes('valid') || name.includes('util')) return 'Utilities';
        
        return 'General';
    }
    
    private getWasmComponentIcon(component: WasmComponent): string {
        const category = this.categorizeWasmComponent(component);
        
        switch (category) {
            case 'Simulation': return '⚡';
            case 'Media': return '🖼️';
            case 'Security': return '🔐';
            case 'Computation': return '🧮';
            case 'Audio': return '🔊';
            case 'Network': return '🌐';
            case 'Utilities': return '🔧';
            default: return '📦';
        }
    }
    
    public updateWasmComponentsList(components: WasmComponent[]): void {
        if (!this.componentLibrarySection) return;
        
        // Clear existing components
        components.forEach(component => {
            this.componentLibrarySection!.removeComponent(component.id || component.name);
        });
        
        // Add updated components
        components.forEach(component => {
            this.addWasmComponentToLibrary(component);
        });
    }
    
    public setCurrentDiagramType(type: string): void {
        if (this.diagramControlsSection) {
            this.diagramControlsSection.setDiagramType(type);
        }
    }
    
    public toggleSidebar(): void {
        if (this.sidebar) {
            this.sidebar.toggleCollapse();
        }
    }
    
    public isSidebarCollapsed(): boolean {
        return this.sidebar ? this.sidebar.isCollapsed() : false;
    }
    
    private closeShortcutsPopup(): void {
        const popup = document.getElementById('shortcuts-popup');
        if (popup) {
            popup.remove();
        }
    }
    
    private minimizeAIPanelToHeader(): void {
        console.log('Minimizing AI Assistant to header...');
        this.headerIconManager.addIcon({
            id: 'ai-assistant',
            title: 'AI Assistant',
            icon: '🤖',
            color: 'var(--accent-wasm)',
            onClick: () => this.restoreAIPanel(),
            onClose: () => this.closeAIPanel()
        });
        console.log('AI Assistant minimized to header successfully');
    }
    
    private restoreAIPanel(): void {
        this.aiAssistantPanel.show();
        this.headerIconManager.removeIcon('ai-assistant');
        console.log('AI Assistant restored from header');
    }
    
    private closeAIPanel(): void {
        this.aiAssistantPanel.close();
        this.headerIconManager.removeIcon('ai-assistant');
        console.log('AI Assistant closed');
    }
    
    public updateComponentStatus(componentId: string, status: 'available' | 'loading' | 'error'): void {
        if (this.componentLibrarySection) {
            this.componentLibrarySection.updateComponent(componentId, { status });
        }
    }

    // Professional Dialog Methods
    // ===========================

    /**
     * Show a professional diagram type selection dialog
     */
    public async showDiagramTypeSelector(existingNames?: string[]): Promise<{ type: DiagramTypeConfig; name: string } | null> {
        const diagramTypes = diagramTypeRegistry.getAvailableTypes();
        
        // First, select the diagram type
        const selectedType = await DiagramTypeDialog.showDiagramTypeSelector(diagramTypes, {
            showDescriptions: true,
            showCategoryHeaders: diagramTypes.length > 4
        });

        if (!selectedType) {
            return null; // User cancelled type selection
        }

        // Then, get the diagram name
        const diagramName = await DiagramNameDialog.promptForDiagramName(
            selectedType,
            existingNames,
            {
                showTypeInfo: true,
                suggestDefault: true
            }
        );

        if (!diagramName) {
            return null; // User cancelled name input
        }

        return {
            type: selectedType,
            name: diagramName
        };
    }

    /**
     * Show a professional confirmation dialog
     */
    public async showConfirmDialog(
        message: string,
        options: {
            title?: string;
            details?: string;
            confirmText?: string;
            cancelText?: string;
            variant?: 'default' | 'danger' | 'warning' | 'info';
        } = {}
    ): Promise<boolean> {
        return new Promise((resolve) => {
            const dialog = new ConfirmDialog(
                {
                    title: options.title || 'Confirm Action',
                    message,
                    details: options.details,
                    confirmText: options.confirmText || 'Yes',
                    cancelText: options.cancelText || 'No',
                    variant: options.variant || 'default'
                },
                {
                    onConfirm: () => {
                        dialog.close();
                        resolve(true);
                    },
                    onCancel: () => {
                        dialog.close();
                        resolve(false);
                    }
                }
            );

            dialog.show();
        });
    }

    /**
     * Show a professional alert dialog
     */
    public async showAlert(
        message: string,
        options: {
            title?: string;
            details?: string;
            variant?: 'info' | 'success' | 'warning' | 'error';
            copyable?: boolean;
        } = {}
    ): Promise<void> {
        return new Promise((resolve) => {
            const dialog = new AlertDialog(
                {
                    title: options.title,
                    message,
                    details: options.details,
                    variant: options.variant || 'info',
                    copyable: options.copyable || false,
                    expandable: !!options.details
                },
                {
                    onConfirm: () => {
                        dialog.close();
                        resolve();
                    }
                }
            );

            dialog.show();
        });
    }

    /**
     * Show a professional prompt dialog
     */
    public async showPrompt(
        message: string,
        options: {
            title?: string;
            placeholder?: string;
            defaultValue?: string;
            required?: boolean;
            validation?: {
                minLength?: number;
                maxLength?: number;
                pattern?: RegExp;
                message?: string;
            };
        } = {}
    ): Promise<string | null> {
        return new Promise((resolve) => {
            const dialog = new PromptDialog(
                {
                    title: options.title || 'Input Required',
                    message,
                    placeholder: options.placeholder,
                    defaultValue: options.defaultValue,
                    required: options.required !== false,
                    minLength: options.validation?.minLength,
                    maxLength: options.validation?.maxLength,
                    pattern: options.validation?.pattern,
                    validationMessage: options.validation?.message
                },
                {
                    onConfirm: (value) => {
                        dialog.close();
                        resolve(value || null);
                    },
                    onCancel: () => {
                        dialog.close();
                        resolve(null);
                    }
                }
            );

            dialog.show();
        });
    }

    /**
     * Show a professional delete confirmation dialog
     */
    public async showDeleteConfirm(itemName: string, details?: string): Promise<boolean> {
        return new Promise((resolve) => {
            const dialog = new ConfirmDialog(
                {
                    title: 'Delete Confirmation',
                    message: `Are you sure you want to delete "${itemName}"?`,
                    details: details || 'This action cannot be undone.',
                    confirmText: 'Delete',
                    cancelText: 'Cancel',
                    variant: 'danger',
                    icon: '🗑️'
                },
                {
                    onConfirm: () => {
                        dialog.close();
                        resolve(true);
                    },
                    onCancel: () => {
                        dialog.close();
                        resolve(false);
                    }
                }
            );

            dialog.show();
        });
    }

    /**
     * Show a professional error dialog
     */
    public async showError(message: string, details?: string): Promise<void> {
        return this.showAlert(message, {
            title: 'Error',
            details,
            variant: 'error',
            copyable: !!details
        });
    }

    /**
     * Show a professional success dialog
     */
    public async showSuccess(message: string, details?: string): Promise<void> {
        return this.showAlert(message, {
            title: 'Success',
            details,
            variant: 'success'
        });
    }

    /**
     * Show a professional warning dialog
     */
    public async showWarning(message: string, details?: string): Promise<void> {
        return this.showAlert(message, {
            title: 'Warning',
            details,
            variant: 'warning'
        });
    }

    /**
     * Get the dialog manager instance for advanced usage
     */
    public getDialogManager() {
        return dialogManager;
    }

    private updateDiagramHeaderIcon(status: CombinedStatus): void {
        const diagramIconId = 'current-diagram';
        
        console.log('UIManager: updateDiagramHeaderIcon called with status:', {
            diagramName: status.diagram.currentDiagramName,
            diagramId: status.diagram.currentDiagramId,
            syncStatus: status.diagram.syncStatus,
            nameType: typeof status.diagram.currentDiagramName,
            idType: typeof status.diagram.currentDiagramId
        });
        
        if (status.diagram.currentDiagramName && status.diagram.currentDiagramId && status.diagram.syncStatus !== 'none') {
            // Get sync status indicator
            const syncIcon = this.getSyncStatusIcon(status.diagram.syncStatus);
            
            // Check if we already have an icon for this diagram to avoid recreating it
            const existingIcon = this.headerIconManager.hasIcon(diagramIconId);
            const newIconData = {
                id: diagramIconId,
                title: status.diagram.currentDiagramName,
                icon: `📊 ${syncIcon.icon}`,
                color: syncIcon.color,
                onClick: () => {
                    console.log('Header diagram icon clicked:', status.diagram.currentDiagramId);
                    // Could add navigation to diagram or show details here
                }
                // Removed onClose to prevent accidental diagram clearing
                // Users can close diagrams from the diagram list instead
            };
            
            // Only update if icon doesn't exist or if sync status changed
            if (!existingIcon) {
                console.log('UIManager: Adding new diagram header icon for:', status.diagram.currentDiagramName);
                console.log('UIManager: Icon data:', newIconData);
                this.headerIconManager.addIcon(newIconData);
                console.log('UIManager: Header icon added successfully');
            } else {
                console.log('UIManager: Updating existing diagram header icon');
                // Just update the icon content without recreating (to avoid triggering onClose)
                this.headerIconManager.updateIcon(diagramIconId, {
                    icon: `📊 ${syncIcon.icon}`,
                    color: syncIcon.color,
                    title: status.diagram.currentDiagramName
                });
                console.log('UIManager: Header icon updated successfully');
            }
        } else {
            // Remove the icon if no current diagram
            console.log('UIManager: No current diagram, checking if header icon exists');
            if (this.headerIconManager.hasIcon(diagramIconId)) {
                console.log('UIManager: Removing diagram header icon - no current diagram');
                this.headerIconManager.removeIcon(diagramIconId);
                console.log('UIManager: Header icon removed successfully');
            } else {
                console.log('UIManager: No header icon to remove');
            }
        }
    }

    private getSyncStatusIcon(syncStatus: string): { icon: string; color: string } {
        switch (syncStatus) {
            case 'synced':
                return { icon: '✅', color: 'var(--accent-success, #3FB950)' };
            case 'saving':
                return { icon: '🔄', color: 'var(--accent-wasm, #654FF0)' };
            case 'unsaved':
                return { icon: '⚠️', color: 'var(--accent-warning, #F7CC33)' };
            case 'error':
                return { icon: '❌', color: 'var(--accent-error, #F85149)' };
            case 'loading':
                return { icon: '⏳', color: 'var(--text-secondary, #7D8590)' };
            default:
                return { icon: '⭕', color: 'var(--text-secondary, #7D8590)' };
        }
    }
    
    private addWitInterfacesSection(witInfo: WitInterfaceInfo): void {
        // Add imports section
        if (witInfo.imports && witInfo.imports.length > 0) {
            const importProperties = [];
            witInfo.imports.forEach((iface, index: number) => {
                importProperties.push({
                    key: `import_${index}`,
                    label: iface.name || `Import ${index + 1}`,
                    value: `${iface.functions?.length || 0} functions`,
                    type: 'text',
                    readonly: true
                });
                
                // Add function details
                if (iface.functions && iface.functions.length > 0) {
                    iface.functions.forEach((func, funcIndex) => {
                        const paramStr = func.params?.map((p) => `${p.name}: ${p.type}`).join(', ') || '';
                        const resultStr = func.results?.map((r) => `${r.name}: ${r.type}`).join(', ') || 'void';
                        importProperties.push({
                            key: `import_${index}_func_${funcIndex}`,
                            label: `  └ ${func.name}`,
                            value: `(${paramStr}) → ${resultStr}`,
                            type: 'text',
                            readonly: true
                        });
                    });
                }
            });
            
            this.propertiesSection.addPropertyGroup({
                id: 'wit-imports',
                label: 'WIT Imports',
                properties: importProperties,
                collapsed: true
            });
        }
        
        // Add exports section
        if (witInfo.exports && witInfo.exports.length > 0) {
            const exportProperties = [];
            witInfo.exports.forEach((iface, index) => {
                exportProperties.push({
                    key: `export_${index}`,
                    label: iface.name || `Export ${index + 1}`,
                    value: `${iface.functions?.length || 0} functions`,
                    type: 'text',
                    readonly: true
                });
                
                // Add function details
                if (iface.functions && iface.functions.length > 0) {
                    iface.functions.forEach((func, funcIndex) => {
                        const paramStr = func.params?.map((p) => `${p.name}: ${p.type}`).join(', ') || '';
                        const resultStr = func.results?.map((r) => `${r.name}: ${r.type}`).join(', ') || 'void';
                        exportProperties.push({
                            key: `export_${index}_func_${funcIndex}`,
                            label: `  └ ${func.name}`,
                            value: `(${paramStr}) → ${resultStr}`,
                            type: 'text',
                            readonly: true
                        });
                    });
                }
            });
            
            this.propertiesSection.addPropertyGroup({
                id: 'wit-exports',
                label: 'WIT Exports',
                properties: exportProperties,
                collapsed: true
            });
        }
        
        // Add dependencies section
        if (witInfo.dependencies && witInfo.dependencies.length > 0) {
            const depProperties = witInfo.dependencies.map((dep, index) => ({
                key: `dep_${index}`,
                label: dep.package,
                value: dep.version || 'latest',
                type: 'text',
                readonly: true
            }));
            
            this.propertiesSection.addPropertyGroup({
                id: 'wit-dependencies',
                label: 'WIT Dependencies',
                properties: depProperties,
                collapsed: true
            });
        }
    }

    /**
     * Refresh UI components that depend on workspace content
     */
    public refreshWorkspaceUI(): void {
        console.log('UIManager: Refreshing workspace UI components...');
        
        // Refresh component library to show newly discovered WASM components
        if (this.componentLibrarySection) {
            console.log('UIManager: Refreshing component library');
            this.componentLibrarySection.refresh();
        }
        
        // Refresh diagram controls to show any new diagrams
        if (this.diagramControlsSection) {
            console.log('UIManager: Refreshing diagram controls');
            this.diagramControlsSection.refresh();
        }
        
        // Update recent workspaces list
        if (this.workspaceSelector) {
            console.log('UIManager: Refreshing workspace selector');
            this.workspaceSelector.loadRecentWorkspaces();
        }
        
        console.log('UIManager: Workspace UI refresh completed');
    }

    private setupResponsiveHeaderCoordination(): void {
        console.log('UIManager: Setting up responsive header coordination');
        
        // Setup mobile menu button handler
        this.setupMobileMenuButton();
        
        // Setup responsive layout monitoring
        this.setupResponsiveLayoutMonitoring();
        
        // Setup mobile-specific UI adaptations
        this.setupMobileUIAdaptations();
        
        console.log('UIManager: Responsive header coordination setup complete');
    }
    
    private setupMobileMenuButton(): void {
        const mobileMenuBtn = document.getElementById('mobile-menu-btn');
        if (mobileMenuBtn) {
            console.log('UIManager: Setting up mobile menu button handler');
            
            mobileMenuBtn.addEventListener('click', () => {
                console.log('UIManager: Mobile menu button clicked');
                this.toggleMobileMenu();
            });
            
            // Add visual feedback
            mobileMenuBtn.addEventListener('touchstart', () => {
                mobileMenuBtn.style.transform = 'scale(0.95)';
            });
            
            mobileMenuBtn.addEventListener('touchend', () => {
                setTimeout(() => {
                    mobileMenuBtn.style.transform = 'scale(1)';
                }, 100);
            });
        } else {
            console.warn('UIManager: Mobile menu button not found in DOM');
        }
    }
    
    private setupResponsiveLayoutMonitoring(): void {
        // Monitor viewport changes for responsive layout coordination
        const handleViewportChange = () => {
            const isMobile = window.innerWidth <= 768;
            const isTablet = window.innerWidth > 768 && window.innerWidth <= 1199;
            
            console.log('UIManager: Viewport changed - Mobile:', isMobile, 'Tablet:', isTablet);
            
            // Coordinate sidebar behavior with header responsive state
            if (this.sidebar) {
                if (isMobile) {
                    // On mobile, ensure sidebar is collapsed by default
                    if (!this.sidebar.isCollapsed()) {
                        console.log('UIManager: Auto-collapsing sidebar for mobile');
                        this.sidebar.collapse();
                    }
                }
            }
            
            // Update AI panel behavior for mobile
            if (isMobile && this.aiAssistantPanel) {
                // Ensure AI panel is positioned appropriately for mobile
                this.adaptAIPanelForMobile();
            }
        };
        
        // Use ResizeObserver if available, otherwise fallback to resize event
        if (typeof ResizeObserver !== 'undefined') {
            const resizeObserver = new ResizeObserver(handleViewportChange);
            resizeObserver.observe(document.body);
        } else {
            window.addEventListener('resize', () => {
                setTimeout(handleViewportChange, 100);
            });
        }
        
        // Initial check
        setTimeout(handleViewportChange, 100);
    }
    
    private setupMobileUIAdaptations(): void {
        // Setup touch-friendly interactions and mobile-specific UI behavior
        const setupTouchFriendlyInteractions = () => {
            // Make toolbar buttons more touch-friendly on mobile
            const toolbarButtons = this.toolbarElement.querySelectorAll('button');
            toolbarButtons.forEach(button => {
                button.addEventListener('touchstart', () => {
                    button.style.transform = 'scale(0.95)';
                });
                
                button.addEventListener('touchend', () => {
                    setTimeout(() => {
                        button.style.transform = 'scale(1)';
                    }, 100);
                });
            });
        };
        
        // Setup when DOM is ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', setupTouchFriendlyInteractions);
        } else {
            setupTouchFriendlyInteractions();
        }
    }
    
    private toggleMobileMenu(): void {
        console.log('UIManager: Toggling mobile menu');
        
        if (this.sidebar) {
            const isCollapsed = this.sidebar.isCollapsed();
            
            if (isCollapsed) {
                console.log('UIManager: Expanding sidebar for mobile menu');
                this.sidebar.expand();
                // On mobile, add overlay to close sidebar when clicking outside
                this.addMobileMenuOverlay();
            } else {
                console.log('UIManager: Collapsing sidebar for mobile menu');
                this.sidebar.collapse();
                this.removeMobileMenuOverlay();
            }
        } else {
            console.warn('UIManager: Cannot toggle mobile menu - sidebar not initialized');
        }
    }
    
    private addMobileMenuOverlay(): void {
        // Only add overlay on mobile/tablet
        if (window.innerWidth > 768) return;
        
        const overlay = document.createElement('div');
        overlay.id = 'mobile-menu-overlay';
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.5);
            z-index: 999;
            backdrop-filter: blur(2px);
            animation: fadeIn 0.2s ease;
        `;
        
        // Close menu when overlay is clicked
        overlay.addEventListener('click', () => {
            this.toggleMobileMenu();
        });
        
        document.body.appendChild(overlay);
        
        // Prevent body scroll when menu is open
        document.body.style.overflow = 'hidden';
    }
    
    private removeMobileMenuOverlay(): void {
        const overlay = document.getElementById('mobile-menu-overlay');
        if (overlay) {
            overlay.remove();
            document.body.style.overflow = '';
        }
    }
    
    private adaptAIPanelForMobile(): void {
        if (!this.aiAssistantPanel || window.innerWidth > 768) return;
        
        const panelElement = this.aiAssistantPanel.getElement();
        if (panelElement) {
            // Ensure AI panel takes appropriate mobile dimensions
            panelElement.style.cssText += `
                position: fixed;
                top: 60px;
                left: 10px;
                right: 10px;
                bottom: 10px;
                width: auto;
                height: auto;
                max-width: none;
                max-height: none;
                border-radius: 12px;
            `;
        }
    }
    
    // Public methods for responsive header coordination
    
    /**
     * Check if the current viewport is in mobile mode
     */
    public isMobileViewport(): boolean {
        return window.innerWidth <= 768;
    }
    
    /**
     * Check if the current viewport is in tablet mode
     */
    public isTabletViewport(): boolean {
        return window.innerWidth > 768 && window.innerWidth <= 1199;
    }
    
    /**
     * Get the current responsive breakpoint
     */
    public getCurrentBreakpoint(): string {
        const width = window.innerWidth;
        if (width <= 480) return 'mobile';
        if (width <= 768) return 'tablet';
        if (width <= 1199) return 'desktop-small';
        return 'desktop';
    }
    
    /**
     * Force close mobile menu (useful for navigation actions)
     */
    public closeMobileMenu(): void {
        if (this.isMobileViewport() && this.sidebar && !this.sidebar.isCollapsed()) {
            console.log('UIManager: Force closing mobile menu');
            this.sidebar.collapse();
            this.removeMobileMenuOverlay();
        }
    }
    
    /**
     * Coordinate responsive behavior between UI components
     */
    public coordinateResponsiveBehavior(): void {
        const breakpoint = this.getCurrentBreakpoint();
        console.log('UIManager: Coordinating responsive behavior for breakpoint:', breakpoint);
        
        // Update header icon manager about current breakpoint
        // The HeaderIconManager handles its own responsive behavior,
        // but we can trigger updates if needed
        
        // Coordinate AI panel responsive behavior
        if (breakpoint === 'mobile') {
            this.adaptAIPanelForMobile();
        }
        
        // Coordinate sidebar responsive behavior
        if (this.sidebar) {
            if (breakpoint === 'mobile' && !this.sidebar.isCollapsed()) {
                // Auto-collapse on mobile unless explicitly opened via menu
                const mobileMenuOverlay = document.getElementById('mobile-menu-overlay');
                if (!mobileMenuOverlay) {
                    this.sidebar.collapse();
                }
            }
        }
    }
    
    public destroy(): void {
        if (this.statusListener) {
            statusManager.removeListener(this.statusListener);
        }
        
        // Clean up mobile menu overlay if it exists
        this.removeMobileMenuOverlay();
    }
}