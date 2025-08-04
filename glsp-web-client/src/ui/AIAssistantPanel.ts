import {
  FloatingPanel,
  FloatingPanelConfig,
  FloatingPanelEvents,
} from "./FloatingPanel.js";

export interface AIMessage {
  sender: "user" | "ai";
  content: string;
  timestamp: Date;
}

export interface AIAssistantEvents {
  onCreateDiagram?: (prompt: string) => Promise<void>;
  onTestDiagram?: () => Promise<void>;
  onAnalyzeDiagram?: () => Promise<void>;
  onOptimizeLayout?: () => Promise<void>;
  onModelChange?: (modelName: string) => void;
}

export class AIAssistantPanel extends FloatingPanel {
  private messages: AIMessage[] = [];
  private aiEvents: AIAssistantEvents;
  private _availableModels: string[] = []; // TODO: Implement model selection
  private _currentModel: string = ""; // TODO: Implement model switching
  private isProcessing: boolean = false;

  constructor(
    events: AIAssistantEvents = {},
    config: Partial<FloatingPanelConfig> = {},
    panelEvents: FloatingPanelEvents = {},
  ) {
    const defaultConfig: FloatingPanelConfig = {
      title: "AI Assistant",
      width: 400,
      height: 600,
      minWidth: 300,
      minHeight: 400,
      initialPosition: { x: window.innerWidth - 420, y: 100 },
      resizable: true,
      draggable: true,
      closable: true,
      collapsible: true,
      className: "ai-assistant-panel",
      zIndex: 1000,
      ...config,
    };

    super(defaultConfig, panelEvents);

    this.aiEvents = events;
    this.setupAIEventHandlers();
    this.addWelcomeMessage();
  }

  protected createContent(): string {
    return `
            <div class="ai-status-section">
                <div class="ai-status-bar">
                    <div class="ai-connection-status">
                        <span class="status-indicator">🔴</span>
                        <span class="status-text">Offline</span>
                    </div>
                    <div class="ai-model-selector">
                        <select class="ai-model-select">
                            <option value="">Select model...</option>
                        </select>
                    </div>
                </div>
            </div>

            <div class="ai-messages-container">
                <div class="ai-messages">
                    <!-- Messages will be added here -->
                </div>
            </div>

            <div class="ai-quick-actions">
                <div class="quick-actions-grid">
                    <button class="ai-action-btn test-btn" data-action="test">
                        🧪 Test Diagram
                    </button>
                    <button class="ai-action-btn analyze-btn" data-action="analyze">
                        🔍 Analyze
                    </button>
                    <button class="ai-action-btn optimize-btn" data-action="optimize">
                        🔧 Optimize
                    </button>
                </div>
            </div>

            <div class="ai-input-section">
                <div class="ai-input-container">
                    <textarea
                        class="ai-input"
                        placeholder="Ask me to create a diagram, analyze your design, or optimize the layout..."
                        rows="3"
                    ></textarea>
                    <button class="ai-send-btn" disabled>
                        <span class="send-icon">📤</span>
                        Send
                    </button>
                </div>
            </div>
        `;
  }

