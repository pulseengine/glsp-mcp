# Client-Side WASM Component Architecture Plan

## Current State Analysis

### Existing Frontend Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    CURRENT GLSP CLIENT                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  AppController                                                  │
│  ├── McpService (backend communication)                        │
│  ├── DiagramService (diagram management)                       │
│  ├── UIManager (UI components)                                 │
│  ├── CanvasRenderer (drawing)                                  │
│  ├── InteractionManager (user interactions)                    │
│  ├── AIService (Ollama integration)                            │
│  └── WasmComponentManager (static palette, basic loading)      │
│                                                                 │
│  UI Components:                                                 │
│  ├── WASM Component Palette (floating panel)                   │
│  ├── AI Assistant Panel (chat interface)                       │
│  ├── Toolbar (diagram types, tools)                            │
│  ├── Status Bar (connection status)                            │
│  └── Canvas (main diagram area)                                │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Proposed Client-Side WASM Architecture

### Enhanced Architecture with jco Integration

```
┌─────────────────────────────────────────────────────────────────┐
│                 ENHANCED GLSP CLIENT                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  AppController                                                  │
│  ├── McpService                                                │
│  ├── DiagramService                                            │
│  ├── UIManager                                                 │
│  ├── CanvasRenderer                                            │
│  ├── InteractionManager                                        │
│  ├── AIService                                                 │
│  └── 🆕 WasmRuntimeManager (enhanced)                          │
│      ├── WasmTranspiler (jco integration)                      │
│      ├── ComponentLoader (dynamic loading)                     │
│      ├── ComponentRegistry (loaded components)                 │
│      ├── ExecutionEngine (component execution)                 │
│      └── CanvasBridge (WASM → Canvas integration)              │
│                                                                 │
│  🆕 Enhanced UI Components:                                    │
│  ├── Component Upload Panel (file upload/transpilation)        │
│  ├── Component Library Panel (loaded components)               │
│  ├── Component Execution View (runtime interface)              │
│  ├── Component Inspector (metadata, interfaces)                │
│  └── Error/Debug Panel (transpilation/execution errors)        │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Detailed Component Flow Architecture

### 1. Component Upload & Transpilation Flow

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   User uploads  │    │   jco transpile │    │  Component      │
│   .wasm file    │───▶│   (client-side) │───▶│  Registry       │
│                 │    │                 │    │                 │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│  File Validation│    │  ES Module      │    │  Metadata       │
│  - Size check   │    │  Generation     │    │  Extraction     │
│  - Format check │    │  - JS wrapper   │    │  - WIT info     │
│  - Security     │    │  - TypeScript   │    │  - Interfaces   │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

### 2. Component Execution Flow

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│  User selects   │    │  Component      │    │  Canvas         │
│  component from │───▶│  Instantiation  │───▶│  Integration    │
│  library        │    │                 │    │                 │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│  UI Generation  │    │  Memory         │    │  Rendering      │
│  - Controls     │    │  Management     │    │  - Graphics     │
│  - Parameters   │    │  - Allocation   │    │  - Updates      │
│  - Status       │    │  - Cleanup      │    │  - Events       │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## Implementation Plan

### Phase 1: Core Infrastructure (Week 1-2)

#### 1.1 WasmTranspiler Service

```typescript
// New service for client-side transpilation
class WasmTranspiler {
  async transpileComponent(
    wasmBytes: ArrayBuffer,
  ): Promise<TranspiledComponent>;
  async validateComponent(wasmBytes: ArrayBuffer): Promise<ValidationResult>;
  extractMetadata(wasmBytes: ArrayBuffer): Promise<ComponentMetadata>;
}
```

#### 1.2 Enhanced WasmComponentManager

```typescript
// Extend existing WasmComponentManager
class WasmRuntimeManager extends WasmComponentManager {
  private transpiler: WasmTranspiler;
  private registry: ComponentRegistry;
  private executionEngine: ExecutionEngine;

  async uploadAndTranspileComponent(file: File): Promise<string>;
  async loadTranspiledComponent(id: string): Promise<WasmComponent>;
  async executeComponent(id: string, method: string, args: any[]): Promise<any>;
}
```

#### 1.3 Component Registry

```typescript
// Store and manage loaded components
class ComponentRegistry {
  private components: Map<string, TranspiledComponent>;

  registerComponent(component: TranspiledComponent): string;
  getComponent(id: string): TranspiledComponent | null;
  listComponents(): ComponentMetadata[];
  removeComponent(id: string): boolean;
}
```

### Phase 2: UI Integration (Week 2-3)

#### 2.1 Component Upload Panel

```typescript
// New UI panel for uploading WASM components
class ComponentUploadPanel {
  - File drop zone
  - Upload progress indicator
  - Transpilation status
  - Error display
  - Success confirmation
}
```

#### 2.2 Enhanced Component Palette

```typescript
// Extend existing palette with dynamic components
class EnhancedComponentPalette extends WasmComponentPalette {
  - Static components (from MCP backend)
  - Dynamic components (user uploaded)
  - Component categories/filtering
  - Load/unload controls
  - Component metadata display
}
```

#### 2.3 Component Execution Interface

```typescript
// Interactive interface for loaded components
class ComponentExecutionView {
  - Component function list
  - Parameter input forms
  - Execution controls
  - Output display
  - Performance metrics
}
```

### Phase 3: Canvas Integration (Week 3-4)

#### 3.1 WASM-Canvas Bridge

```typescript
// Bridge between WASM components and Canvas
class WasmCanvasBridge {
  async renderWithComponent(component: WasmComponent, data: any): Promise<void>;
  setupEventHandlers(component: WasmComponent): void;
  handleComponentOutput(output: any): void;
}
```

#### 3.2 Graphics Command System

```typescript
// Translate WASM graphics calls to Canvas operations
interface GraphicsCommand {
  type: "rect" | "circle" | "text" | "image" | "path";
  parameters: any;
  style: RenderStyle;
}

