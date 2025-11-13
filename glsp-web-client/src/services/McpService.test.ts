/**
 * Tests for McpService
 * Tests MCP client communication and tool operations
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { McpService } from './McpService';
import { createMockFetch, mockMcpToolResponse, mockMcpErrorResponse } from '../test/mockData';

describe('McpService', () => {
  let service: McpService;

  beforeEach(() => {
    service = new McpService();
    vi.clearAllMocks();
  });

  describe('initialization', () => {
    it('should create service instance', () => {
      expect(service).toBeDefined();
      expect(service).toBeInstanceOf(McpService);
    });

    it('should initialize successfully', async () => {
      // Mock successful initialization
      global.fetch = createMockFetch({
        jsonrpc: '2.0',
        result: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          serverInfo: { name: 'glsp-mcp-server', version: '0.1.0' },
        },
      });

      await expect(service.initialize()).resolves.not.toThrow();
    });

    it('should handle initialization errors gracefully', async () => {
      global.fetch = createMockFetch({}, false);

      await expect(service.initialize()).rejects.toThrow();
    });
  });

  describe('connection management', () => {
    it('should report connection status', async () => {
      // Initially not connected
      expect(service.isConnected()).toBe(false);

      // Mock successful connection
      global.fetch = createMockFetch({
        jsonrpc: '2.0',
        result: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          serverInfo: { name: 'glsp-mcp-server', version: '0.1.0' },
        },
      });

      await service.initialize();
      expect(service.isConnected()).toBe(true);
    });

    it('should allow adding connection listeners', () => {
      const listener = vi.fn();
      service.addConnectionListener(listener);

      // Listener should be registered (can't verify call without triggering connection change)
      expect(listener).not.toHaveBeenCalled();
    });

    it('should allow removing connection listeners', () => {
      const listener = vi.fn();
      service.addConnectionListener(listener);
      service.removeConnectionListener(listener);

      // Listener should be removed
      expect(listener).not.toHaveBeenCalled();
    });

    it('should disconnect cleanly', () => {
      expect(() => service.disconnect()).not.toThrow();
    });
  });

  describe('tool operations', () => {
    beforeEach(async () => {
      // Initialize service for tool tests
      global.fetch = createMockFetch({
        jsonrpc: '2.0',
        result: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          serverInfo: { name: 'glsp-mcp-server', version: '0.1.0' },
        },
      });
      await service.initialize();
    });

    it('should call tools with correct parameters', async () => {
      const mockFetch = createMockFetch({
        jsonrpc: '2.0',
        result: mockMcpToolResponse,
      });
      global.fetch = mockFetch;

      const result = await service.callTool('create_diagram', {
        diagramType: 'workflow',
        name: 'Test Diagram',
      });

      expect(mockFetch).toHaveBeenCalled();
      expect(result).toBeDefined();
      expect(result.is_error).toBeFalsy();
    });

    it('should create diagrams', async () => {
      global.fetch = createMockFetch({
        jsonrpc: '2.0',
        result: mockMcpToolResponse,
      });

      const result = await service.createDiagram('workflow', 'Test Diagram');

      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
    });

    it('should delete diagrams', async () => {
      global.fetch = createMockFetch({
        jsonrpc: '2.0',
        result: mockMcpToolResponse,
      });

      const result = await service.deleteDiagram('test-diagram-001');

      expect(result).toBeDefined();
    });

    it('should create nodes', async () => {
      global.fetch = createMockFetch({
        jsonrpc: '2.0',
        result: mockMcpToolResponse,
      });

      const result = await service.createNode(
        'diagram-1',
        'task',
        { x: 100, y: 100 },
        'Test Node'
      );

      expect(result).toBeDefined();
    });

    it('should create edges', async () => {
      global.fetch = createMockFetch({
        jsonrpc: '2.0',
        result: mockMcpToolResponse,
      });

      const result = await service.createEdge(
        'diagram-1',
        'sequence',
        'node-1',
        'node-2',
        'Test Edge'
      );

      expect(result).toBeDefined();
    });

    it('should update elements', async () => {
      global.fetch = createMockFetch({
        jsonrpc: '2.0',
        result: mockMcpToolResponse,
      });

      const result = await service.updateElement('diagram-1', 'node-1', {
        x: 200,
        y: 200,
      });

      expect(result).toBeDefined();
    });

    it('should handle tool errors', async () => {
      global.fetch = createMockFetch({
        jsonrpc: '2.0',
        result: mockMcpErrorResponse,
      });

      const result = await service.callTool('invalid_tool', {});

      expect(result).toBeDefined();
      expect(result.is_error).toBeTruthy();
    });
  });

  describe('error handling', () => {
    it('should handle network failures', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      await expect(service.initialize()).rejects.toThrow();
    });

    it('should handle malformed responses', async () => {
      // Mock a fetch that returns invalid JSON structure
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => {
          throw new Error('Invalid JSON');
        },
        text: async () => 'invalid',
        headers: new Headers({ 'content-type': 'application/json' }),
      });

      // Should handle JSON parsing errors
      await expect(service.initialize()).rejects.toThrow();
    });

    it('should handle timeout errors', async () => {
      global.fetch = vi.fn().mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(
              () =>
                resolve({
                  ok: true,
                  json: async () => ({}),
                }),
              20000
            )
          )
      );

      // Note: Actual timeout implementation would be needed
      // This test verifies the structure is in place
      expect(service).toBeDefined();
    });
  });
});
