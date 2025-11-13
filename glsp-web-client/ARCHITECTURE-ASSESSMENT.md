# Frontend Architecture Assessment & Modernization Recommendations

## Executive Summary

The glsp-web-client has **~40,000 lines of TypeScript** implementing a class-based, vanilla JavaScript architecture. While the codebase demonstrates good separation of concerns at the service layer, the UI layer suffers from **monolithic classes, scattered state management, and lack of modern component patterns**.

**Verdict:** The current architecture can be significantly improved through **targeted refactoring** rather than a full framework migration. The codebase is already well-structured enough that adopting a framework would require rewriting most UI code without proportional benefits.

---

## Current State Analysis

### Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                      index.html (2,499 lines!)           │
│  ├── Inline CSS (~1,500 lines)                          │
│  ├── HTML Structure (~800 lines)                        │
│  └── Script imports                                     │
└─────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────┐
│                     AppController.ts                     │
│                      (1,461 lines)                       │
│  ├── Service initialization                             │
│  ├── UI mounting                                        │
│  ├── Event coordination                                 │
│  └── AI integration                                     │
└─────────────────────────────────────────────────────────┘
                              │
                  ┌───────────┴───────────┐
                  ▼                       ▼
    ┌─────────────────────┐   ┌──────────────────────┐
    │  UIManager (2,187)   │   │  Services Layer      │
    │  ├── Toolbar         │   │  ├── McpService      │
    │  ├── Dialogs         │   │  ├── DiagramService  │
    │  ├── AI Panel        │   │  ├── AIService       │
    │  ├── Sidebar         │   │  ├── ValidationSvc   │
    │  └── Mobile menu     │   │  └── StatusManager   │
    └─────────────────────┘   └──────────────────────┘
                              │
                  ┌───────────┴───────────┐
                  ▼                       ▼
    ┌─────────────────────┐   ┌──────────────────────┐
    │ CanvasRenderer       │   │ SidebarComponent     │
    │ (3,015 lines)        │   │ (485 lines)          │
    │  ├── Rendering       │   │  ├── Sections[]      │
    │  ├── Interaction     │   │  ├── Collapse        │
    │  └── State (20+)     │   │  └── Resize          │
    └─────────────────────┘   └──────────────────────┘
```

### Key Metrics

| Metric | Value | Assessment |
|--------|-------|------------|
| **Total TypeScript LOC** | 39,571 | Large codebase |
| **Number of .ts files** | 74 | Well-modularized |
| **Largest file** | UIManager.ts (2,187) | 🔴 Too large |
| **Second largest** | CanvasRenderer.ts (3,015) | 🔴 God object |
| **Third largest** | InteractionManager.ts (1,749) | 🔴 Too complex |
| **index.html size** | 2,499 lines | 🔴 Should be <200 |
| **UI code** | 19,556 lines | ~50% of codebase |
| **Test coverage** | 10.1% overall | ⚠️ Low but improving |

### Architecture Style

**Current:** Class-based, service-oriented, event-driven vanilla TypeScript
- ✅ Good: Service container pattern with DI
- ✅ Good: Clear separation between services and UI
- ✅ Good: Modular TypeScript with ES6 imports
- ❌ Bad: God objects (UIManager, CanvasRenderer)
- ❌ Bad: Scattered state management
- ❌ Bad: Inline HTML/CSS generation
- ❌ Bad: Event system fragmentation

---

## Critical Issues

### 🔴 Issue #1: Monolithic UI Classes

**UIManager.ts** handles:
- Toolbar creation and updates
- Dialog management system
- AI panel setup and coordination
- Sidebar initialization
- Mobile menu toggling
- Responsive layout coordination
- Status bar updates

**Impact:** Impossible to test individual features, hard to modify, violates Single Responsibility Principle

**Example:**
```typescript
// UIManager.ts line ~800
private createToolbar(): void {
    const html = `
        <div class="toolbar">
            <div class="toolbar-group">
                <!-- 100+ lines of HTML -->
            </div>
        </div>
    `;
    this.toolbarElement.innerHTML = html;
}
```

### 🔴 Issue #2: Massive index.html (2,499 lines)

The HTML file contains:
- ~1,500 lines of inline CSS
- ~800 lines of HTML structure
- Multiple style blocks for different components
- Responsive media queries inline

**Impact:**
- Cannot extract CSS to optimize loading
- No CSS tree-shaking or minification
- Difficult to maintain consistent styling
- Poor separation of concerns

### 🔴 Issue #3: State Management Chaos

State is scattered across:
- **AppController** (initialization state)
- **DiagramService** (diagram state)
- **UIManager** (UI state)
- **CanvasRenderer** (20+ properties for interaction state)
- **StatusManager** (connection/diagram status)
- **SelectionManager** (selection state)

**No single source of truth**, making it hard to:
- Debug state issues
- Implement undo/redo
- Persist state
- Reason about data flow

### 🔴 Issue #4: Event System Fragmentation

Three different patterns coexist:
```typescript
// Pattern 1: window.dispatchEvent (scattered)
window.dispatchEvent(new CustomEvent('toolbar-mode-change', { detail: { mode } }));

