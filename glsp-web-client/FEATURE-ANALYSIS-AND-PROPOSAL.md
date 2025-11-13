# Feature Analysis & Improvement Proposal

## Current State Analysis

### Overview
The GLSP-MCP web client has evolved organically, resulting in **conceptual overlap** between Diagram Types and View Modes, leading to user confusion about when to create new diagrams vs. switch views.

---

## 1. Current Feature Inventory

### 1.1 Diagram Types (6 Types)
Located in: `src/diagrams/diagram-type-registry.ts`

| Type | Label | Purpose | Special Features |
|------|-------|---------|------------------|
| `workflow` | Workflow Diagram | Business process workflows | Tasks, gateways, events |
| `bpmn` | BPMN Diagram | BPMN standard diagrams | Standard BPMN elements |
| `uml-class` | UML Class Diagram | OOP class relationships | Classes, interfaces, inheritance |
| `system-architecture` | System Architecture | High-level system design | Services, databases, APIs |
| `wasm-component` | WASM Component Diagram | WebAssembly components | **Has 4 view modes** |
| `wit-interface` | WIT Interface Diagram | WebAssembly Interface Types | WIT-specific elements |

### 1.2 View Modes (4 Modes)
Located in: `src/ui/ViewModeManager.ts`, `src/ui/ViewSwitcher.ts`

| Mode | Label | Compatible With | What It Shows |
|------|-------|-----------------|---------------|
| `component` | Component View | `wasm-component` | WASM components & connections |
| `uml-interface` | UML View | `wasm-component` | UML-style class diagram transformation |
| `wit-interface` | WIT Interface | `wasm-component`, `wit-interface` | WIT packages, interfaces, functions |
| `wit-dependencies` | Dependencies | `wasm-component` | Interface dependency graph |

### 1.3 UI Panels & Tools

| Feature | Always Visible | Context-Specific | Purpose |
|---------|---------------|------------------|---------|
| Sidebar (Component Library) | ✅ | ❌ | Shows WASM components always |
| WASM Palette | ❌ | ✅ (`wasm-component` only) | Component tools |
| View Switcher | ❌ | ✅ (`wasm-component`, `wit-interface`) | Switch view modes |
| AI Assistant Panel | ✅ | ❌ | AI-powered diagram generation |
| WIT Visualization Panel | ✅ | ❌ | Double-click WASM component |
| Toolbar | ✅ | Updates per diagram type | Node/edge creation tools |

---

## 2. Identified Problems

### 2.1 Naming Confusion ⚠️

**Problem:** `wit-interface` exists as BOTH a diagram type AND a view mode

```typescript
// As a Diagram Type:
type: 'wit-interface'
label: 'WIT Interface Diagram'

// As a View Mode:
id: 'wit-interface'
label: 'WIT Interface'
```

**User Impact:**
- "Should I create a WIT Interface Diagram or switch to WIT Interface view?"
- Unclear which approach preserves WASM component data

### 2.2 Context Awareness Issues

**Current State:**
```
wasm-component diagram → Shows 4 view modes ✅
wit-interface diagram  → Shows view switcher but views don't work ⚠️
workflow diagram       → No view modes (expected) ✅
uml-class diagram      → No view modes (expected) ✅
```

**Problem:** View switcher appears for `wit-interface` diagrams, but view transformations only work for `wasm-component` diagrams.

### 2.3 Feature Availability Confusion

| Scenario | What Happens | What User Expects |
|----------|--------------|-------------------|
| Load `workflow` diagram | Sidebar shows WASM components | Sidebar should hide or show workflow-relevant tools |
| Create `uml-class` diagram | WASM palette hidden (good) | Toolbar should show UML-specific nodes |
| Switch to WIT view mode | View switcher shows | Clear indication this is a VIEW, not creating new diagram |

### 2.4 Workspace Organization

**Current:** All diagrams appear in a flat list
- No visual indication of diagram type
- No grouping by type or workspace
- Hard to find specific diagram in large projects