class GraphicsRenderer {
  executeCommands(commands: GraphicsCommand[]): void;
  optimizeCommandBuffer(commands: GraphicsCommand[]): GraphicsCommand[];
}
```

## Required Frontend Changes

### 1. New Dependencies

```json
{
  "dependencies": {
    "@bytecodealliance/jco": "^1.0.0", // jco for transpilation
    "file-drop-element": "^2.0.0", // File upload UI
    "monaco-editor": "^0.45.0" // Code editor for component inspection
  }
}
```

### 2. New Directory Structure

```
src/
├── wasm/                           # New WASM-related code
│   ├── transpiler/
│   │   ├── WasmTranspiler.ts      # jco integration
│   │   ├── ComponentValidator.ts   # Security/validation
│   │   └── MetadataExtractor.ts   # WIT parsing
│   ├── runtime/
│   │   ├── ComponentRegistry.ts    # Component storage
│   │   ├── ExecutionEngine.ts     # Component execution
│   │   └── MemoryManager.ts       # Memory cleanup
│   ├── bridge/
│   │   ├── CanvasBridge.ts        # WASM-Canvas integration
│   │   ├── GraphicsRenderer.ts    # Graphics commands
│   │   └── EventHandler.ts        # User input handling
│   └── ui/
│       ├── UploadPanel.ts         # Upload interface
│       ├── ComponentLibrary.ts    # Component browser
│       ├── ExecutionView.ts       # Runtime interface
│       └── Inspector.ts           # Component metadata
├── existing files...
```

### 3. Enhanced UI Layout

```typescript
// Add new floating panels to the layout
interface EnhancedLayout {
  // Existing panels
  aiAssistant: FloatingPanel;
  wasmPalette: FloatingPanel;

  // New panels
  componentUpload: FloatingPanel;
  componentLibrary: FloatingPanel;
  executionView: Modal;
  componentInspector: Modal;
}
```

## Security Considerations

### 1. Component Validation

```typescript
class ComponentValidator {
  // Validate WASM component before transpilation
  async validateSecurity(wasmBytes: ArrayBuffer): Promise<SecurityReport> {
    - Check for malicious imports
    - Validate memory usage patterns
    - Scan for suspicious exports
    - Verify component structure
  }
}
```

### 2. Execution Sandboxing

```typescript
class ExecutionSandbox {
  // Limit component capabilities
  - Memory limits
  - Execution timeouts
  - API access restrictions
  - Resource usage monitoring
}
```

## Performance Considerations

### 1. Lazy Loading

- Load jco library only when needed
- Transpile components on-demand
- Cache transpiled results
- Unload unused components

### 2. Memory Management

- Monitor WASM memory usage
- Implement garbage collection for components
- Limit concurrent component executions
- Provide memory usage indicators

### 3. Caching Strategy

```typescript
class ComponentCache {
  // Cache transpiled components
  private cache: Map<string, CachedComponent>;

  async getOrTranspile(
    wasmHash: string,
    wasmBytes: ArrayBuffer,
  ): Promise<TranspiledComponent>;
  clearExpiredEntries(): void;
  getMemoryUsage(): number;
}
```

## Integration Points with Existing Code

### 1. Minimal Changes to Existing Services

- **McpService**: No changes needed
- **DiagramService**: Add component diagram type support
- **CanvasRenderer**: Add WASM component rendering support
- **InteractionManager**: Add component interaction handlers

### 2. Enhanced WasmComponentManager

```typescript
// Evolution of existing WasmComponentManager
class WasmComponentManager {
  // Existing functionality
  private wasmComponentPalette: WasmComponentPalette;

  // New functionality
  private runtimeManager: WasmRuntimeManager;
  private uploadPanel: ComponentUploadPanel;

  // Bridge old and new systems
  async showPalette(): Promise<void> {
    // Show both static and dynamic components
  }
}
```

### 3. UI Integration Strategy

- Add new panels as floating components (consistent with existing design)
- Extend toolbar with component upload button
- Add component-related menu items
- Integrate with existing keyboard shortcuts

## Development Phases Timeline

### Phase 1: Foundation (2 weeks)

- [ ] Add jco dependency
- [ ] Create WasmTranspiler service
- [ ] Implement ComponentRegistry
- [ ] Basic file upload UI
- [ ] Component validation system

### Phase 2: Runtime (2 weeks)

- [ ] ExecutionEngine implementation
- [ ] Memory management system
- [ ] Enhanced component palette
- [ ] Component execution UI
- [ ] Error handling and debugging

### Phase 3: Integration (2 weeks)

- [ ] WASM-Canvas bridge
- [ ] Graphics command system
- [ ] Event handling integration
- [ ] Performance optimization
- [ ] Security hardening

### Phase 4: Polish (1 week)

- [ ] UI/UX refinements
- [ ] Documentation
- [ ] Testing and debugging
- [ ] Performance monitoring
- [ ] User onboarding flow

## Conclusion

This architecture provides:

1. **Minimal disruption** to existing code
2. **Modular design** for easy maintenance
3. **Progressive enhancement** - can be implemented incrementally
4. **Security-first** approach with validation and sandboxing
5. **Performance-conscious** with caching and memory management
6. **User-friendly** with intuitive upload and execution interfaces

The key insight is that we can extend your existing `WasmComponentManager` and add new floating panels without restructuring the core application architecture. The jco integration happens as a new service layer that complements your existing MCP-based component system.