// Pattern 2: Direct callbacks (method parameters)
this.uiManager.setupToolbarEventHandlers(async (newType: string) => { ... });

// Pattern 3: addEventListener chains
this.element.addEventListener('click', () => {});
document.addEventListener('keydown', () => {});
```

**Impact:** Hard to track dependencies, difficult to debug, easy to create memory leaks

### ⚠️ Issue #5: Code Duplication

- **Drag handling:** Duplicated in SidebarComponent, UIManager (AI panel), CanvasRenderer
- **Dialog patterns:** Similar code repeated across AlertDialog, ConfirmDialog, PromptDialog
- **Event setup:** Repeated addEventListener patterns in every component

---

## Comparison: Framework vs. Refactoring

### Option A: Migrate to Framework (React/Vue/Svelte)

#### React + TypeScript
```typescript
// How it would look
interface DiagramToolbarProps {
  diagramType: string;
  onTypeChange: (type: string) => void;
  availableTypes: DiagramType[];
}

export const DiagramToolbar: React.FC<DiagramToolbarProps> = ({
  diagramType, onTypeChange, availableTypes
}) => {
  return (
    <div className="toolbar">
      <select value={diagramType} onChange={(e) => onTypeChange(e.target.value)}>
        {availableTypes.map(type => (
          <option key={type.type} value={type.type}>{type.label}</option>
        ))}
      </select>
    </div>
  );
};
```

**Pros:**
- ✅ Component model built-in
- ✅ Strong ecosystem (React DevTools, testing libraries)
- ✅ Declarative UI updates (no manual DOM manipulation)
- ✅ State management solutions (Redux Toolkit, Zustand)
- ✅ Better testability with component testing
- ✅ Type-safe props and state

**Cons:**
- ❌ **Rewrite 19,556 lines of UI code** (~80% of UI layer)
- ❌ Canvas rendering stays the same (no benefit)
- ❌ Service layer stays the same (already good)
- ❌ 2-3 months of development time
- ❌ Risk of introducing new bugs
- ❌ Bundle size increases (~150KB for React)
- ❌ Learning curve if team unfamiliar

**Estimated effort:** 320-480 hours (2-3 developers, 2-3 months)

---

#### Vue 3 + TypeScript
```typescript
<template>
  <div class="toolbar">
    <select v-model="selectedType" @change="handleChange">
      <option v-for="type in types" :key="type.type" :value="type.type">
        {{ type.label }}
      </option>
    </select>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';

const props = defineProps<{
  types: DiagramType[];
  modelValue: string;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: string];
}>();
</script>
```

**Pros:**
- ✅ Single File Components (template + script + style)
- ✅ Built-in state management (Pinia)
- ✅ Composition API for better code organization
- ✅ Smaller bundle size than React (~100KB)
- ✅ Excellent TypeScript support
- ✅ Vue DevTools

**Cons:**
- ❌ Still requires **full rewrite** of UI layer
- ❌ 2-3 months development time
- ❌ Less ecosystem than React
- ❌ Learning curve

**Estimated effort:** 280-400 hours (2-3 developers, 2-3 months)

---

#### Svelte + TypeScript
```typescript
<script lang="ts">
  export let diagramType: string;
  export let availableTypes: DiagramType[];

  function handleChange(event: Event) {
    const target = event.target as HTMLSelectElement;
    diagramType = target.value;
  }
</script>