---

## 3. Proposed Solution: Contextual Workspace System

### 3.1 Rename & Clarify Diagram Types

**Change 1:** Rename `wit-interface` diagram type to `wit-schema`

```typescript
// BEFORE (confusing):
{ type: 'wit-interface', label: 'WIT Interface Diagram' }

// AFTER (clear):
{ type: 'wit-schema', label: 'WIT Schema Diagram',
  description: 'Standalone WIT type definitions and packages' }
```

**Rationale:** Eliminates name collision. "Schema" implies static type definitions, while "Interface View" implies a dynamic view of components.

### 3.2 Context-Aware Sidebar

**Proposal:** Sidebar content changes based on active diagram type

```typescript
interface SidebarContext {
    diagramType: string;
    availableComponents: Component[];
    availableActions: Action[];
}

// Example configurations:
const SIDEBAR_CONTEXTS = {
    'workflow': {
        sections: ['BPMN Elements', 'Common Patterns', 'Templates']
    },
    'wasm-component': {
        sections: ['WASM Components', 'Host Functions', 'Interfaces']
    },
    'uml-class': {
        sections: ['Classes', 'Relationships', 'Patterns']
    },
    'system-architecture': {
        sections: ['Services', 'Data Stores', 'Communication']
    }
};
```

**Visual Design:**
```
┌─ Sidebar (wasm-component) ─────┐
│ 📦 WASM Components             │
│   [Component Library...]       │
│                                │
│ 👁️ Views                       │
│   • Component View (active)    │
│   • UML View                   │
│   • WIT Interface View         │
│   • Dependencies View          │
│                                │
│ 🎨 Quick Actions               │
│   [Upload Component]           │
│   [Scan Registry]              │
└────────────────────────────────┘

┌─ Sidebar (workflow) ───────────┐
│ 📊 BPMN Elements               │
│   • Start Event                │
│   • Task                       │
│   • Gateway                    │
│   • End Event                  │
│                                │
│ 🎨 Templates                   │
│   [Approval Process]           │
│   [Error Handling]             │
└────────────────────────────────┘
```

### 3.3 Unified View Indicator

**Problem:** Users don't know if they're in a "view mode" or looking at a "real diagram"

**Solution:** Add view mode indicator to header

```
┌────────────────────────────────────────────────┐
│ 📦 WASM Component Diagram: "My System"         │
│ View: [Component ▼] ← Dropdown shows all views│
└────────────────────────────────────────────────┘

vs.

┌────────────────────────────────────────────────┐
│ 🔄 Workflow Diagram: "Approval Process"        │
│ (no view selector - single representation)     │
└────────────────────────────────────────────────┘
```

### 3.4 Workspace Grouping

**Add diagram organization by type:**

```
Diagrams
├─ 📦 WASM Components (3)
│  ├─ My System Architecture
│  ├─ Camera Pipeline
│  └─ AI Processing
├─ 🔄 Workflows (2)
│  ├─ Approval Process
│  └─ Error Handling
├─ 🏗️ UML Classes (1)
│  └─ Domain Model
└─ 🔷 WIT Schemas (1)
   └─ Core Interfaces
```

### 3.5 Smart Context Switching

**Behavior:** When switching diagram types mid-work, guide the user

```typescript
// User is working on wasm-component diagram, clicks "Create New Diagram"
// and selects "workflow"

async function handleDiagramTypeChange(fromType: string, toType: string) {
    if (hasUnsavedChanges()) {
        await showSavePrompt();
    }

    // Smart context message
    if (fromType === 'wasm-component' && toType === 'workflow') {
        showNotification({
            message: 'Switched to Workflow mode. WASM components are saved.',
            actions: ['Back to WASM', 'Continue']
        });
    }

    // Update sidebar, toolbar, and available actions
    updateWorkspaceContext(toType);
}
```

---

