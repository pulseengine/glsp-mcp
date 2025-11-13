/**
 * Tests for MCP Client
 * Tests low-level MCP protocol communication
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { McpClient } from './client';
import { createMockFetch } from '../test/mockData';

describe('McpClient', () => {
  let client: McpClient;

  beforeEach(() => {
    client = new McpClient();
    vi.clearAllMocks();
  });

  describe('initialization', () => {
    it('should create client instance', () => {
      expect(client).toBeDefined();
      expect(client).toBeInstanceOf(McpClient);
    });

    it('should initialize with correct protocol version', async () => {
      const mockFetch = createMockFetch({
        jsonrpc: '2.0',
        result: {
          protocolVersion: '2024-11-05',
          capabilities: {
            tools: {},
            resources: {},
            prompts: {},
          },
          serverInfo: {
            name: 'glsp-mcp-server',
            version: '0.1.0',
          },
        },
      });
      global.fetch = mockFetch;

      await client.initialize();

      // Verify fetch was called with correct parameters
      expect(mockFetch).toHaveBeenCalled();
      const fetchCall = mockFetch.mock.calls[0];
      expect(fetchCall[1]?.method).toBe('POST');
    });

    it('should send client info during initialization', async () => {
      const mockFetch = createMockFetch({
        jsonrpc: '2.0',
        result: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          serverInfo: { name: 'test', version: '1.0' },
        },
      });
      global.fetch = mockFetch;

      await client.initialize();

      // Verify client info was sent
      const fetchCall = mockFetch.mock.calls[0];
      const body = JSON.parse(fetchCall[1]?.body as string);
      expect(body.params.clientInfo).toBeDefined();
      expect(body.params.clientInfo.name).toBe('GLSP Web Client');
    });
  });

  describe('JSON-RPC protocol', () => {
    it('should format requests correctly', async () => {
      const mockFetch = createMockFetch({
        jsonrpc: '2.0',
        result: { content: [], isError: false },
      });
      global.fetch = mockFetch;

      // Initialize first
      await client.initialize();

      // Make a tool call
      await client.callTool('test_tool', {});

      // Check request format
      const lastCall = mockFetch.mock.calls[mockFetch.mock.calls.length - 1];
      const body = JSON.parse(lastCall[1]?.body as string);

      expect(body.jsonrpc).toBe('2.0');
      expect(body.method).toBeDefined();
      expect(body.id).toBeDefined();
    });

    it('should handle successful responses', async () => {
      const mockResponse = {
        content: [{ type: 'text', text: 'Success' }],
        isError: false,
      };

      global.fetch = createMockFetch({
        jsonrpc: '2.0',
        result: mockResponse,
      });

      await client.initialize();
      const result = await client.callTool('test', {});

      expect(result).toBeDefined();
      expect(result.isError).toBe(false);
    });

    it('should handle error responses', async () => {
      global.fetch = createMockFetch({
        jsonrpc: '2.0',
        error: {
          code: -32600,
          message: 'Invalid Request',
        },
      });

      // Error should be thrown during initialization when server returns error
      await expect(client.initialize()).rejects.toThrow('MCP Error: Invalid Request');
    });

    it('should include request ID in calls', async () => {
      const mockFetch = createMockFetch({
        jsonrpc: '2.0',
        result: {},
      });
      global.fetch = mockFetch;

      await client.initialize();
      await client.callTool('test', {});

      const lastCall = mockFetch.mock.calls[mockFetch.mock.calls.length - 1];
      const body = JSON.parse(lastCall[1]?.body as string);

      expect(body.id).toBeDefined();
      expect(typeof body.id).toBe('number');
    });
  });

  describe('connection management', () => {
    it('should track connection state', async () => {
      expect(client.isConnected()).toBe(false);

      global.fetch = createMockFetch({
        jsonrpc: '2.0',
        result: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          serverInfo: { name: 'test', version: '1.0' },
        },
      });

      await client.initialize();
      expect(client.isConnected()).toBe(true);
    });

    it('should disconnect cleanly', () => {
      expect(() => client.disconnect()).not.toThrow();
      expect(client.isConnected()).toBe(false);
    });

    it('should notify listeners on connection changes', async () => {
      const listener = vi.fn();
      client.addConnectionListener(listener);

      global.fetch = createMockFetch({
        jsonrpc: '2.0',
        result: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          serverInfo: { name: 'test', version: '1.0' },
        },
      });

      await client.initialize();

      // Listener should be called
      expect(listener).toHaveBeenCalled();
    });
  });

  describe('HTTP headers', () => {
    it('should include session ID in headers', async () => {
      const mockFetch = createMockFetch({
        jsonrpc: '2.0',
        result: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          serverInfo: { name: 'test', version: '1.0' },
        },
      }, true, 'test-session-123');
      global.fetch = mockFetch;

      await client.initialize();

      // Make another call to verify session ID is included
      const mockFetch2 = createMockFetch({
        jsonrpc: '2.0',
        result: { content: [], isError: false },
      });
      global.fetch = mockFetch2;

      await client.callTool('test', {});

      // Check headers on the second call (after session ID was received)
      const lastCall = mockFetch2.mock.calls[0];
      const headers = lastCall[1]?.headers as Record<string, string>;

      expect(headers['Mcp-Session-Id']).toBe('test-session-123');
    });

    it('should set correct content type', async () => {
      const mockFetch = createMockFetch({
        jsonrpc: '2.0',
        result: {},
      });
      global.fetch = mockFetch;

      await client.initialize();

      const call = mockFetch.mock.calls[0];
      const headers = call[1]?.headers as Record<string, string>;

      expect(headers['Content-Type']).toBe('application/json');
    });
  });

  describe('error handling', () => {
    it('should handle network errors', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      await expect(client.initialize()).rejects.toThrow();
    });

    it('should handle HTTP errors', async () => {
      global.fetch = createMockFetch({}, false);

      await expect(client.initialize()).rejects.toThrow();
    });

    it('should handle malformed JSON', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => {
          throw new Error('Invalid JSON');
        },
      });

      await expect(client.initialize()).rejects.toThrow();
    });
  });

  describe('tool calls', () => {
    beforeEach(async () => {
      global.fetch = createMockFetch({
        jsonrpc: '2.0',
        result: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          serverInfo: { name: 'test', version: '1.0' },
        },
      });
      await client.initialize();
    });

    it('should call tools with parameters', async () => {
      const mockFetch = createMockFetch({
        jsonrpc: '2.0',
        result: { content: [], isError: false },
      });
      global.fetch = mockFetch;

      await client.callTool('create_diagram', {
        diagramType: 'workflow',
        name: 'Test',
      });

      const call = mockFetch.mock.calls[0];
      const body = JSON.parse(call[1]?.body as string);

      expect(body.params.name).toBe('create_diagram');
      expect(body.params.arguments.diagramType).toBe('workflow');
    });

    it('should return tool results', async () => {
      const expectedResult = {
        content: [{ type: 'text', text: 'Result' }],
        isError: false,
      };

      global.fetch = createMockFetch({
        jsonrpc: '2.0',
        result: expectedResult,
      });

      const result = await client.callTool('test', {});

      expect(result).toBeDefined();
      expect(result.content).toHaveLength(1);
    });
  });
});
