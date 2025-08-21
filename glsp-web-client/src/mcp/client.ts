/**
 * MCP HTTP Client for GLSP
 * Implements Model Context Protocol over HTTP with JSON-RPC and streaming
 *
 * Updated for PulseEngine MCP Framework 0.3.0:
 * - Using /messages endpoint for compatibility
 * - Session ID sent in headers (Mcp-Session-Id) instead of query params
 * - HTTP streaming support for real-time updates
 * - Compatible with streamable_http transport
 */

export interface JsonRpcRequest {
  jsonrpc: string;
  method: string;
  params?: Record<string, unknown>;
  id?: string | number;
}

export interface JsonRpcResponse {
  jsonrpc: string;
  result?: unknown;
  error?: JsonRpcError;
  id?: string | number;
}

export interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

export interface InitializeParams extends Record<string, unknown> {
  protocolVersion: string;
  capabilities: ClientCapabilities;
  clientInfo: ClientInfo;
}

export interface ClientCapabilities {
  experimental?: Record<string, unknown>;
  sampling?: SamplingCapabilities;
}

export interface InitializeResult {
  protocolVersion: string;
  capabilities: ServerCapabilities;
  serverInfo: ServerInfo;
}

export interface ServerCapabilities {
  tools?: Record<string, unknown>;
  resources?: Record<string, unknown>;
  prompts?: Record<string, unknown>;
}

export interface ServerInfo {
  name: string;
  version: string;
}

export interface McpNotification {
  method: string;
  params?: Record<string, unknown>;
}

export interface SamplingCapabilities {}

export interface ClientInfo {
  name: string;
  version: string;
}

export interface Resource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

export interface ResourceContent {
  uri: string;
  mimeType?: string;
  text?: string;
  blob?: string;
}

export interface Tool {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
}

export interface CallToolParams extends Record<string, unknown> {
  name: string;
  arguments?: Record<string, unknown>;
}

export interface CallToolResult {
  content: TextContent[];
  isError?: boolean;
}

export interface TextContent {
  type: string;
  text: string;
}

export interface Prompt {
  name: string;
  description?: string;
  arguments?: PromptArgument[];
}

export interface PromptArgument {
  name: string;
  description?: string;
  required?: boolean;
}

export interface GetPromptParams extends Record<string, unknown> {
  name: string;
  arguments?: Record<string, string>;
}

export interface GetPromptResult {
  description?: string;
  messages: PromptMessage[];
}

export interface PromptMessage {
  role: string;
  content: TextContent;
}

export interface ConnectionHealthMetrics {
  connected: boolean;
  reconnectAttempts: number;
  maxReconnectAttempts: number;
  lastPingTime?: number;
  avgPingTime?: number;
  sessionId?: string;
  reconnecting: boolean;
  nextReconnectIn?: number;
}

export type ConnectionHealthListener = (
  metrics: ConnectionHealthMetrics,
) => void;

export class McpClient {
  private baseUrl: string;
  private requestId: number = 0;
  private connected: boolean = false;
  private pingInterval?: number;
  private reconnectTimeout?: number;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 5;
  private connectionListeners: ((connected: boolean) => void)[] = [];
  private connectionHealthListeners: ConnectionHealthListener[] = [];
  private sessionId: string | null = null;
  private notificationListeners: Map<
    string,
    ((notification: McpNotification) => void)[]
  > = new Map();
  private streamingController?: AbortController;
  private streamingActive: boolean = false;
  private streamListeners: Map<string, ((data: unknown) => void)[]> = new Map();
  private lastPingTime?: number;
  private pingTimes: number[] = [];
  private reconnecting: boolean = false;
  private reconnectStartTime?: number;

  constructor(baseUrl?: string) {
    // Use environment-appropriate base URL if not provided
    if (baseUrl) {
      this.baseUrl = baseUrl;
    } else {
      // Import dynamically to avoid circular dependencies
      import("../utils/environment.js").then(({ getApiBaseUrl }) => {
        this.baseUrl = getApiBaseUrl();
      });
      // Fallback for immediate use
      this.baseUrl = (window as any).__TAURI__
        ? "http://localhost:3000"
        : "http://127.0.0.1:3000";
    }
  }

