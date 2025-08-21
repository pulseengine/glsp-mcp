# WebAssembly Component Deployment Pipeline

## Complete Deployment Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    DEVELOPMENT ENVIRONMENT                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Developer Machine / CI/CD Pipeline                            │
│                                                                 │
│  ┌─────────────────┐    ┌─────────────────┐                    │
│  │   Rust Source   │    │   WIT Interface │                    │
│  │   + Cargo.toml  │    │   Definitions   │                    │
│  └─────────────────┘    └─────────────────┘                    │
│           │                       │                            │
│           ▼                       ▼                            │
│  ┌─────────────────────────────────────────────────────────────┤
│  │             cargo component build                          │
│  │          --target wasm32-wasi                               │
│  └─────────────────────────────────────────────────────────────┤
│                           │                                     │
│                           ▼                                     │
│  ┌─────────────────────────────────────────────────────────────┤
│  │             my-component.wasm                               │
│  │          (WebAssembly Component)                            │
│  └─────────────────────────────────────────────────────────────┤
│                           │                                     │
│                           ▼                                     │
│  ┌─────────────────────────────────────────────────────────────┤
│  │                jco transpile                                │
│  │     my-component.wasm --out dist/wasm/                     │
│  │     --no-nodejs-compat --optimize                          │
│  └─────────────────────────────────────────────────────────────┤
│                           │                                     │
│                           ▼                                     │
│  ┌─────────────────────────────────────────────────────────────┤
│  │                Transpiled Output:                           │
│  │    dist/wasm/my-component.js                                │
│  │    dist/wasm/my-component.d.ts                              │
│  │    dist/wasm/my-component.core.wasm                         │
│  └─────────────────────────────────────────────────────────────┤
│                           │                                     │
│                           ▼                                     │
│  ┌─────────────────────────────────────────────────────────────┤
│  │                 npm run build                               │
│  │              (Vite/Webpack/etc.)                            │
│  └─────────────────────────────────────────────────────────────┤
│                           │                                     │
└───────────────────────────┼─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                      WEB SERVER / CDN                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Static Files Served to Browser:                               │
│                                                                 │
│  /assets/                                                       │
│  ├── app-[hash].js           # Your main app bundle            │
│  ├── wasm/                                                     │
│  │   ├── my-component.js     # Transpiled ES module            │
│  │   ├── my-component.d.ts   # TypeScript definitions          │
│  │   └── my-component.core.wasm # Core WASM binary             │
│  └── index.html                                                │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                         BROWSER                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. Loads your GLSP app (JavaScript)                          │
│  2. App dynamically imports WASM component when needed:        │
│     import('./wasm/my-component.js')                           │
│  3. Component ES module loads its core WASM automatically     │
│  4. Ready to use as normal JavaScript API                     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Where Each Step Happens

### 1. Development/Build Time (Your Machine or CI/CD)

**Location**: Developer machine, GitHub Actions, Jenkins, etc.

**Build Script Example**:

```bash
#!/bin/bash
# build-wasm-components.sh

echo "Building WASM components..."

# Step 1: Build Rust components to WASM
cargo component build --release --target wasm32-wasi

# Step 2: Transpile to browser-compatible JavaScript
mkdir -p dist/wasm
jco transpile target/wasm32-wasi/release/graphics_renderer.wasm \
  --out dist/wasm/ \
  --no-nodejs-compat \
  --instantiation async \
  --optimize

jco transpile target/wasm32-wasi/release/data_processor.wasm \
  --out dist/wasm/ \
  --no-nodejs-compat \
  --instantiation async \
  --optimize

echo "WASM components transpiled to dist/wasm/"

# Step 3: Build your main application
npm run build
```

**package.json Integration**:

```json
{
  "scripts": {
    "build:wasm": "./build-wasm-components.sh",
    "build": "npm run build:wasm && vite build",
    "dev": "npm run build:wasm && vite dev"
  },
  "devDependencies": {
    "@bytecodealliance/jco": "^1.0.0"
  }
}
```

### 2. CI/CD Pipeline Example

**GitHub Actions Workflow** (`.github/workflows/build.yml`):

```yaml
name: Build and Deploy

on:
  push:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v3

      # Install Rust toolchain
      - uses: actions-rs/toolchain@v1
        with:
          toolchain: stable
          target: wasm32-wasi

      # Install cargo-component
      - run: cargo install cargo-component

      # Install jco
      - run: npm install -g @bytecodealliance/jco

      # Build WASM components
      - run: cargo component build --release --target wasm32-wasi

      # Transpile components
      - run: |
          mkdir -p dist/wasm
          jco transpile target/wasm32-wasi/release/*.wasm \
            --out dist/wasm/ \
            --no-nodejs-compat \
            --optimize

      # Build web application
      - run: npm ci && npm run build

      # Deploy to your hosting service
      - uses: actions/deploy-to-netlify@v1
        with:
          publish-dir: ./dist
```

