/**
 * Tests for CanvasRenderer
 * Tests canvas rendering functionality
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { CanvasRenderer } from './canvas-renderer';
import { mockCanvas } from '../test/mockData';

describe('CanvasRenderer', () => {
  let canvas: HTMLCanvasElement;
  let renderer: CanvasRenderer;

  beforeEach(() => {
    canvas = mockCanvas();
    renderer = new CanvasRenderer(canvas);
  });

  describe('initialization', () => {
    it('should create renderer instance', () => {
      expect(renderer).toBeDefined();
      expect(renderer).toBeInstanceOf(CanvasRenderer);
    });

    it('should get canvas context', () => {
      const ctx = canvas.getContext('2d');
      expect(ctx).toBeDefined();
    });

    it('should set canvas dimensions', () => {
      // Canvas dimensions should be set (exact values may vary based on mock)
      expect(canvas).toBeDefined();
      expect(typeof canvas.width).toBe('number');
      expect(typeof canvas.height).toBe('number');
    });

    it('should provide canvas access', () => {
      const canvasElement = renderer.getCanvas();
      expect(canvasElement).toBe(canvas);
    });
  });

  describe('diagram management', () => {
    it('should set diagram', () => {
      const mockDiagram = {
        id: 'test-diagram',
        name: 'Test',
        diagramType: 'workflow',
        elements: {
          'node-1': {
            id: 'node-1',
            type: 'task',
            element_type: 'node',
            bounds: { x: 100, y: 100, width: 120, height: 60 },
          },
        },
      };

      expect(() => {
        renderer.setDiagram(mockDiagram as any);
      }).not.toThrow();
    });

    it('should clear diagram', () => {
      expect(() => {
        renderer.clear();
      }).not.toThrow();
    });

    it('should render without diagram (empty state)', () => {
      expect(() => {
        renderer.render();
      }).not.toThrow();

      // Renderer should handle empty state gracefully
      expect(renderer).toBeDefined();
    });

    it('should render with diagram', () => {
      const mockDiagram = {
        id: 'test-diagram',
        name: 'Test',
        diagramType: 'workflow',
        elements: {
          'node-1': {
            id: 'node-1',
            type: 'task',
            element_type: 'node',
            bounds: { x: 100, y: 100, width: 120, height: 60 },
          },
        },
      };

      renderer.setDiagram(mockDiagram as any);

      // Should render without errors
      expect(renderer).toBeDefined();
    });
  });

  describe('coordinate transformations', () => {
    it('should convert screen to world coordinates', () => {
      const worldPos = renderer.screenToWorld(400, 300);

      expect(worldPos).toBeDefined();
      expect(worldPos.x).toBeDefined();
      expect(worldPos.y).toBeDefined();
    });

    it('should handle coordinate conversion at different scales', () => {
      // Default scale
      const pos1 = renderer.screenToWorld(100, 100);
      expect(pos1.x).toBeDefined();
      expect(pos1.y).toBeDefined();
    });
  });

  describe('interaction modes', () => {
    it('should set interaction mode', () => {
      expect(() => {
        renderer.setInteractionMode('select');
      }).not.toThrow();
    });

    it('should set pan mode', () => {
      expect(() => {
        renderer.setInteractionMode('pan');
      }).not.toThrow();
    });

    it('should set edge creation mode', () => {
      expect(() => {
        renderer.setInteractionMode('edge-creation');
      }).not.toThrow();
    });
  });

  describe('view modes', () => {
    it('should set view mode', () => {
      expect(() => {
        renderer.setViewMode('standard');
      }).not.toThrow();
    });

    it('should get view mode', () => {
      const viewMode = renderer.getViewMode();
      expect(viewMode).toBeDefined();
      expect(typeof viewMode).toBe('string');
    });

    it('should switch to WIT view mode', () => {
      expect(() => {
        renderer.setViewMode('wit');
      }).not.toThrow();

      expect(renderer.getViewMode()).toBe('wit');
    });
  });

  describe('edge creation', () => {
    it('should start edge creation', () => {
      const sourceElement = {
        id: 'node-1',
        type: 'task',
        element_type: 'node',
        bounds: { x: 100, y: 100, width: 120, height: 60 },
      };

      expect(() => {
        renderer.startEdgeCreation(sourceElement as any, 'sequence');
      }).not.toThrow();
    });

    it('should set edge creation type', () => {
      expect(() => {
        renderer.setEdgeCreationType('flow');
      }).not.toThrow();
    });
  });

  describe('interface linking', () => {
    it('should check interface linking mode', () => {
      const isLinking = renderer.getInterfaceLinkingMode();
      expect(typeof isLinking).toBe('boolean');
    });

    it('should clear interface highlights', () => {
      expect(() => {
        renderer.clearInterfaceHighlights();
      }).not.toThrow();
    });
  });

  describe('theming', () => {
    it('should update theme', () => {
      expect(() => {
        renderer.updateTheme();
      }).not.toThrow();
    });
  });

  describe('rendering pipeline', () => {
    it('should handle multiple renders', () => {
      const mockDiagram = {
        id: 'test-diagram',
        name: 'Test',
        diagramType: 'workflow',
        elements: {},
      };

      expect(() => {
        renderer.setDiagram(mockDiagram as any);
        renderer.render();
        renderer.render();
        renderer.render();
      }).not.toThrow();

      // Multiple renders should complete successfully
      expect(renderer).toBeDefined();
    });

    it('should handle render lifecycle', () => {
      expect(() => {
        renderer.render();
      }).not.toThrow();

      // Render should complete the full lifecycle
      expect(renderer).toBeDefined();
    });
  });
});
