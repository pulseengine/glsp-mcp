# Planned Features Documentation

This document describes the implemented but not yet connected features in the GLSP Web Client.

## ✅ Ready-to-Use Features

### 1. MCP Streaming and Notifications
**Location**: `src/mcp/client.ts`

- **`sendNotification()`** - Complete MCP notification implementation
- **`handleNotification()`** - Full notification handling with listeners  
- **`startStreaming()`** - HTTP streaming via Server-Sent Events

**Status**: Fully implemented, just needs integration points.

**How to activate**: Call these methods from the McpService when needed for real-time updates.

### 2. WIT Interface Visualization  
**Location**: `src/AppController.ts`

- **`switchToWitInterfaceView()`** - Legacy WIT interface view (deprecated)
- **`switchToWitDependencyView()`** - Legacy dependency view (deprecated)  
- **`createWitInterfaceDiagramFromComponents()`** - Legacy diagram creation (deprecated)

**Status**: Deprecated in favor of ViewModeManager approach.

**Modern approach**: Use `ViewModeManager.switchViewMode('wit-interface')` and `WasmViewTransformer` instead.

### 3. Component Load Management
**Location**: `src/renderer/canvas-renderer.ts`

- Edge creation type system for different edge modes
- Component load state tracking for WASM components

**Status**: Infrastructure ready, needs UI integration.

## 🏗️ Architecture Improvements Made

### Unified Type System
- **`ComponentInterface`** now extends **`WasmInterface`** for full compatibility
- **`ComponentColors`** interface available for theming
- **`WitInterfaceInfo`** extended with dependencies support

### Robust Type Conversion
- All `{}` to `string` conversions properly handled
- Interface property compatibility resolved
- Edge type casting issues fixed

### Documentation
- All planned features now have proper JSDoc comments
- Deprecated methods clearly marked with alternatives
- Ready-to-use features explicitly documented

## 📋 Integration Checklist

### To activate MCP streaming:
1. Call `mcpClient.addStreamListener()` from services that need real-time updates
2. Handle incoming notifications in UI components
3. Use `sendNotification()` for bidirectional communication

### To enhance WIT visualization:
1. Extend `WasmViewTransformer` with more view modes
2. Add UI controls for view switching 
3. Implement dependency graph visualization in transformer

### To enable advanced component management:
1. Connect load/unload functionality to UI controls
2. Implement edge creation modes in InteractionManager
3. Add component status indicators to sidebar

## 🎯 Next Development Priorities

1. **Real-time Updates**: Connect MCP streaming to diagram updates
2. **Advanced WIT Views**: Enhance dependency visualization  
3. **Component Lifecycle**: Full load/unload management
4. **Edge Creation**: Interactive edge type selection
5. **Theming**: Complete color scheme system

All these features have the core implementation ready and just need integration points to become fully functional.