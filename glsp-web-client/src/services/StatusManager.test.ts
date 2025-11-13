/**
 * Tests for StatusManager
 * Tests connection status, diagram status, and listeners
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { StatusManager } from './StatusManager';

describe('StatusManager', () => {
  let manager: StatusManager;

  beforeEach(() => {
    manager = new StatusManager();
  });

  describe('connection status', () => {
    it('should initialize with disconnected state', () => {
      const status = manager.getStatus();
      expect(status.mcp).toBe(false);
      expect(status.ai).toBe(false);
      expect(status.message).toBe('Initializing...');
    });

    it('should update MCP connection status', () => {
      manager.setMcpStatus(true);

      const status = manager.getStatus();
      expect(status.mcp).toBe(true);
      expect(status.message).toContain('MCP connected');
    });

    it('should update AI connection status', () => {
      manager.setAiStatus(true);

      const status = manager.getStatus();
      expect(status.ai).toBe(true);
    });

    it('should show all services connected when both are up', () => {
      manager.setMcpStatus(true);
      manager.setAiStatus(true);

      const status = manager.getStatus();
      expect(status.message).toBe('All services connected');
    });

    it('should check if fully connected', () => {
      expect(manager.isFullyConnected()).toBe(false);

      manager.setMcpStatus(true);
      manager.setAiStatus(true);

      expect(manager.isFullyConnected()).toBe(true);
    });
  });

  describe('diagram status', () => {
    it('should set current diagram', () => {
      manager.setCurrentDiagram('diagram-123', 'My Diagram');

      expect(manager.getCurrentDiagramId()).toBe('diagram-123');
      expect(manager.getCurrentDiagramName()).toBe('My Diagram');
      expect(manager.hasCurrentDiagram()).toBe(true);
    });

    it('should clear current diagram', () => {
      manager.setCurrentDiagram('diagram-123', 'My Diagram');
      manager.clearCurrentDiagram();

      expect(manager.getCurrentDiagramId()).toBeUndefined();
      expect(manager.hasCurrentDiagram()).toBe(false);
    });

    it('should track diagram sync status', () => {
      manager.setCurrentDiagram('diagram-123', 'Test');
      manager.setDiagramSyncStatus('saving');

      const status = manager.getDiagramStatus();
      expect(status.syncStatus).toBe('saving');
    });

    it('should mark diagram as saved', () => {
      manager.setCurrentDiagram('diagram-123', 'Test');
      manager.setDiagramSaved();

      const status = manager.getDiagramStatus();
      expect(status.syncStatus).toBe('synced');
      expect(status.hasUnsavedChanges).toBe(false);
      expect(status.lastSaved).toBeDefined();
    });

    it('should mark diagram as dirty', () => {
      manager.setCurrentDiagram('diagram-123', 'Test');
      manager.setDiagramDirty(true);

      expect(manager.hasUnsavedChanges()).toBe(true);

      const status = manager.getDiagramStatus();
      expect(status.syncStatus).toBe('unsaved');
    });
  });

  describe('status listeners', () => {
    it('should notify listeners on status change', () => {
      const listener = vi.fn();
      manager.addListener(listener);

      // Listener called immediately with current status
      expect(listener).toHaveBeenCalledTimes(1);

      manager.setMcpStatus(true);
      expect(listener).toHaveBeenCalledTimes(2);
    });

    it('should remove listeners', () => {
      const listener = vi.fn();
      manager.addListener(listener);
      manager.removeListener(listener);

      listener.mockClear();
      manager.setMcpStatus(true);

      expect(listener).not.toHaveBeenCalled();
    });

    it('should provide combined status to listeners', () => {
      const listener = vi.fn();
      manager.addListener(listener);

      const call = listener.mock.calls[0][0];
      expect(call.connection).toBeDefined();
      expect(call.diagram).toBeDefined();
    });
  });

  describe('combined status', () => {
    it('should return combined status with all data', () => {
      manager.setMcpStatus(true);
      manager.setAiStatus(true);
      manager.setCurrentDiagram('diagram-123', 'Test Diagram');

      const combined = manager.getCombinedStatus();
      expect(combined.connection.mcp).toBe(true);
      expect(combined.connection.ai).toBe(true);
      expect(combined.diagram.currentDiagramId).toBe('diagram-123');
      expect(combined.diagram.currentDiagramName).toBe('Test Diagram');
    });
  });
});
