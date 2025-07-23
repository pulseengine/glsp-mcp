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
    public getThemeController(): ThemeController { return this.themeController; }
    public getHeaderIconManager(): HeaderIconManager { return this.headerIconManager; }
    
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
        
        // Update header status
        const headerIndicator = document.querySelector('#connection-indicator');
        const headerSpan = headerIndicator?.parentElement?.querySelector('span');
        console.log('UIManager: Header indicator found:', !!headerIndicator, !!headerSpan);
        if (headerIndicator && headerSpan) {
            headerIndicator.className = `status-indicator ${status.mcp ? '' : 'disconnected'}`;
            headerSpan.textContent = status.mcp ? 'MCP Connected' : 'MCP Disconnected';
        }

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
            diagrams.forEach((diagram) => {
                console.log('UIManager: Adding diagram to list:', diagram.name, diagram.id);
                const li = document.createElement('li');
                li.innerHTML = `
                    <div style="flex: 1;">
                        <div style="font-weight: 500;">${diagram.name}</div>
                        <div style="font-size: 0.8em; color: var(--text-dim);">${diagram.diagramType}</div>
                    </div>
                    <div style="display: flex; gap: 4px;">
                        <button class="load-btn" style="
                            background: var(--accent-wasm); 
                            color: white; 
                            border: none; 
                            padding: 4px 8px; 
                            border-radius: var(--radius-sm); 
                            cursor: pointer; 
                            font-size: 11px;
                        ">Load</button>
                        <button class="delete-btn" style="
                            background: var(--accent-error); 
                            color: white; 
                            border: none; 
                            padding: 4px 8px; 
                            border-radius: var(--radius-sm); 
                            cursor: pointer; 
                            font-size: 11px;
                        " title="Delete diagram">×</button>
                    </div>
                `;
                
                // Update li styling for flex layout
                li.style.display = 'flex';
                li.style.alignItems = 'center';
                li.style.gap = '8px';
                
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
                        // AppController handles the confirmation dialog
                        deleteDiagramCallback(diagram.id, diagram.name);
                    });
                }
                
                listElement.appendChild(li);
            });
        } else {
            console.error('UIManager: diagram-list element not found in diagramListElement');
        }
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

    public destroy(): void {
        if (this.statusListener) {
            statusManager.removeListener(this.statusListener);
        }
    }
}