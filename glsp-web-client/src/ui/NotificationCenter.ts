export interface Notification {
  id: string;
  title: string;
  message: string;
  type: "info" | "success" | "warning" | "error";
  timestamp: Date;
  read: boolean;
  actions?: NotificationAction[];
  autoHide?: boolean;
  duration?: number; // in milliseconds
  priority?: "low" | "medium" | "high";
  category?: string;
}

export interface NotificationAction {
  label: string;
  action: () => void;
  style?: "primary" | "secondary" | "danger";
}

export interface NotificationCenterEvents {
  onNotificationAdded?: (notification: Notification) => void;
  onNotificationRead?: (notificationId: string) => void;
  onNotificationRemoved?: (notificationId: string) => void;
  onNotificationCleared?: () => void;
  onNotificationAction?: (notificationId: string, actionLabel: string) => void;
}

export class NotificationCenter {
  private static instance: NotificationCenter;
  private notifications: Map<string, Notification> = new Map();
  private events: NotificationCenterEvents = {};
  private container?: HTMLElement;
  private isVisible: boolean = false;
  private unreadCount: number = 0;

  private constructor() {
    this.setupGlobalListeners();
  }

  public static getInstance(): NotificationCenter {
    if (!NotificationCenter.instance) {
      NotificationCenter.instance = new NotificationCenter();
    }
    return NotificationCenter.instance;
  }

  public setEvents(events: NotificationCenterEvents): void {
    this.events = events;
  }