  private nextId(): number {
    return ++this.requestId;
  }

  public addConnectionListener(listener: (connected: boolean) => void): void {
    this.connectionListeners.push(listener);
  }

  public removeConnectionListener(
    listener: (connected: boolean) => void,
  ): void {
    const index = this.connectionListeners.indexOf(listener);
    if (index > -1) {
      this.connectionListeners.splice(index, 1);
    }
  }

  public addConnectionHealthListener(listener: ConnectionHealthListener): void {
    this.connectionHealthListeners.push(listener);
    // Immediately call with current health metrics
    listener(this.getConnectionHealthMetrics());
  }

  public removeConnectionHealthListener(
    listener: ConnectionHealthListener,
  ): void {
    const index = this.connectionHealthListeners.indexOf(listener);
    if (index > -1) {
      this.connectionHealthListeners.splice(index, 1);
    }
  }

  public getConnectionHealthMetrics(): ConnectionHealthMetrics {
    return {
      connected: this.connected,
      reconnectAttempts: this.reconnectAttempts,
      maxReconnectAttempts: this.maxReconnectAttempts,
      lastPingTime: this.lastPingTime,
      avgPingTime:
        this.pingTimes.length > 0
          ? this.pingTimes.reduce((a, b) => a + b, 0) / this.pingTimes.length
          : undefined,
      sessionId: this.sessionId || undefined,
      reconnecting: this.reconnecting,
      nextReconnectIn: this.reconnectTimeout
        ? Math.max(
            0,
            (this.reconnectStartTime || 0) +
              1000 * Math.pow(2, this.reconnectAttempts - 1) -
              Date.now(),
          )
        : undefined,
    };
  }

  private notifyConnectionHealthChange(): void {
    const metrics = this.getConnectionHealthMetrics();
    this.connectionHealthListeners.forEach((listener) => listener(metrics));
  }

  private notifyConnectionChange(connected: boolean): void {
    if (this.connected !== connected) {
      this.connected = connected;
      console.log(
        `MCP connection status changed: ${
          connected ? "Connected" : "Disconnected"
        }`,
      );
      this.connectionListeners.forEach((listener) => listener(connected));
      this.notifyConnectionHealthChange();
    }
  }

  public isConnected(): boolean {
    return this.connected;
  }

