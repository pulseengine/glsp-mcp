# WASM Component Design V2 - n8n/Langflow Inspired

## Design Problems Addressed

### Before (V1 Design Issues):

❌ **Too small and cramped** - Components looked "smallish and weird"  
❌ **No clear connection points** - Tiny 6px interface circles were hard to see  
❌ **Information overload** - File paths, sizes, dependencies cluttered the view  
❌ **Inconsistent with workflow tools** - Didn't fit the graphical design paradigm  
❌ **Poor visual hierarchy** - Everything competing for attention

### After (V2 Design Solutions):

✅ **Standard sizing** - Clean 200x120px components like n8n/Langflow  
✅ **Prominent connection ports** - Large 8px radius ports on left/right edges  
✅ **Clean information hierarchy** - Focus on name, type, and status only  
✅ **Professional workflow appearance** - Matches modern flow-based tools  
✅ **Visual clarity** - Clear header, body, and connection zones

## Design Specifications

### Layout Structure

```
┌─────────────────────────────────────────┐ 200px width
│ [Icon] Component Name           [Type]  │ 40px header
├─────────────────────────────────────────┤
│                                         │
│ ●  Status: Active                       │ Clean body
│                                       ● │ 80px height
│                                         │
└─────────────────────────────────────────┘ 120px total height
^                                         ^
Input ports                      Output ports
(left edge)                      (right edge)
```

### Visual Elements

#### 1. **Component Header** (40px)

- **Clean gradient background** with component primary color
- **Component icon** (24px) - contextual based on type (AI, sensor, control, etc.)
- **Component name** - bold, truncated if needed
- **Type badge** - small pill showing component category

#### 2. **Status Section**

- **Status dot** - color-coded (green=active, gray=inactive, red=error)
- **Status text** - simple "Active"/"Inactive"/"Error"
- **No clickable switch** - status is informational only

#### 3. **Connection Ports** (8px radius)

- **Input ports** - green circles on left edge
- **Output ports** - orange circles on right edge
- **Port labels** - show on selection for clarity
- **Proper spacing** - 24px apart for easy connections

#### 4. **Color Scheme** (Modern workflow tool inspired)

```typescript
{
    primary: '#4F46E5',        // Modern purple-blue (main component)
    secondary: '#6366F1',      // Lighter purple (accents)
    input: '#10B981',          // Green (input ports)
    output: '#F59E0B',         // Orange (output ports)
    selected: '#EC4899',       // Pink (selection)
    text: '#1F2937',          // Dark gray (text)
    textSecondary: '#6B7280',  // Light gray (secondary text)
    background: '#FFFFFF',     // White (component background)
    border: '#E5E7EB'         // Light border
}
```

## Key Improvements

### 1. **n8n/Langflow Compatibility**

- **Card-like appearance** with proper shadows and borders
- **Clear visual hierarchy** similar to professional workflow tools
- **Consistent sizing** that works well in complex flows
- **Professional color scheme** that's not too technical

### 2. **Better Connection UX**

- **Large, visible ports** that are easy to target
- **Color-coded ports** (green=input, orange=output)
- **Edge-positioned ports** for natural flow creation
- **Port detection logic** for drag-and-drop connections

### 3. **Simplified Information**

- **Essential info only** - name, type, status
- **No technical clutter** - removed file paths, sizes, dependency counts
- **Clear visual feedback** - selection states, hover effects
- **Status at a glance** - simple dot + text indicator

### 4. **Scalable Design**

- **Consistent dimensions** - works at different zoom levels
- **Flexible port layout** - adapts to interface count
- **Clean typography** - readable at various scales
- **Modern aesthetics** - fits contemporary UI standards

## Implementation Features

### Port Detection & Connections

```typescript
// New V2 method for detecting port clicks
WasmComponentRendererV2.getPortAtPosition(element, bounds, position);
// Returns: { port: interface, type: 'input'|'output' } | null
```

### Icon System

- **AI Components** - Neural network icon
- **Sensor Components** - Radar waves icon
- **Control Components** - Circuit board icon
- **Generic Components** - Isometric cube icon

### Status States

- **Active** - Green dot, component is loaded and running
- **Inactive** - Gray dot, component is available but not loaded
- **Error** - Red dot, component has issues or is missing

## Migration from V1

### Updated Files

- `wasm-component-renderer-v2.ts` - New clean renderer
- `canvas-renderer.ts` - Updated to use V2 renderer
- `WasmComponentManager.ts` - Removed clickable switch logic

### Breaking Changes

- **No more load switch** - status is informational only
- **Different port positioning** - uses new detection logic
- **Simplified interface** - removed technical metadata display

## Result

The new design transforms WASM components from technical debug views into professional workflow nodes that:

- **Look professional** like n8n/Langflow components
- **Are easy to connect** with large, visible ports
- **Scale well** in complex diagrams
- **Focus on workflow** rather than technical details
- **Provide clear visual feedback** for interactions

This creates a much better user experience for visual WASM component composition.