## 4. Implementation Plan

### Phase 1: Clarify Naming (1-2 hours)
- [x] Rename `wit-interface` diagram type → `wit-schema`
- [x] Update all references in code
- [x] Update diagram type selector UI
- [x] Add tooltips explaining difference

### Phase 2: Context-Aware Sidebar (4-6 hours)
- [x] Create sidebar context configuration system
- [x] Implement sidebar content switching
- [x] Add view mode selector to WASM sidebar
- [x] Hide WASM components for non-WASM diagrams

### Phase 3: Workspace Organization (3-4 hours)
- [x] Group diagrams by type in sidebar list
- [x] Add collapsible sections
- [x] Show diagram counts per type
- [x] Add icons for visual identification

### Phase 4: View Mode Indicator (2-3 hours)
- [x] Add header view mode badge
- [x] Make view switcher more prominent
- [x] Add "Return to Component View" button
- [x] Show transformation status

### Phase 5: Polish & Testing (2-3 hours)
- [x] Add animations for context switching
- [x] Test all diagram type transitions
- [x] Verify panel visibility logic
- [x] Update documentation

**Total Estimated Time:** 12-18 hours

---

## 5. Benefits Summary

### For Users
✅ **Clear Mental Model:** Diagram types = what you're drawing, Views = how you see it
✅ **No More Confusion:** `wit-schema` vs `WIT Interface View` are clearly different
✅ **Context Awareness:** Only see relevant tools for current diagram type
✅ **Better Organization:** Find diagrams easily with type grouping
✅ **Smooth Transitions:** Guided experience when switching contexts

### For Development
✅ **Consistent Architecture:** Clear separation of concerns
✅ **Easier Maintenance:** Context logic centralized
✅ **Extensible:** Easy to add new diagram types with proper context
✅ **Better Testing:** Context boundaries make testing clearer

---

## 6. Migration Path

### For Existing Users
1. **No Data Loss:** All existing diagrams remain compatible
2. **Automatic Rename:** `wit-interface` diagrams → `wit-schema` (backend update)
3. **Graceful Fallback:** Old view references still work during transition

### For Developers
1. Update imports: `wit-interface` → `wit-schema` for diagram type
2. View mode `wit-interface` stays the same (no change)
3. New `SidebarContext` API for adding diagram types

---

## 7. Open Questions

1. **Should we allow multi-type workspaces?**
   - E.g., a workspace containing both WASM and workflow diagrams
   - Current: Yes, all types in one list
   - Proposed: Group by type, but still in one workspace

2. **Should view modes be saveable as separate diagrams?**
   - E.g., "Save UML View as new UML diagram"
   - Pro: Allows capturing specific view for sharing
   - Con: Creates confusion about source of truth

3. **Should we add diagram templates?**
   - E.g., "Camera Pipeline Template" for WASM components
   - Would reduce initial complexity for new users

---

## 8. Next Steps

1. **Review & Feedback:** Team discussion on this proposal
2. **Prioritization:** Which phases are MVP vs. nice-to-have?
3. **Prototype:** Quick mockup of context-aware sidebar
4. **Implementation:** Start with Phase 1 (quick win)
5. **Iteration:** Gather user feedback after each phase

---

## Appendix: Code Locations

**Diagram Type Registry:**
- `src/diagrams/diagram-type-registry.ts` - All diagram types defined here

**View Management:**
- `src/ui/ViewSwitcher.ts` - View mode UI component
- `src/ui/ViewModeManager.ts` - View transformation logic
- `src/ui/WasmViewTransformer.ts` - WASM-specific transformations

**Sidebar:**
- `src/ui/UIManager.ts` - Main UI orchestration
- `src/ui/sidebar/SidebarComponent.ts` - Sidebar implementation

**Context Logic:**
- `src/AppController.ts` - Diagram type change handling (line 974-1020)
- `src/AppController.ts` - View mode change handling (line 911-938)