  /**
   * Send MCP notification (ready for use - just needs to be called)
   * @param method The notification method name
   * @param params Optional parameters for the notification
   */
  public async sendNotification(
    method: string,
    params?: Record<string, unknown>,
  ): Promise<void> {
    console.log(`McpClient: Sending notification ${method}`, params);
    const notification: JsonRpcRequest = {
      jsonrpc: "2.0",
      method,
      params,
      // Notifications don't have an ID
    };

    try {
      // Use /messages endpoint
      const url = `${this.baseUrl}/messages`;

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        Accept: "application/json",
      };

      // Include session ID in headers for new framework
      if (this.sessionId) {
        headers["Mcp-Session-Id"] = this.sessionId;
      }

      const response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(notification),
      });

      // Notifications don't expect a response body
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
    } catch (error) {
      console.error("MCP notification failed:", error);
      throw error;
    }
  }

  private async sendRequest(
    method: string,
    params?: Record<string, unknown>,
  ): Promise<unknown> {
    console.log(`McpClient: Sending request ${method}`, params);
    const request: JsonRpcRequest = {
      jsonrpc: "2.0",
      method,
      params,
      id: this.nextId(),
    };

    try {
      // Use /messages endpoint
      const url = `${this.baseUrl}/messages`;

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        Accept: "application/json",
      };

      // Include session ID in headers for new framework
      if (this.sessionId) {
        headers["Mcp-Session-Id"] = this.sessionId;
      }

      // Create AbortController for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000); // 8 second timeout

      try {
        const response = await fetch(url, {
          method: "POST",
          headers,
          body: JSON.stringify(request),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          this.notifyConnectionChange(false);
          this.scheduleReconnect();
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        // Check if response has content
        const contentLength = response.headers.get("content-length");
        if (contentLength === "0" || response.status === 204) {
          // No content response - framework should always return content
          throw new Error("Empty response from server");
        }

        // Extract session ID from response headers if present
        const sessionHeader = response.headers.get("Mcp-Session-Id");
        if (sessionHeader && !this.sessionId) {
          this.sessionId = sessionHeader;
          console.log("McpClient: Session ID set:", this.sessionId);
        }

        const jsonResponse: JsonRpcResponse = await response.json();

        if (jsonResponse.error) {
          throw new Error(`MCP Error: ${jsonResponse.error.message}`);
        }

        // Successful request - update connection status
        this.notifyConnectionChange(true);
        this.reconnectAttempts = 0;

        return jsonResponse.result;
      } catch (fetchError: unknown) {
        clearTimeout(timeoutId);

        // Check if it's an abort error (timeout)
        if (fetchError instanceof Error && fetchError.name === "AbortError") {
          throw new Error("Request timeout after 8 seconds");
        }
        throw fetchError;
      }
    } catch (error) {
      console.error("MCP request failed:", error);
      this.notifyConnectionChange(false);
      this.scheduleReconnect();
      throw error;
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.log("Max reconnection attempts reached");
      this.reconnecting = false;
      this.notifyConnectionHealthChange();
      return;
    }

    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000); // Exponential backoff, max 30s
    this.reconnectAttempts++;
    this.reconnecting = true;
    this.reconnectStartTime = Date.now();

    console.log(
      `Scheduling reconnection attempt ${this.reconnectAttempts} in ${delay}ms`,
    );
    this.notifyConnectionHealthChange();

    this.reconnectTimeout = window.setTimeout(async () => {
      try {
        await this.initialize();
        this.reconnecting = false;
        this.notifyConnectionHealthChange();
      } catch (error) {
        console.error("Reconnection attempt failed:", error);
        this.scheduleReconnect(); // Continue trying
      }
    }, delay);
  }

  private startPing(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
    }

    this.pingInterval = window.setInterval(async () => {
      try {
        await this.ping();
      } catch (error) {
        console.error("Ping failed:", error);
        this.notifyConnectionChange(false);
        this.scheduleReconnect();
      }
    }, 30000); // Ping every 30 seconds
  }

  private stopPing(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = undefined;
    }
  }

  public disconnect(): void {
    this.stopPing();
    this.stopStreaming();
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = undefined;
    }
    this.notifyConnectionChange(false);
  }

  async ping(): Promise<unknown> {
    const startTime = Date.now();

    // Try ping first, fall back to a simpler method if ping isn't supported
    let result;
    try {
      result = await this.sendRequest("ping", {});
    } catch (error: unknown) {
      // If ping method is not supported, try listing tools as a health check
      if (
        error instanceof Error &&
        error.message &&
        error.message.includes("Unknown method")
      ) {
        console.log(
          "MCP server does not support ping method, using listTools as health check",
        );
        result = await this.listTools();
      } else {
        // Re-throw the error without updating ping metrics
        throw error;
      }
    }

    // Record successful ping time
    const pingTime = Date.now() - startTime;
    this.lastPingTime = pingTime;
    this.pingTimes.push(pingTime);

    // Keep only last 10 ping times for average calculation
    if (this.pingTimes.length > 10) {
      this.pingTimes.shift();
    }

    this.notifyConnectionHealthChange();
    return result;
  }

  async initialize(): Promise<InitializeResult> {
    console.log("McpClient: Initializing...");
    // Reset session ID on new initialization
    this.sessionId = null;

    try {
      const params: InitializeParams = {
        protocolVersion: "2024-11-05",
        capabilities: {
          experimental: {},
          sampling: {},
        },
        clientInfo: {
          name: "GLSP Web Client",
          version: "0.1.0",
        },
      };

      const result = await this.sendRequest("initialize", params);

      // Note: PulseEngine MCP framework doesn't require 'initialized' notification
      // await this.sendNotification('initialized', {});

      // Explicitly set connection to true after successful initialization
      console.log("MCP client successfully initialized and connected");
      this.reconnectAttempts = 0; // Reset on successful connection
      this.reconnecting = false;
      this.notifyConnectionChange(true);

      // Start pinging to maintain connection
      this.startPing();

      return result as InitializeResult;
    } catch (error) {
      console.error("MCP initialization failed:", error);
      this.notifyConnectionChange(false);
      this.scheduleReconnect();
      throw error;
    }
  }

  async listTools(): Promise<Tool[]> {
    const result = (await this.sendRequest("tools/list")) as { tools: Tool[] };
    return result.tools || [];
  }

  async callTool(
    name: string,
    args?: Record<string, unknown>,
  ): Promise<CallToolResult> {
    const params: CallToolParams = {
      name,
      arguments: args,
    };
    return (await this.sendRequest("tools/call", params)) as CallToolResult;
  }

  async listResources(): Promise<Resource[]> {
    const result = (await this.sendRequest("resources/list")) as {
      resources: Resource[];
    };
    return result.resources || [];
  }

  async readResource(uri: string): Promise<ResourceContent> {
    return (await this.sendRequest("resources/read", {
      uri,
    })) as ResourceContent;
  }

  async listPrompts(): Promise<Prompt[]> {
    const result = (await this.sendRequest("prompts/list")) as {
      prompts: Prompt[];
    };
    return result.prompts || [];
  }

  async getPrompt(
    name: string,
    args?: Record<string, string>,
  ): Promise<GetPromptResult> {
    const params: GetPromptParams = {
      name,
      arguments: args,
    };
    return (await this.sendRequest("prompts/get", params)) as GetPromptResult;
  }

  async healthCheck(): Promise<unknown> {
    // Use ping instead of separate health endpoint
    return await this.ping();
  }

  public addNotificationListener(
    method: string,
    listener: (notification: McpNotification) => void,
  ): void {
    if (!this.notificationListeners.has(method)) {
      this.notificationListeners.set(method, []);
    }
    this.notificationListeners.get(method)!.push(listener);
  }

  public removeNotificationListener(
    method: string,
    listener: (notification: McpNotification) => void,
  ): void {
    const listeners = this.notificationListeners.get(method);
    if (listeners) {
      const index = listeners.indexOf(listener);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    }
  }

  /**
   * Handle incoming MCP notifications (ready for use - call from message handler)
   * @param notification The received notification
   */
  private __handleNotification(notification: McpNotification): void {
    console.log("Received MCP notification:", notification);
    const listeners = this.notificationListeners.get(notification.method);
    if (listeners) {
      listeners.forEach((listener) => {
        try {
          listener(notification);
        } catch (error) {
          console.error("Error in notification listener:", error);
        }
      });
    }
  }

  /// HTTP Streaming Support for MCP 0.3.0

  public addStreamListener(
    streamType: string,
    listener: (data: unknown) => void,
  ): void {
    if (!this.streamListeners.has(streamType)) {
      this.streamListeners.set(streamType, []);
    }
    this.streamListeners.get(streamType)!.push(listener);

    // Automatically start streaming when first listener is added
    if (!this.streamingActive && this.connected) {
      console.log(`McpClient: Starting streaming for ${streamType}`);
      this.startStreaming().catch((error) => {
        console.error("Failed to start streaming:", error);
      });
    }
  }

  public removeStreamListener(
    streamType: string,
    listener: (data: unknown) => void,
  ): void {
    const listeners = this.streamListeners.get(streamType);
    if (listeners) {
      const index = listeners.indexOf(listener);
      if (index > -1) {
        listeners.splice(index, 1);
      }
      // Clean up empty listener arrays
      if (listeners.length === 0) {
        this.streamListeners.delete(streamType);
      }
    }

    // Stop streaming if no more listeners
    if (this.streamListeners.size === 0) {
      this.stopStreaming();
    }
  }

  /**
   * Start HTTP streaming for real-time MCP updates (ready for use - call when needed)
   * Implements Server-Sent Events style streaming over HTTP
   */
  private async startStreaming(): Promise<void> {
    if (this.streamingActive) {
      return;
    }

    console.log("McpClient: Starting HTTP streaming...");
    this.streamingController = new AbortController();
    this.streamingActive = true;

    try {
      const url = `${this.baseUrl}/sse`;

      const headers: Record<string, string> = {
        Accept: "text/event-stream",
        "Cache-Control": "no-cache",
      };

      if (this.sessionId) {
        headers["Mcp-Session-Id"] = this.sessionId;
      }

      const response = await fetch(url, {
        method: "GET",
        headers,
        signal: this.streamingController.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP streaming failed: ${response.status}`);
      }

      if (!response.body) {
        throw new Error("No response body for streaming");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (this.streamingActive) {
        const { done, value } = await reader.read();

        if (done) {
          console.log("HTTP stream ended");
          break;
        }

        const chunk = decoder.decode(value, { stream: true });
        this.processStreamChunk(chunk);
      }
    } catch (error: unknown) {
      if (error instanceof Error && error.name !== "AbortError") {
        console.error("HTTP streaming error:", error);
        this.notifyConnectionChange(false);

        // Note: streamable_http doesn't need reconnection for streaming
        // setTimeout(() => {
        //     if (this.streamListeners.size > 0) {
        //         this.startStreaming();
        //     }
        // }, 5000);
      }
    } finally {
      this.streamingActive = false;
    }
  }

  private stopStreaming(): void {
    if (this.streamingController) {
      this.streamingController.abort();
      this.streamingController = undefined;
    }
    this.streamingActive = false;
    console.log("McpClient: HTTP streaming stopped");
  }

  private processStreamChunk(chunk: string): void {
    // Process Server-Sent Events style chunks
    const lines = chunk.split("\n");
    let eventType = "";
    let eventData = "";

    for (const line of lines) {
      if (line.startsWith("event:")) {
        eventType = line.substring(6).trim();
      } else if (line.startsWith("data:")) {
        eventData += line.substring(5).trim() + "\n";
      } else if (line.trim() === "") {
        // End of event, process it
        if (eventType && eventData) {
          this.handleStreamEvent(eventType, eventData.trim());
        }
        eventType = "";
        eventData = "";
      }
    }
  }

  private handleStreamEvent(eventType: string, data: string): void {
    try {
      const parsedData = JSON.parse(data);
      console.log(
        `McpClient: Received stream event '${eventType}':`,
        parsedData,
      );

      // Check if this is an MCP notification
      if (eventType === "notification" || parsedData.method) {
        // Route MCP notifications through the notification handler
        this.__handleNotification(parsedData as McpNotification);
      }

      // Continue with regular stream listeners
      const listeners = this.streamListeners.get(eventType);
      if (listeners) {
        listeners.forEach((listener) => {
          try {
            listener(parsedData);
          } catch (error) {
            console.error("Error in stream listener:", error);
          }
        });
      }
    } catch (error) {
      console.error("Failed to parse stream data:", error, "Raw data:", data);
    }
  }

  public isStreaming(): boolean {
    return this.streamingActive;
  }

  /**
   * Manually trigger reconnection (for user-initiated reconnect button)
   */
  public async manualReconnect(): Promise<void> {
    console.log("McpClient: Manual reconnect triggered");

    // Clear any existing reconnection timers
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = undefined;
    }

    // Reset reconnect attempts for manual retry
    this.reconnectAttempts = 0;
    this.reconnecting = true;
    this.notifyConnectionHealthChange();

    try {
      await this.initialize();
    } catch (error) {
      console.error("Manual reconnection failed:", error);
      // Don't automatically schedule another reconnect for manual attempts
      this.reconnecting = false;
      this.notifyConnectionHealthChange();
      throw error;
    }
  }
}