  private setupGlobalListeners(): void {
    // Close notification center when clicking outside
    document.addEventListener("click", (e) => {
      if (this.container && this.isVisible) {
        if (!this.container.contains(e.target as Node)) {
          const trigger = document.querySelector("[data-notification-trigger]");
          if (trigger && !trigger.contains(e.target as Node)) {
            this.hide();
          }
        }
      }
    });

    // Handle escape key to close
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && this.isVisible) {
        this.hide();
      }
    });
  }

  public addNotification(
    notification: Omit<Notification, "id" | "timestamp" | "read">,
  ): string {
    const id = this.generateId();
    const fullNotification: Notification = {
      ...notification,
      id,
      timestamp: new Date(),
      read: false,
    };

    this.notifications.set(id, fullNotification);
    this.updateUnreadCount();

    // Auto-hide logic
    if (fullNotification.autoHide !== false) {
      const duration =
        fullNotification.duration ||
        this.getDefaultDuration(fullNotification.type);
      setTimeout(() => {
        this.removeNotification(id);
      }, duration);
    }

    this.events.onNotificationAdded?.(fullNotification);

    // Update UI if visible
    if (this.isVisible) {
      this.renderNotifications();
    }

    return id;
  }

  private getDefaultDuration(type: Notification["type"]): number {
    switch (type) {
      case "error":
        return 8000;
      case "warning":
        return 6000;
      case "success":
        return 4000;
      case "info":
        return 5000;
      default:
        return 5000;
    }
  }

  public removeNotification(id: string): boolean {
    const notification = this.notifications.get(id);
    if (notification) {
      this.notifications.delete(id);
      this.updateUnreadCount();
      this.events.onNotificationRemoved?.(id);

      if (this.isVisible) {
        this.renderNotifications();
      }
      return true;
    }
    return false;
  }

  public markAsRead(id: string): boolean {
    const notification = this.notifications.get(id);
    if (notification && !notification.read) {
      notification.read = true;
      this.notifications.set(id, notification);
      this.updateUnreadCount();
      this.events.onNotificationRead?.(id);

      if (this.isVisible) {
        this.renderNotifications();
      }
      return true;
    }
    return false;
  }

  public markAllAsRead(): void {
    this.notifications.forEach((notification, id) => {
      if (!notification.read) {
        notification.read = true;
        this.notifications.set(id, notification);
        this.events.onNotificationRead?.(id);
      }
    });
    this.updateUnreadCount();

    if (this.isVisible) {
      this.renderNotifications();
    }
  }

  public clearAll(): void {
    this.notifications.clear();
    this.updateUnreadCount();
    this.events.onNotificationCleared?.();

    if (this.isVisible) {
      this.renderNotifications();
    }
  }

  public clearRead(): void {
    const toRemove: string[] = [];
    this.notifications.forEach((notification, id) => {
      if (notification.read) {
        toRemove.push(id);
      }
    });

    toRemove.forEach((id) => {
      this.notifications.delete(id);
      this.events.onNotificationRemoved?.(id);
    });

    this.updateUnreadCount();

    if (this.isVisible) {
      this.renderNotifications();
    }
  }

  public getUnreadCount(): number {
    return this.unreadCount;
  }

  public getNotifications(): Notification[] {
    return Array.from(this.notifications.values()).sort(
      (a, b) => b.timestamp.getTime() - a.timestamp.getTime(),
    );
  }

  public getNotificationsByCategory(category: string): Notification[] {
    return this.getNotifications().filter((n) => n.category === category);
  }

  public show(anchorElement?: HTMLElement): void {
    if (!this.container) {
      this.createContainer();
    }

    if (this.container) {
      this.positionContainer(anchorElement);
      this.renderNotifications();
      this.container.style.display = "block";
      this.isVisible = true;

      // Animate in
      requestAnimationFrame(() => {
        if (this.container) {
          this.container.style.opacity = "1";
          this.container.style.transform = "translateY(0) scale(1)";
        }
      });
    }
  }

  public hide(): void {
    if (this.container && this.isVisible) {
      this.container.style.opacity = "0";
      this.container.style.transform = "translateY(-10px) scale(0.95)";

      setTimeout(() => {
        if (this.container) {
          this.container.style.display = "none";
          this.isVisible = false;
        }
      }, 200);
    }
  }

  public toggle(anchorElement?: HTMLElement): void {
    if (this.isVisible) {
      this.hide();
    } else {
      this.show(anchorElement);
    }
  }

  private createContainer(): void {
    this.container = document.createElement("div");
    this.container.className = "notification-center";
    this.container.style.cssText = `
            position: fixed;
            top: 60px;
            right: 20px;
            width: 380px;
            max-width: 90vw;
            max-height: 500px;
            background: var(--bg-secondary, #1C2333);
            border: 1px solid var(--border-color, #2A3441);
            border-radius: 8px;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
            z-index: 10000;
            display: none;
            opacity: 0;
            transform: translateY(-10px) scale(0.95);
            transition: all 0.2s ease;
            overflow: hidden;
        `;

    document.body.appendChild(this.container);
  }

  private positionContainer(anchorElement?: HTMLElement): void {
    if (!this.container) return;

    if (anchorElement) {
      const rect = anchorElement.getBoundingClientRect();
      const containerWidth = 380;
      const viewportWidth = window.innerWidth;

      // Position relative to anchor
      let left = rect.right - containerWidth;
      let top = rect.bottom + 8;

      // Adjust if goes off screen
      if (left < 20) {
        left = 20;
      }
      if (left + containerWidth > viewportWidth - 20) {
        left = viewportWidth - containerWidth - 20;
      }

      // Adjust vertical position if needed
      if (top + 500 > window.innerHeight) {
        top = rect.top - 500 - 8;
        if (top < 20) {
          top = 20;
        }
      }

      this.container.style.left = `${left}px`;
      this.container.style.top = `${top}px`;
      this.container.style.right = "auto";
    } else {
      // Default positioning
      this.container.style.right = "20px";
      this.container.style.top = "60px";
      this.container.style.left = "auto";
    }
  }

  private renderNotifications(): void {
    if (!this.container) return;

    const notifications = this.getNotifications();

    this.container.innerHTML = `
            <div class="notification-header">
                <h3>Notifications</h3>
                <div class="notification-actions">
                    ${
                      notifications.some((n) => !n.read)
                        ? '<button class="mark-all-read">Mark all read</button>'
                        : ""
                    }
                    ${
                      notifications.length > 0
                        ? '<button class="clear-all">Clear all</button>'
                        : ""
                    }
                </div>
            </div>
            <div class="notification-list">
                ${
                  notifications.length === 0
                    ? '<div class="no-notifications">No notifications</div>'
                    : notifications
                        .map((n) => this.renderNotification(n))
                        .join("")
                }
            </div>
        `;

    this.styleNotificationCenter();
    this.setupNotificationEvents();
  }

  private renderNotification(notification: Notification): string {
    const typeIcon = this.getTypeIcon(notification.type);
    const timeAgo = this.formatTimeAgo(notification.timestamp);

    return `
            <div class="notification-item ${
              notification.read ? "read" : "unread"
            }" data-notification-id="${notification.id}">
                <div class="notification-content">
                    <div class="notification-header-item">
                        <span class="notification-icon ${
                          notification.type
                        }">${typeIcon}</span>
                        <span class="notification-title">${
                          notification.title
                        }</span>
                        <span class="notification-time">${timeAgo}</span>
                    </div>
                    <div class="notification-message">${
                      notification.message
                    }</div>
                    ${
                      notification.actions
                        ? `
                        <div class="notification-actions-list">
                            ${notification.actions
                              .map(
                                (action) => `
                                <button class="notification-action ${
                                  action.style || "secondary"
                                }" data-action="${action.label}">
                                    ${action.label}
                                </button>
                            `,
                              )
                              .join("")}
                        </div>
                    `
                        : ""
                    }
                </div>
                <button class="notification-close" data-close="${
                  notification.id
                }">×</button>
            </div>
        `;
  }

  private styleNotificationCenter(): void {
    if (!this.container) return;

    // Header styles
    const header = this.container.querySelector(
      ".notification-header",
    ) as HTMLElement;
    if (header) {
      header.style.cssText = `
                padding: 16px 20px;
                border-bottom: 1px solid var(--border-color, #2A3441);
                display: flex;
                justify-content: space-between;
                align-items: center;
            `;
    }

    const title = this.container.querySelector("h3") as HTMLElement;
    if (title) {
      title.style.cssText = `
                margin: 0;
                font-size: 16px;
                font-weight: 600;
                color: var(--text-primary, #E5E9F0);
            `;
    }

    // Action buttons
    const actionButtons = this.container.querySelectorAll(
      ".notification-actions button",
    );
    actionButtons.forEach((button) => {
      const btn = button as HTMLElement;
      btn.style.cssText = `
                background: transparent;
                border: 1px solid var(--border-color, #2A3441);
                border-radius: 4px;
                color: var(--text-secondary, #A0A9BA);
                padding: 4px 8px;
                font-size: 12px;
                cursor: pointer;
                margin-left: 8px;
                transition: all 0.2s ease;
            `;
    });

    // List styles
    const list = this.container.querySelector(
      ".notification-list",
    ) as HTMLElement;
    if (list) {
      list.style.cssText = `
                max-height: 400px;
                overflow-y: auto;
                padding: 8px 0;
            `;
    }

    // Individual notification styles
    const items = this.container.querySelectorAll(".notification-item");
    items.forEach((item) => {
      const itemEl = item as HTMLElement;
      itemEl.style.cssText = `
                display: flex;
                padding: 12px 20px;
                border-bottom: 1px solid var(--border-color, #2A3441);
                transition: background-color 0.2s ease;
                position: relative;
            `;

      if (item.classList.contains("unread")) {
        itemEl.style.backgroundColor = "var(--bg-tertiary, #0F1419)";
        itemEl.style.borderLeft = "3px solid var(--accent-info, #4A9EFF)";
      }
    });

    // No notifications message
    const noNotifications = this.container.querySelector(
      ".no-notifications",
    ) as HTMLElement;
    if (noNotifications) {
      noNotifications.style.cssText = `
                padding: 40px 20px;
                text-align: center;
                color: var(--text-secondary, #A0A9BA);
                font-style: italic;
            `;
    }
  }

  private setupNotificationEvents(): void {
    if (!this.container) return;

    // Mark all read
    const markAllReadBtn = this.container.querySelector(".mark-all-read");
    markAllReadBtn?.addEventListener("click", () => {
      this.markAllAsRead();
    });

    // Clear all
    const clearAllBtn = this.container.querySelector(".clear-all");
    clearAllBtn?.addEventListener("click", () => {
      this.clearAll();
    });

    // Individual notification actions
    const notificationItems =
      this.container.querySelectorAll(".notification-item");
    notificationItems.forEach((item) => {
      const id = item.getAttribute("data-notification-id");
      if (!id) return;

      // Mark as read on click
      item.addEventListener("click", (e) => {
        if (
          !(e.target as HTMLElement).matches("button, .notification-action")
        ) {
          this.markAsRead(id);
        }
      });

      // Close button
      const closeBtn = item.querySelector(".notification-close");
      closeBtn?.addEventListener("click", (e) => {
        e.stopPropagation();
        this.removeNotification(id);
      });

      // Action buttons
      const actionButtons = item.querySelectorAll(".notification-action");
      actionButtons.forEach((actionBtn) => {
        actionBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          const actionLabel = actionBtn.getAttribute("data-action");
          if (actionLabel) {
            const notification = this.notifications.get(id);
            const action = notification?.actions?.find(
              (a) => a.label === actionLabel,
            );
            if (action) {
              action.action();
              this.events.onNotificationAction?.(id, actionLabel);
            }
          }
        });
      });
    });
  }

  private updateUnreadCount(): void {
    this.unreadCount = Array.from(this.notifications.values()).filter(
      (n) => !n.read,
    ).length;
  }

  private generateId(): string {
    return `notification-${Date.now()}-${Math.random()
      .toString(36)
      .substr(2, 9)}`;
  }

  private getTypeIcon(type: Notification["type"]): string {
    switch (type) {
      case "success":
        return "✅";
      case "warning":
        return "⚠️";
      case "error":
        return "❌";
      case "info":
        return "ℹ️";
      default:
        return "📝";
    }
  }

  private formatTimeAgo(date: Date): string {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;

    return date.toLocaleDateString();
  }

  // Cleanup method
  public destroy(): void {
    if (this.container) {
      this.container.remove();
      this.container = undefined;
    }
    this.isVisible = false;
    this.notifications.clear();
    this.updateUnreadCount();
  }
}