  private setupAIEventHandlers(): void {
    // Send button and input handling
    const input = this.contentElement.querySelector(
      ".ai-input",
    ) as HTMLTextAreaElement;
    const sendBtn = this.contentElement.querySelector(
      ".ai-send-btn",
    ) as HTMLButtonElement;
    const modelSelect = this.contentElement.querySelector(
      ".ai-model-select",
    ) as HTMLSelectElement;

    // Enable/disable send button based on input
    input?.addEventListener("input", () => {
      sendBtn.disabled = !input.value.trim() || this.isProcessing;
    });

    // Send on click
    sendBtn?.addEventListener("click", () => {
      this.handleSendMessage();
    });

    // Send on Enter (but allow Shift+Enter for new lines)
    input?.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        if (!sendBtn.disabled) {
          this.handleSendMessage();
        }
      }
    });

    // Model selection
    modelSelect?.addEventListener("change", (e) => {
      const selectedModel = (e.target as HTMLSelectElement).value;
      this._currentModel = selectedModel;
      this.aiEvents.onModelChange?.(selectedModel);
    });

    // Quick action buttons
    const actionButtons =
      this.contentElement.querySelectorAll(".ai-action-btn");
    actionButtons.forEach((button) => {
      button.addEventListener("click", (e) => {
        const action = (e.currentTarget as HTMLElement).dataset.action;
        this.handleQuickAction(action!);
      });
    });

    this.styleAIComponents();
  }

  private styleAIComponents(): void {
    // Status section
    const statusSection = this.contentElement.querySelector(
      ".ai-status-section",
    ) as HTMLElement;
    if (statusSection) {
      statusSection.style.cssText = `
                margin-bottom: 16px;
                padding-bottom: 12px;
                border-bottom: 1px solid var(--border-color, #2A3441);
            `;
    }

    // Status bar
    const statusBar = this.contentElement.querySelector(
      ".ai-status-bar",
    ) as HTMLElement;
    if (statusBar) {
      statusBar.style.cssText = `
                display: flex;
                justify-content: space-between;
                align-items: center;
                gap: 12px;
            `;
    }

    // Connection status
    const connectionStatus = this.contentElement.querySelector(
      ".ai-connection-status",
    ) as HTMLElement;
    if (connectionStatus) {
      connectionStatus.style.cssText = `
                display: flex;
                align-items: center;
                gap: 6px;
                font-size: 13px;
                font-weight: 500;
            `;
    }

    // Model selector
    const modelSelect = this.contentElement.querySelector(
      ".ai-model-select",
    ) as HTMLSelectElement;
    if (modelSelect) {
      modelSelect.style.cssText = `
                background: var(--bg-primary, #0F1419);
                border: 1px solid var(--border-color, #2A3441);
                border-radius: 4px;
                color: var(--text-primary, #E5E9F0);
                padding: 4px 8px;
                font-size: 12px;
                min-width: 120px;
            `;
    }

    // Messages container
    const messagesContainer = this.contentElement.querySelector(
      ".ai-messages-container",
    ) as HTMLElement;
    if (messagesContainer) {
      messagesContainer.style.cssText = `
                flex: 1;
                margin-bottom: 16px;
                min-height: 200px;
            `;
    }

    // Messages
    const messages = this.contentElement.querySelector(
      ".ai-messages",
    ) as HTMLElement;
    if (messages) {
      messages.style.cssText = `
                height: 100%;
                overflow-y: auto;
                padding: 12px 0;
                display: flex;
                flex-direction: column;
                gap: 12px;
            `;
    }

    // Quick actions
    const quickActions = this.contentElement.querySelector(
      ".ai-quick-actions",
    ) as HTMLElement;
    if (quickActions) {
      quickActions.style.cssText = `
                margin-bottom: 16px;
            `;
    }

    const quickActionsGrid = this.contentElement.querySelector(
      ".quick-actions-grid",
    ) as HTMLElement;
    if (quickActionsGrid) {
      quickActionsGrid.style.cssText = `
                display: grid;
                grid-template-columns: 1fr 1fr 1fr;
                gap: 8px;
            `;
    }

    // Action buttons
    const actionButtons =
      this.contentElement.querySelectorAll(".ai-action-btn");
    actionButtons.forEach((button) => {
      const btn = button as HTMLElement;
      btn.style.cssText = `
                padding: 8px 12px;
                background: var(--bg-primary, #0F1419);
                border: 1px solid var(--border-color, #2A3441);
                border-radius: 4px;
                color: var(--text-secondary, #A0A9BA);
                font-size: 11px;
                font-weight: 500;
                cursor: pointer;
                transition: all 0.2s ease;
                text-align: center;
            `;

      btn.addEventListener("mouseenter", () => {
        btn.style.backgroundColor = "var(--bg-tertiary, #1C2333)";
        btn.style.color = "var(--text-primary, #E5E9F0)";
        btn.style.borderColor = "var(--border-bright, #3D444D)";
      });

      btn.addEventListener("mouseleave", () => {
        btn.style.backgroundColor = "var(--bg-primary, #0F1419)";
        btn.style.color = "var(--text-secondary, #A0A9BA)";
        btn.style.borderColor = "var(--border-color, #2A3441)";
      });
    });

    // Input section
    const inputSection = this.contentElement.querySelector(
      ".ai-input-section",
    ) as HTMLElement;
    if (inputSection) {
      inputSection.style.cssText = `
                border-top: 1px solid var(--border-color, #2A3441);
                padding-top: 12px;
            `;
    }

    // Input container
    const inputContainer = this.contentElement.querySelector(
      ".ai-input-container",
    ) as HTMLElement;
    if (inputContainer) {
      inputContainer.style.cssText = `
                display: flex;
                gap: 8px;
                align-items: end;
            `;
    }

    // Textarea
    const input = this.contentElement.querySelector(
      ".ai-input",
    ) as HTMLTextAreaElement;
    if (input) {
      input.style.cssText = `
                flex: 1;
                background: var(--bg-primary, #0F1419);
                border: 1px solid var(--border-color, #2A3441);
                border-radius: 6px;
                color: var(--text-primary, #E5E9F0);
                padding: 8px 12px;
                font-size: 14px;
                font-family: inherit;
                resize: none;
                min-height: 60px;
                max-height: 120px;
            `;

      input.addEventListener("focus", () => {
        input.style.borderColor = "var(--accent-info, #4A9EFF)";
      });

      input.addEventListener("blur", () => {
        input.style.borderColor = "var(--border-color, #2A3441)";
      });
    }

    // Send button
    const sendBtn = this.contentElement.querySelector(
      ".ai-send-btn",
    ) as HTMLButtonElement;
    if (sendBtn) {
      sendBtn.style.cssText = `
                background: linear-gradient(90deg, #4A9EFF, #00D4AA);
                border: none;
                border-radius: 6px;
                color: white;
                padding: 8px 16px;
                font-size: 13px;
                font-weight: 500;
                cursor: pointer;
                transition: all 0.2s ease;
                display: flex;
                align-items: center;
                gap: 6px;
                height: fit-content;
            `;

      sendBtn.addEventListener("mouseenter", () => {
        if (!sendBtn.disabled) {
          sendBtn.style.transform = "translateY(-1px)";
          sendBtn.style.boxShadow = "0 4px 12px rgba(74, 158, 255, 0.4)";
        }
      });

      sendBtn.addEventListener("mouseleave", () => {
        sendBtn.style.transform = "translateY(0)";
        sendBtn.style.boxShadow = "none";
      });
    }

    // Update content container to use flexbox
    this.contentElement.style.cssText = `
            padding: 16px;
            height: calc(100% - 53px);
            overflow: hidden;
            display: flex;
            flex-direction: column;
        `;
  }

  private addWelcomeMessage(): void {
    this.addMessage({
      sender: "ai",
      content:
        "👋 Hello! I'm your AI assistant. I can help you:\n\n• Create diagrams from descriptions\n• Analyze your current design\n• Optimize layouts and structures\n• Test diagram workflows\n\nWhat would you like to work on today?",
      timestamp: new Date(),
    });
  }

  private async handleSendMessage(): Promise<void> {
    const input = this.contentElement.querySelector(
      ".ai-input",
    ) as HTMLTextAreaElement;
    const prompt = input.value.trim();

    if (!prompt || this.isProcessing) return;

    // Add user message
    this.addMessage({
      sender: "user",
      content: prompt,
      timestamp: new Date(),
    });

    // Clear input
    input.value = "";
    this.updateSendButton();

    // Set processing state
    this.setProcessingState(true);

    try {
      // Call the create diagram event
      await this.aiEvents.onCreateDiagram?.(prompt);
    } catch (error) {
      this.addMessage({
        sender: "ai",
        content: `❌ Sorry, I encountered an error: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
        timestamp: new Date(),
      });
    } finally {
      this.setProcessingState(false);
    }
  }

  private async handleQuickAction(action: string): Promise<void> {
    if (this.isProcessing) return;

    this.setProcessingState(true);

    try {
      switch (action) {
        case "test":
          await this.aiEvents.onTestDiagram?.();
          break;
        case "analyze":
          await this.aiEvents.onAnalyzeDiagram?.();
          break;
        case "optimize":
          await this.aiEvents.onOptimizeLayout?.();
          break;
      }
    } catch (error) {
      this.addMessage({
        sender: "ai",
        content: `❌ Failed to ${action}: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
        timestamp: new Date(),
      });
    } finally {
      this.setProcessingState(false);
    }
  }

  private setProcessingState(processing: boolean): void {
    this.isProcessing = processing;

    const sendBtn = this.contentElement.querySelector(
      ".ai-send-btn",
    ) as HTMLButtonElement;
    const input = this.contentElement.querySelector(
      ".ai-input",
    ) as HTMLTextAreaElement;
    const actionButtons =
      this.contentElement.querySelectorAll(".ai-action-btn");

    if (processing) {
      sendBtn.disabled = true;
      sendBtn.textContent = "Processing...";
      input.disabled = true;
      actionButtons.forEach(
        (btn) => ((btn as HTMLButtonElement).disabled = true),
      );
    } else {
      this.updateSendButton();
      input.disabled = false;
      actionButtons.forEach(
        (btn) => ((btn as HTMLButtonElement).disabled = false),
      );
    }
  }

  private updateSendButton(): void {
    const sendBtn = this.contentElement.querySelector(
      ".ai-send-btn",
    ) as HTMLButtonElement;
    const input = this.contentElement.querySelector(
      ".ai-input",
    ) as HTMLTextAreaElement;

    sendBtn.disabled = !input.value.trim() || this.isProcessing;

    if (!this.isProcessing) {
      sendBtn.innerHTML = '<span class="send-icon">📤</span>Send';
    }
  }

  public addMessage(message: AIMessage): void {
    this.messages.push(message);

    const messagesContainer = this.contentElement.querySelector(
      ".ai-messages",
    ) as HTMLElement;
    const messageElement = this.createMessageElement(message);

    messagesContainer.appendChild(messageElement);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }

  private createMessageElement(message: AIMessage): HTMLElement {
    const element = document.createElement("div");
    element.className = `ai-message ${message.sender}-message`;

    const isUser = message.sender === "user";
    const backgroundColor = isUser
      ? "var(--accent-info, #4A9EFF)"
      : "var(--bg-primary, #0F1419)";
    const textColor = isUser ? "white" : "var(--text-primary, #E5E9F0)";
    const alignment = isUser ? "flex-end" : "flex-start";

    element.style.cssText = `
            display: flex;
            justify-content: ${alignment};
            margin-bottom: 8px;
        `;

    const messageContent = document.createElement("div");
    messageContent.className = "message-content";
    messageContent.style.cssText = `
            background: ${backgroundColor};
            color: ${textColor};
            padding: 10px 14px;
            border-radius: 12px;
            max-width: 80%;
            word-wrap: break-word;
            white-space: pre-wrap;
            font-size: 14px;
            line-height: 1.4;
            ${
              isUser
                ? "border-bottom-right-radius: 4px;"
                : "border-bottom-left-radius: 4px;"
            }
        `;

    // Handle markdown-like formatting
    let content = message.content;
    // Bold
    content = content.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
    // Code blocks
    content = content.replace(
      /`(.*?)`/g,
      '<code style="background: rgba(255,255,255,0.1); padding: 2px 4px; border-radius: 3px; font-family: monospace;">$1</code>',
    );

    messageContent.innerHTML = content;
    element.appendChild(messageContent);

    return element;
  }

  public updateConnectionStatus(connected: boolean): void {
    const statusIndicator = this.contentElement.querySelector(
      ".status-indicator",
    ) as HTMLElement;
    const statusText = this.contentElement.querySelector(
      ".status-text",
    ) as HTMLElement;

    if (connected) {
      statusIndicator.textContent = "🟢";
      statusText.textContent = "Online";
      statusText.style.color = "var(--accent-success, #3FB950)";
    } else {
      statusIndicator.textContent = "🔴";
      statusText.textContent = "Offline";
      statusText.style.color = "var(--accent-error, #F85149)";
    }
  }

  public updateModelSelection(models: string[], currentModel: string): void {
    this._availableModels = models;
    this._currentModel = currentModel;

    const modelSelect = this.contentElement.querySelector(
      ".ai-model-select",
    ) as HTMLSelectElement;
    if (modelSelect) {
      // Clear existing options
      modelSelect.innerHTML = '<option value="">Select model...</option>';

      // Add model options
      models.forEach((model) => {
        const option = document.createElement("option");
        option.value = model;
        option.textContent = model;
        option.selected = model === currentModel;
        modelSelect.appendChild(option);
      });
    }
  }

  public clearMessages(): void {
    this.messages = [];
    const messagesContainer = this.contentElement.querySelector(
      ".ai-messages",
    ) as HTMLElement;
    messagesContainer.innerHTML = "";
    this.addWelcomeMessage();
  }
}
