# WebAssembly Component Architecture for GLSP Client

## Architecture Overview

The WebAssembly Component Model architecture for browser deployment involves several layers and tools working together:

```
┌─────────────────────────────────────────────────────────────────┐
│                        BROWSER ENVIRONMENT                      │
├─────────────────────────────────────────────────────────────────┤
│  JavaScript Runtime                                             │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐ │
│  │   Your GLSP     │  │  Transpiled     │  │   Browser APIs  │ │
│  │   Web Client    │◄─┤  WASM Component │◄─┤  (Canvas, WebGL)│ │
│  │                 │  │   (ES Module)   │  │                 │ │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘ │
│                              ▲                                  │
├──────────────────────────────┼──────────────────────────────────┤
│                              │                                  │
│  WebAssembly Runtime         │                                  │
│  ┌─────────────────┐        │                                  │
│  │  Core WASM      │◄───────┘                                  │
│  │  Module(s)      │                                           │
│  │                 │                                           │
│  └─────────────────┘                                           │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                     DEVELOPMENT TOOLCHAIN                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────┐    ┌─────────────────┐                    │
│  │   Rust/C++      │    │      WIT        │                    │
│  │   Source Code   │    │   Interface     │                    │
│  │                 │    │  Definitions    │                    │
│  └─────────────────┘    └─────────────────┘                    │
│           │                       │                            │
│           ▼                       ▼                            │
│  ┌─────────────────────────────────────────────────────────────┤
│  │            WASM Component Builder                           │
│  │         (cargo component / wit-bindgen)                    │
│  └─────────────────────────────────────────────────────────────┤
│                           │                                     │
│                           ▼                                     │
│  ┌─────────────────────────────────────────────────────────────┤
│  │             component.wasm                                  │
│  │        (WebAssembly Component)                              │
│  └─────────────────────────────────────────────────────────────┤
│                           │                                     │
│                           ▼                                     │
│  ┌─────────────────────────────────────────────────────────────┤
│  │                    jco transpile                            │
│  │        (Bytecode Alliance JavaScript Tool)                 │
│  └─────────────────────────────────────────────────────────────┤
│                           │                                     │
│                           ▼                                     │
│  ┌─────────────────┐    ┌─────────────────┐                    │
│  │  component.js   │    │ component.d.ts  │                    │
│  │  (ES Module)    │    │(TypeScript Defs)│                    │
│  └─────────────────┘    └─────────────────┘                    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Key Clarifications

### 1. wasi-gfx is NOT jco

- **wasi-gfx**: A WASI (WebAssembly System Interface) specification for graphics
- **jco**: A tool for transpiling WebAssembly components to JavaScript
- They are separate but complementary technologies

### 2. The Actual Flow

**Development Time:**

1. Write Rust/C++ code that uses wasi-gfx APIs
2. Compile to WebAssembly Component (.wasm)
3. Use jco to transpile component to JavaScript ES module
4. Deploy JavaScript + core WASM files to browser

**Runtime:**

1. Browser loads the transpiled JavaScript ES module
2. JavaScript module instantiates the core WASM module
3. JavaScript provides bindings between WASM and browser APIs
4. wasi-gfx calls in WASM get translated to Canvas/WebGL/WebGPU calls

## Detailed Component Architecture

### Component Structure

```
my-graphics-component.wasm
├── Core WebAssembly Module (the actual compiled code)
├── Component Metadata (import/export signatures)
└── WIT Interface Definitions (embedded)
```

### After jco Transpilation

```
output/
├── my-graphics-component.js      # ES module wrapper
├── my-graphics-component.d.ts    # TypeScript definitions
├── my-graphics-component.core.wasm  # Core WASM module
└── interfaces/                   # Generated interface code
    ├── wasi-surface.js
    └── wasi-webgpu.js