<div class="toolbar">
  <select value={diagramType} on:change={handleChange}>
    {#each availableTypes as type}
      <option value={type.type}>{type.label}</option>
    {/each}
  </select>
</div>

<style>
  .toolbar { /* component-scoped styles */ }
</style>
```

**Pros:**
- ✅ No virtual DOM (faster than React/Vue)
- ✅ Smallest bundle size (~30KB)
- ✅ True reactivity (no useState/ref needed)
- ✅ Component-scoped styles built-in
- ✅ Simplest syntax of the three

**Cons:**
- ❌ **Still full rewrite** required
- ❌ Smallest ecosystem
- ❌ Less mature tooling
- ❌ Fewer developers familiar with it

**Estimated effort:** 240-360 hours (2-3 developers, 2 months)

---

### Option B: Refactor Existing Architecture (Recommended)

Keep vanilla TypeScript but apply modern patterns:

#### Phase 1: Extract and Modularize (2-3 weeks)

**Split UIManager into focused classes:**
```typescript
// Before: UIManager.ts (2,187 lines)
export class UIManager { /* everything */ }

// After: Modular architecture
export class ToolbarManager {
    constructor(private diagramService: DiagramService) {}

    public render(): HTMLElement {
        const toolbar = document.createElement('div');
        // Focused toolbar logic only
        return toolbar;
    }

    public update(state: ToolbarState): void {
        // Update toolbar based on state
    }
}

export class DialogCoordinator {
    private dialogs: Map<string, BaseDialog> = new Map();

    public showDialog(type: string, config: DialogConfig): Promise<DialogResult> {
        // Dialog management only
    }
}

export class ResponsiveManager {
    public setupResponsiveHandlers(): void {
        // Responsive behavior only
    }
}

// New UIOrchestrator (thin coordinator)
export class UIOrchestrator {
    constructor(
        private toolbar: ToolbarManager,
        private dialogs: DialogCoordinator,
        private responsive: ResponsiveManager,
        private sidebar: SidebarComponent
    ) {}

    public initialize(): void {
        // Coordinate initialization
    }
}
```

**Split CanvasRenderer:**
```typescript
// Before: CanvasRenderer (3,015 lines with 20+ properties)
export class CanvasRenderer { /* everything */ }

// After: Separation of concerns
export class RenderingEngine {
    constructor(private canvas: HTMLCanvasElement) {}

    public render(diagram: DiagramModel, viewport: Viewport): void {
        // Pure rendering logic only
    }
}

export class InteractionController {
    constructor(
        private canvas: HTMLCanvasElement,
        private renderEngine: RenderingEngine
    ) {}

    private setupEventListeners(): void {
        this.canvas.addEventListener('mousedown', this.handleMouseDown);
        // etc.
    }
}

export class CanvasFacade {
    constructor(
        private renderer: RenderingEngine,
        private interaction: InteractionController,
        private selection: SelectionManager
    ) {}

    // Public API
    public setDiagram(diagram: DiagramModel): void {
        this.renderer.render(diagram, this.getViewport());
    }
}
```

**Estimated effort:** 80-120 hours (2 weeks)

---

#### Phase 2: Centralized State Management (1-2 weeks)

Implement a lightweight state store pattern:

```typescript
// store/DiagramStore.ts
type Listener<T> = (state: T) => void;

export class Store<T> {
    private state: T;
    private listeners: Set<Listener<T>> = new Set();

    constructor(initialState: T) {
        this.state = initialState;
    }

    public getState(): T {
        return this.state;
    }

    public setState(updater: (state: T) => T): void {
        this.state = updater(this.state);
        this.notify();
    }

    public subscribe(listener: Listener<T>): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    private notify(): void {
        this.listeners.forEach(listener => listener(this.state));
    }
}

// Usage:
interface AppState {
    diagram: DiagramModel | null;
    selectedElements: string[];
    interactionMode: InteractionMode;
    connectionStatus: ConnectionStatus;
}

export const appStore = new Store<AppState>({
    diagram: null,
    selectedElements: [],
    interactionMode: 'select',
    connectionStatus: { mcp: false, ai: false }
});

// In components:
appStore.subscribe((state) => {
    this.updateUI(state);
});

appStore.setState(state => ({
    ...state,
    selectedElements: ['node-1', 'node-2']
}));
```

**Estimated effort:** 40-80 hours (1-2 weeks)

---

#### Phase 3: Event Bus Pattern (1 week)

Replace fragmented event system:

```typescript
// events/EventBus.ts
type EventCallback<T = any> = (data: T) => void;

export class EventBus {
    private events: Map<string, Set<EventCallback>> = new Map();

    public on<T>(event: string, callback: EventCallback<T>): () => void {
        if (!this.events.has(event)) {
            this.events.set(event, new Set());
        }
        this.events.get(event)!.add(callback);

        // Return unsubscribe function
        return () => this.off(event, callback);
    }

    public off<T>(event: string, callback: EventCallback<T>): void {
        this.events.get(event)?.delete(callback);
    }

    public emit<T>(event: string, data: T): void {
        this.events.get(event)?.forEach(callback => callback(data));
    }
}

export const eventBus = new EventBus();

// Event names as constants (no magic strings)
export const Events = {
    DIAGRAM_LOADED: 'diagram:loaded',
    ELEMENT_SELECTED: 'element:selected',
    MODE_CHANGED: 'mode:changed',
    CONNECTION_STATUS: 'connection:status'
} as const;

// Usage:
eventBus.on(Events.DIAGRAM_LOADED, (diagram: DiagramModel) => {
    console.log('Diagram loaded:', diagram.id);
});

eventBus.emit(Events.DIAGRAM_LOADED, diagram);
```

**Estimated effort:** 40 hours (1 week)

---

#### Phase 4: Move CSS to External Files (1 week)

Extract inline CSS from index.html:

```
glsp-web-client/src/styles/
├── base/
│   ├── reset.css
│   ├── typography.css
│   └── variables.css (CSS custom properties)
├── components/
│   ├── toolbar.css
│   ├── sidebar.css
│   ├── dialog.css
│   └── canvas.css
├── layouts/
│   ├── app-layout.css
│   └── responsive.css
└── themes/
    ├── dark.css (default)
    └── light.css
```

Use CSS modules or BEM methodology:

```css
/* components/toolbar.css */
.toolbar {
    display: flex;
    gap: var(--spacing-md);
    padding: var(--spacing-sm);
    background: var(--bg-secondary);
}

.toolbar__group {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
}

.toolbar__select {
    padding: var(--spacing-xs) var(--spacing-sm);
    border-radius: var(--radius-sm);
}
```

**Estimated effort:** 40 hours (1 week)

---

#### Phase 5: Component Templates (1-2 weeks)

Replace innerHTML with template functions:

```typescript
// templates/ToolbarTemplate.ts
export function createToolbar(config: ToolbarConfig): HTMLElement {
    const toolbar = document.createElement('div');
    toolbar.className = 'toolbar';

    // Diagram type selector
    const typeGroup = createToolbarGroup({
        label: 'Diagram Type',
        content: createSelect({
            id: 'diagram-type-select',
            options: config.diagramTypes,
            value: config.currentType,
            onChange: config.onTypeChange
        })
    });

    toolbar.appendChild(typeGroup);
    return toolbar;
}

function createSelect(config: SelectConfig): HTMLSelectElement {
    const select = document.createElement('select');
    select.id = config.id;

    config.options.forEach(option => {
        const optionEl = document.createElement('option');
        optionEl.value = option.value;
        optionEl.textContent = option.label;
        if (option.value === config.value) {
            optionEl.selected = true;
        }
        select.appendChild(optionEl);
    });

    select.addEventListener('change', (e) => {
        config.onChange((e.target as HTMLSelectElement).value);
    });

    return select;
}
```

**Benefits:**
- Type-safe template creation
- No innerHTML XSS risks
- Testable template functions
- Reusable component builders

**Estimated effort:** 40-80 hours (1-2 weeks)

---

### Total Refactoring Effort

| Phase | Duration | Effort | Priority |
|-------|----------|--------|----------|
| Phase 1: Modularize | 2-3 weeks | 80-120h | 🔴 High |
| Phase 2: State Store | 1-2 weeks | 40-80h | 🔴 High |
| Phase 3: Event Bus | 1 week | 40h | 🟡 Medium |
| Phase 4: Extract CSS | 1 week | 40h | 🟡 Medium |
| Phase 5: Templates | 1-2 weeks | 40-80h | 🟢 Low |
| **Total** | **6-9 weeks** | **240-360h** | |

**Cost comparison:**
- **Framework migration:** 280-480 hours (2-3 months)
- **Targeted refactoring:** 240-360 hours (1.5-2 months)
- **Savings:** 40-120 hours + lower risk

---

## Recommendation: Refactor, Don't Migrate

### Why NOT migrate to a framework?

1. **Canvas rendering is framework-agnostic**
   - Your app is primarily a canvas-based diagram editor
   - React/Vue/Svelte don't help with canvas rendering
   - CanvasRenderer.ts would need minimal changes regardless

2. **Service layer is already excellent**
   - Service container pattern is well-implemented
   - Services are testable and modular
   - No framework would improve this

3. **High migration cost, low return**
   - 80% of UI code would need rewriting
   - Risk of introducing new bugs
   - 2-3 months of development time
   - Bundle size increases

4. **Team familiarity**
   - Current team knows vanilla TS/JS
   - Framework adds learning curve
   - Hiring becomes more specific

### Why refactoring works better?

1. **Incremental improvement**
   - Can be done in phases
   - Each phase delivers value
   - Low risk of breaking changes

2. **Addresses root causes**
   - Monolithic classes → Modular classes
   - Scattered state → Centralized store
   - Event chaos → Event bus
   - Inline HTML → Template functions

3. **Preserves what works**
   - Service layer untouched
   - Canvas rendering untouched
   - Existing patterns improved, not replaced

4. **Modern vanilla JS is powerful**
   - Web Components (if needed later)
   - ES6 modules
   - TypeScript for type safety
   - Build tools for optimization

---

## Modern Vanilla JS Patterns to Adopt

### 1. Web Components (Optional, for future)

If you need framework-like components later:

```typescript
// components/DiagramToolbar.ts
export class DiagramToolbar extends HTMLElement {
    private types: DiagramType[] = [];
    private selectedType: string = '';

    static get observedAttributes() {
        return ['selected-type'];
    }

    connectedCallback() {
        this.render();
    }

    attributeChangedCallback(name: string, oldValue: string, newValue: string) {
        if (name === 'selected-type') {
            this.selectedType = newValue;
            this.render();
        }
    }

    render() {
        this.innerHTML = `
            <div class="toolbar">
                <select>
                    ${this.types.map(type =>
                        `<option value="${type.type}"
                                 ${type.type === this.selectedType ? 'selected' : ''}>
                            ${type.label}
                        </option>`
                    ).join('')}
                </select>
            </div>
        `;
    }
}

customElements.define('diagram-toolbar', DiagramToolbar);

// Usage in HTML:
<diagram-toolbar selected-type="workflow"></diagram-toolbar>
```

**Benefits:**
- Native browser API (no framework)
- Encapsulation (Shadow DOM)
- Reusable across projects
- Can interop with frameworks later

### 2. Signals (Lightweight Reactivity)

Implement a minimal signals pattern:

```typescript
// reactivity/signals.ts
export class Signal<T> {
    private value: T;
    private subscribers: Set<(value: T) => void> = new Set();

    constructor(initialValue: T) {
        this.value = initialValue;
    }

    get(): T {
        return this.value;
    }

    set(newValue: T): void {
        if (this.value !== newValue) {
            this.value = newValue;
            this.subscribers.forEach(fn => fn(newValue));
        }
    }

    subscribe(fn: (value: T) => void): () => void {
        this.subscribers.add(fn);
        return () => this.subscribers.delete(fn);
    }
}

// Usage:
const selectedElements = new Signal<string[]>([]);

selectedElements.subscribe((elements) => {
    console.log('Selection changed:', elements);
    updateUI(elements);
});

selectedElements.set(['node-1', 'node-2']);
```

### 3. Virtual DOM Alternative (lit-html)

If you want declarative templates without full framework:

```typescript
import { html, render } from 'lit-html';

// Template function
const toolbarTemplate = (types: DiagramType[], selected: string, onChange: (type: string) => void) => html`
  <div class="toolbar">
    <select @change=${(e: Event) => onChange((e.target as HTMLSelectElement).value)}>
      ${types.map(type => html`
        <option value=${type.type} ?selected=${type.type === selected}>
          ${type.label}
        </option>
      `)}
    </select>
  </div>
`;

// Render
render(toolbarTemplate(types, currentType, handleChange), container);
```

**Benefits:**
- Declarative templates
- Fast diffing algorithm
- Small bundle (~5KB)
- No build step required
- Works with vanilla TS

---

## Specific Refactoring Plan

### Week 1-2: Split UIManager

**Goal:** Break UIManager into 5 focused classes

```typescript
// New structure:
src/ui/
├── orchestration/
│   ├── UIOrchestrator.ts (100 lines - thin coordinator)
│   ├── ToolbarManager.ts (300 lines)
│   ├── DialogCoordinator.ts (200 lines)
│   ├── ResponsiveManager.ts (150 lines)
│   └── ComponentLibraryManager.ts (250 lines)
```

**Steps:**
1. Create new files with focused responsibilities
2. Move methods from UIManager to new classes
3. Update AppController to use UIOrchestrator
4. Test each module individually
5. Delete old UIManager

**Testing approach:**
```typescript
// ToolbarManager.test.ts
describe('ToolbarManager', () => {
    it('should create toolbar with diagram types', () => {
        const manager = new ToolbarManager(mockDiagramService);
        const element = manager.render();

        expect(element.querySelector('#diagram-type-select')).toBeTruthy();
    });

    it('should update toolbar when diagram type changes', () => {
        manager.update({ diagramType: 'flowchart' });

        const select = element.querySelector('select') as HTMLSelectElement;
        expect(select.value).toBe('flowchart');
    });
});
```

---

### Week 3-4: Extract CanvasRenderer Concerns

**Goal:** Separate rendering from interaction handling

```typescript
// New structure:
src/renderer/
├── CanvasFacade.ts (200 lines - public API)
├── RenderingEngine.ts (1000 lines - pure rendering)
├── InteractionController.ts (800 lines - event handling)
├── ViewportManager.ts (200 lines - pan/zoom)
└── rendering/
    ├── NodeRenderer.ts
    ├── EdgeRenderer.ts
    └── SelectionRenderer.ts
```

**Benefits:**
- Each class has single responsibility
- Rendering logic testable without events
- Interaction testable without rendering
- Can optimize rendering independently

---

### Week 5: Implement State Store

**Goal:** Centralize application state

```typescript
// store/index.ts
export const appStore = createStore({
    // Diagram state
    diagram: null as DiagramModel | null,
    diagramType: 'workflow' as string,

    // Selection state
    selectedElements: [] as string[],

    // Interaction state
    mode: 'select' as InteractionMode,

    // Connection state
    connections: {
        mcp: false,
        ai: false
    },

    // UI state
    sidebarCollapsed: false,
    aiPanelVisible: false
});

// Actions
export const actions = {
    setDiagram(diagram: DiagramModel) {
        appStore.setState(state => ({ ...state, diagram }));
    },

    selectElements(ids: string[]) {
        appStore.setState(state => ({ ...state, selectedElements: ids }));
    },

    setInteractionMode(mode: InteractionMode) {
        appStore.setState(state => ({ ...state, mode }));
    }
};

// Selectors
export const selectors = {
    hasUnsavedChanges(state: AppState) {
        return state.diagram !== null && state.selectedElements.length > 0;
    },

    isFullyConnected(state: AppState) {
        return state.connections.mcp && state.connections.ai;
    }
};
```

---

### Week 6: Event Bus + Constants

**Goal:** Replace fragmented event system

```typescript
// events/types.ts
export const Events = {
    // Diagram events
    DIAGRAM_LOADED: 'diagram:loaded',
    DIAGRAM_SAVED: 'diagram:saved',
    DIAGRAM_MODIFIED: 'diagram:modified',

    // Selection events
    ELEMENTS_SELECTED: 'elements:selected',
    SELECTION_CLEARED: 'selection:cleared',

    // Interaction events
    MODE_CHANGED: 'mode:changed',
    EDGE_CREATION_STARTED: 'edge:creation:started',

    // Connection events
    MCP_CONNECTED: 'connection:mcp:connected',
    AI_CONNECTED: 'connection:ai:connected'
} as const;

// Type-safe event data
export interface EventData {
    [Events.DIAGRAM_LOADED]: DiagramModel;
    [Events.ELEMENTS_SELECTED]: string[];
    [Events.MODE_CHANGED]: InteractionMode;
    // etc.
}

// Usage with type safety:
eventBus.on(Events.DIAGRAM_LOADED, (diagram: DiagramModel) => {
    // TypeScript knows diagram is DiagramModel
});
```

---

### Week 7-8: Extract CSS

**Goal:** Move all inline styles to external CSS files

**Current:** 1,500 lines of inline CSS in index.html
**Target:** Organized CSS architecture

```
src/styles/
├── base/
│   ├── reset.css (normalize)
│   ├── variables.css (CSS custom properties)
│   └── typography.css (font styles)
├── components/
│   ├── toolbar.css
│   ├── sidebar.css
│   ├── status-bar.css
│   ├── dialog.css
│   └── floating-panel.css
├── layouts/
│   ├── app.css (main layout)
│   └── responsive.css (media queries)
├── themes/
│   ├── dark.css (default)
│   └── light.css (future)
└── main.css (imports all)
```

**Benefits:**
- CSS can be cached separately
- Can use PostCSS for optimization
- Better dev experience (CSS in .css files)
- Can use CSS nesting, variables

---

### Week 9: Template Functions

**Goal:** Replace innerHTML with type-safe template builders

```typescript
// templates/builders.ts
export const createElement = <K extends keyof HTMLElementTagNameMap>(
    tag: K,
    props: Partial<HTMLElementTagNameMap[K]> & {
        className?: string;
        style?: Partial<CSSStyleDeclaration>;
        children?: (HTMLElement | string)[];
    }
): HTMLElementTagNameMap[K] => {
    const element = document.createElement(tag);

    // Set properties
    Object.assign(element, props);

    // Set class
    if (props.className) {
        element.className = props.className;
    }

    // Set styles
    if (props.style) {
        Object.assign(element.style, props.style);
    }

    // Append children
    if (props.children) {
        props.children.forEach(child => {
            if (typeof child === 'string') {
                element.appendChild(document.createTextNode(child));
            } else {
                element.appendChild(child);
            }
        });
    }

    return element;
};

// Usage:
const toolbar = createElement('div', {
    className: 'toolbar',
    children: [
        createElement('div', {
            className: 'toolbar__group',
            children: [
                createElement('label', { children: ['Diagram Type:'] }),
                createElement('select', {
                    id: 'diagram-type-select',
                    children: types.map(type =>
                        createElement('option', {
                            value: type.type,
                            children: [type.label]
                        })
                    )
                })
            ]
        })
    ]
});
```

---

## Long-term Architecture Vision

After refactoring, the architecture should look like:

```
┌─────────────────────────────────────────────────────────┐
│                     index.html (< 200 lines)             │
│  ├── External CSS imports                                │
│  ├── Minimal HTML structure                             │
│  └── Script module import                               │
└─────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────┐
│                     AppController                        │
│                      (< 500 lines)                       │
│  ├── Initialize services (ServiceContainer)             │
│  ├── Create UIOrchestrator                              │
│  ├── Setup state subscriptions                          │
│  └── Coordinate initialization                          │
└─────────────────────────────────────────────────────────┘
                              │
                  ┌───────────┴───────────┐
                  ▼                       ▼
    ┌─────────────────────┐   ┌──────────────────────┐
    │  UI Orchestrator     │   │  Application Store   │
    │  ├── ToolbarManager  │   │  ├── diagram         │
    │  ├── DialogManager   │   │  ├── selection       │
    │  ├── ResponsiveMan.  │   │  ├── interaction     │
    │  └── SidebarManager  │   │  └── connections     │
    └─────────────────────┘   └──────────────────────┘
                  │                       │
                  └───────────┬───────────┘
                              ▼
                  ┌─────────────────────┐
                  │     Event Bus        │
                  │  (type-safe events)  │
                  └─────────────────────┘
                              │
                  ┌───────────┴───────────┐
                  ▼                       ▼
    ┌─────────────────────┐   ┌──────────────────────┐
    │  Canvas Facade       │   │  Services Layer      │
    │  ├── RenderEngine    │   │  ├── McpService      │
    │  ├── InteractionCtrl │   │  ├── DiagramService  │
    │  └── ViewportManager │   │  └── (unchanged)     │
    └─────────────────────┘   └──────────────────────┘
```

**Benefits:**
- Every class < 500 lines (testable)
- Clear data flow (Store → Components)
- Type-safe event system
- Modular, replaceable parts
- Preserved investment in existing code

---

## Decision Matrix

| Factor | Framework Migration | Targeted Refactoring | Winner |
|--------|-------------------|---------------------|---------|
| **Development Time** | 2-3 months | 1.5-2 months | ✅ Refactor |
| **Risk Level** | High (full rewrite) | Low (incremental) | ✅ Refactor |
| **Code Reuse** | 20% (service layer) | 80% (preserve most) | ✅ Refactor |
| **Bundle Size** | +100-150KB | +0-5KB | ✅ Refactor |
| **Learning Curve** | Framework-specific | Patterns-based | ✅ Refactor |
| **Testability** | ✅ Excellent | ✅ Excellent | 🟰 Tie |
| **Future Flexibility** | Framework lock-in | Framework-agnostic | ✅ Refactor |
| **Performance** | Virtual DOM overhead | Direct DOM | ✅ Refactor |
| **Hiring** | Framework-specific | Vanilla TS/JS | ✅ Refactor |
| **Ecosystem** | Large ecosystem | Standard Web APIs | ⚖️ Framework |

**Score: Refactoring wins 8-1**

---

## When Would Framework Make Sense?

Consider migrating to a framework IF:

1. **Team is already expert** in React/Vue/Svelte
2. **Heavy form-based UI** (lots of inputs, validation)
3. **Real-time collaborative editing** (operational transforms)
4. **Mobile app** version needed (React Native)
5. **Complex nested component trees** (100+ components)
6. **Server-side rendering** requirements
7. **Team size > 5 developers** (framework conventions help)

**For this project:** ❌ None of these apply strongly

Your app is primarily:
- Canvas-based diagram editing (framework doesn't help)
- Service-oriented architecture (already excellent)
- Complex interactions (better with direct control)
- Small to medium team size

---

## Implementation Roadmap

### Phase 1: Foundation (Weeks 1-3)
- [ ] Split UIManager into focused classes
- [ ] Extract CanvasRenderer concerns
- [ ] Set up testing for new modules

**Deliverable:** Modular UI architecture with clear responsibilities

### Phase 2: State & Events (Weeks 4-5)
- [ ] Implement centralized state store
- [ ] Create type-safe event bus
- [ ] Migrate from scattered state to store

**Deliverable:** Predictable state management and event system

### Phase 3: Presentation (Weeks 6-7)
- [ ] Extract CSS to external files
- [ ] Implement template builder functions
- [ ] Update build process

**Deliverable:** Clean separation of styles and improved DX

### Phase 4: Polish (Week 8-9)
- [ ] Improve test coverage (target 50%+)
- [ ] Performance optimizations
- [ ] Documentation updates

**Deliverable:** Production-ready refactored codebase

---

## Success Metrics

Track these to measure refactoring success:

| Metric | Before | Target | How to Measure |
|--------|--------|--------|----------------|
| Largest file LOC | 3,015 | < 500 | `wc -l src/**/*.ts` |
| Average file LOC | 535 | < 300 | Total LOC / file count |
| Files > 1000 LOC | 4 | 0 | `find src -name "*.ts" -exec wc -l {} + \| awk '$1 > 1000'` |
| Test coverage | 10.1% | 50% | `npm run test:coverage` |
| Build size | TBD | < +5KB | `npm run build && du -h dist/` |
| index.html LOC | 2,499 | < 200 | `wc -l index.html` |
| Magic strings | ~50+ | 0 | Code review |
| State locations | 6+ | 1 | Centralized store |

---

## Conclusion

**Recommendation: Refactor the existing vanilla TypeScript architecture**

The current codebase is well-structured at the service layer but suffers from monolithic UI classes and scattered state management. These issues can be resolved through **targeted refactoring** in 6-9 weeks with significantly less risk and cost than a framework migration.

**Key advantages:**
- Preserves 80% of existing code
- Addresses root causes of complexity
- Lower risk, incremental progress
- No framework lock-in
- Smaller bundle size
- Team can continue using familiar tools

**When to revisit framework decision:**
- Team grows to 5+ developers
- Need mobile app version
- Requirements shift to form-heavy UI
- Team gains framework expertise

For now, modern vanilla TypeScript with proper patterns provides the best path forward.

---

## Next Steps

1. **Review this assessment** with the team
2. **Prioritize phases** based on pain points
3. **Start with Phase 1** (split UIManager)
4. **Set up metrics tracking**
5. **Iterate and measure progress**

**Questions to discuss:**
- Do you have specific pain points not addressed here?
- What's your timeline for improvements?
- Team size and expertise?
- Any specific performance requirements?
- Future plans for mobile support?
