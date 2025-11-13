/**
 * Mock data generators for testing
 * Provides consistent test data across test suites
 */

export const mockDiagram = {
  id: 'test-diagram-001',
  name: 'Test Diagram',
  diagramType: 'workflow',
  created: '2025-01-01T00:00:00Z',
  modified: '2025-01-01T00:00:00Z',
  nodes: [
    {
      id: 'node-1',
      type: 'task',
      label: 'Start Task',
      position: { x: 100, y: 100 },
      properties: {},
    },
    {
      id: 'node-2',
      type: 'task',
      label: 'Process Task',
      position: { x: 300, y: 100 },
      properties: {},
    },
  ],
  edges: [
    {
      id: 'edge-1',
      type: 'sequence',
      source: 'node-1',
      target: 'node-2',
    },
  ],
};

export const mockMcpToolResponse = {
  content: [
    {
      type: 'text',
      text: JSON.stringify({
        success: true,
        diagram_id: 'test-diagram-001',
      }),
    },
  ],
  is_error: false,
};

export const mockMcpErrorResponse = {
  content: [
    {
      type: 'text',
      text: 'Operation failed: Invalid parameters',
    },
  ],
  is_error: true,
};

export const mockWasmComponent = {
  id: 'test-component',
  name: 'Test Component',
  description: 'A test WASM component',
  exports: ['process', 'initialize'],
  imports: ['wasi:cli', 'wasi:filesystem'],
  size: 1024,
};

export const mockCanvas = (): HTMLCanvasElement => {
  const canvas = document.createElement('canvas');
  // Set explicit width and height attributes
  canvas.setAttribute('width', '800');
  canvas.setAttribute('height', '600');
  Object.defineProperty(canvas, 'width', {
    value: 800,
    writable: true,
    configurable: true
  });
  Object.defineProperty(canvas, 'height', {
    value: 600,
    writable: true,
    configurable: true
  });
  Object.defineProperty(canvas, 'clientWidth', {
    value: 800,
    writable: true,
    configurable: true
  });
  Object.defineProperty(canvas, 'clientHeight', {
    value: 600,
    writable: true,
    configurable: true
  });
  return canvas;
};

export const createMockFetch = (response: any, ok = true, sessionId?: string) => {
  const headers = new Headers({ 'content-type': 'application/json' });
  if (sessionId) {
    headers.set('Mcp-Session-Id', sessionId);
  }

  return vi.fn().mockResolvedValue({
    ok,
    status: ok ? 200 : 500,
    json: async () => response,
    text: async () => JSON.stringify(response),
    headers,
  });
};

export const waitFor = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Type declaration for vi
import { vi } from 'vitest';
declare global {
  const vi: typeof import('vitest')['vi'];
}