```

### Integration in Your GLSP Client

```javascript
// In your WasmComponentManager
class WasmComponentManager {
  async loadGraphicsComponent() {
    // Import the transpiled ES module
    const { GraphicsRenderer } = await import("./wasm/graphics-component.js");

    // The ES module handles WASM instantiation internally
    const renderer = new GraphicsRenderer();

    // wasi-gfx calls are automatically mapped to browser APIs
    await renderer.setupSurface(this.canvas);

    return renderer;
  }
}
```

## wasi-gfx in Browser Context

### What wasi-gfx Provides

```wit
// Example WIT interface from wasi-gfx
package wasi:graphics;

interface surface {
  type surface = resource;

  create-surface: func(width: u32, height: u32) -> surface;
  draw-rectangle: func(surf: surface, x: u32, y: u32, width: u32, height: u32, color: u32);
}
```

### How jco Maps This to Browser

```javascript
// Generated by jco transpilation
export class Surface {
  constructor(width, height) {
    // Creates HTML Canvas or WebGL context
    this.canvas = document.createElement("canvas");
    this.canvas.width = width;
    this.canvas.height = height;
    this.ctx = this.canvas.getContext("2d");
  }

  drawRectangle(x, y, width, height, color) {
    // Maps WASI call to Canvas API
    this.ctx.fillStyle = `#${color.toString(16)}`;
    this.ctx.fillRect(x, y, width, height);
  }
}
```

## Runtime Data Flow

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Your GLSP     │    │   Transpiled    │    │   Browser       │
│   JavaScript    │    │   WASM Wrapper  │    │   APIs          │
│                 │    │                 │    │                 │
│ renderDiagram() │───▶│ component.draw()│───▶│ canvas.fillRect()│
│                 │    │                 │    │                 │
│                 │◄───│ result/error    │◄───│ completion      │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                │
                                ▼
                       ┌─────────────────┐
                       │   Core WASM     │
                       │   Module        │
                       │                 │
                       │ (Rust/C++ code) │
                       └─────────────────┘
```

## Implementation Strategy for Your Project

### Phase 1: Basic Component Loading

```javascript
// Enhanced WasmComponentManager
export class WasmComponentManager {
  constructor() {
    this.loadedComponents = new Map();
  }

  async loadComponent(name) {
    if (this.loadedComponents.has(name)) {
      return this.loadedComponents.get(name);
    }

    try {
      // Dynamic import of transpiled component
      const module = await import(`./wasm/${name}.js`);

      // Component may need initialization
      let component;
      if (typeof module.default === "function") {
        component = await module.default();
      } else {
        component = module;
      }

      this.loadedComponents.set(name, component);
      return component;
    } catch (error) {
      console.error(`Failed to load component ${name}:`, error);
      throw error;
    }
  }
}
```

### Phase 2: Graphics Integration

```javascript
// Bridge between WASM components and your canvas
export class WasmCanvasBridge {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
  }

  async renderWithComponent(component, diagramData) {
    // Clear canvas
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // Let WASM component process and render
    const renderCommands = await component.processAndRender(diagramData);

    // Execute render commands on canvas
    this.executeRenderCommands(renderCommands);
  }

  executeRenderCommands(commands) {
    commands.forEach((cmd) => {
      switch (cmd.type) {
        case "rect":
          this.ctx.fillStyle = cmd.color;
          this.ctx.fillRect(cmd.x, cmd.y, cmd.width, cmd.height);
          break;
        case "text":
          this.ctx.fillStyle = cmd.color;
          this.ctx.fillText(cmd.text, cmd.x, cmd.y);
          break;
        // More drawing commands...
      }
    });
  }
}
```

## Summary

To directly answer your question: **No, wasi-gfx doesn't make jco a WebAssembly**. Instead:

1. **wasi-gfx** is a graphics API specification for WebAssembly
2. **jco** is a tool that converts WebAssembly components (that might use wasi-gfx) into JavaScript modules
3. The **browser runs the JavaScript module**, which internally manages the WebAssembly and maps graphics calls to browser APIs

The architecture enables you to write graphics code in Rust using wasi-gfx APIs, compile it to WebAssembly, then use jco to make it runnable in browsers as standard JavaScript modules.