### 3. Local Development Setup

**For Your GLSP Project**:

```bash
# Setup script (setup-wasm-dev.sh)
#!/bin/bash

echo "Setting up WASM development environment..."

# Install Rust toolchain for WASM
rustup target add wasm32-wasi
cargo install cargo-component

# Install jco globally
npm install -g @bytecodealliance/jco

# Create wasm source directory
mkdir -p wasm-components/graphics-renderer
mkdir -p wasm-components/data-processor

echo "WASM development environment ready!"
echo "Run 'npm run build:wasm' to build components"
```

**Directory Structure**:

```
glsp-web-client/
├── wasm-components/           # Rust WASM component source
│   ├── graphics-renderer/
│   │   ├── Cargo.toml
│   │   ├── src/lib.rs
│   │   └── wit/graphics.wit
│   └── data-processor/
│       ├── Cargo.toml
│       ├── src/lib.rs
│       └── wit/processor.wit
├── src/                      # Your main TypeScript/JavaScript
├── dist/                     # Build output
│   └── wasm/                # Transpiled WASM components
│       ├── graphics-renderer.js
│       ├── graphics-renderer.core.wasm
│       └── data-processor.js
└── package.json
```

## Integration with Your Existing Build

**Update your Vite config** (`vite.config.ts`):

```typescript
import { defineConfig } from "vite";

export default defineConfig({
  // Ensure WASM files are included in build
  assetsInclude: ["**/*.wasm"],

  build: {
    rollupOptions: {
      // Don't bundle WASM components - load them dynamically
      external: [/^\.\/wasm\/.*\.js$/],
    },
  },

  // Development: serve WASM files correctly
  server: {
    fs: {
      allow: ["..", "./dist/wasm"],
    },
  },
});
```

## Runtime Loading in Your Application

**Enhanced WasmComponentManager**:

```typescript
export class WasmComponentManager {
  private componentCache = new Map<string, any>();

  async loadComponent(name: string) {
    if (this.componentCache.has(name)) {
      return this.componentCache.get(name);
    }

    try {
      // Dynamic import of transpiled component
      const module = await import(`/wasm/${name}.js`);

      // Some components may need explicit instantiation
      let component;
      if (module.instantiate) {
        component = await module.instantiate();
      } else {
        component = module;
      }

      this.componentCache.set(name, component);
      console.log(`Loaded WASM component: ${name}`);

      return component;
    } catch (error) {
      console.error(`Failed to load WASM component ${name}:`, error);
      throw error;
    }
  }

  async preloadComponents(names: string[]) {
    const promises = names.map((name) =>
      this.loadComponent(name).catch((err) =>
        console.warn(`Failed to preload ${name}:`, err),
      ),
    );

    await Promise.allSettled(promises);
  }
}
```

## Deployment Strategies

### Option 1: Build-Time Transpilation (Recommended)

- **When**: During `npm run build`
- **Where**: CI/CD pipeline or developer machine
- **Result**: Static files ready for CDN/web server

### Option 2: Runtime Transpilation (Not Recommended)

- **When**: In the browser using jco's browser build
- **Where**: Client-side
- **Issues**: Larger bundle, slower loading, browser compatibility

### Option 3: Server-Side Transpilation

- **When**: On-demand server endpoint
- **Where**: Your backend server
- **Use case**: Dynamic component loading

## Best Practices for Your Project

1. **Build Integration**:

   ```bash
   # Add to package.json
   "prebuild": "npm run build:wasm",
   "build:wasm": "cargo component build --release && jco transpile target/wasm32-wasi/release/*.wasm -o dist/wasm/"
   ```

2. **Development Workflow**:

   ```bash
   # Watch mode for WASM development
   npm run dev:wasm    # Watches Rust files and rebuilds
   npm run dev         # Starts Vite dev server
   ```

3. **Caching Strategy**:
   - Version WASM files with content hashes
   - Use HTTP caching for `.wasm` files
   - Preload critical components

## Summary

**Transpilation happens at BUILD TIME**, not runtime:

1. **Developer/CI builds** Rust → WebAssembly Component
2. **jco transpiles** Component → JavaScript ES Module
3. **Web bundler** (Vite) includes transpiled files in build
4. **Web server** serves static JavaScript + WASM files
5. **Browser** imports JavaScript modules as needed

The browser never sees raw WebAssembly components - only the transpiled JavaScript modules that jco generates.
