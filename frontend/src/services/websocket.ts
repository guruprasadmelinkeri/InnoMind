export type ConnectionStatus = 'CONNECTED' | 'RECONNECTING' | 'OFFLINE';

export interface WebSocketEventPayload<T = any> {
  event: string;
  data?: T;
  message?: string;
}

export type EventCallback<T = any> = (payload: WebSocketEventPayload<T>) => void;
export type StatusCallback = (status: ConnectionStatus) => void;

class WebSocketService {
  private ws: WebSocket | null = null;
  private status: ConnectionStatus = 'OFFLINE';
  private url: string;
  private listeners: Map<string, Set<EventCallback>> = new Map();
  private statusListeners: Set<StatusCallback> = new Set();

  private reconnectAttempts = 0;
  private reconnectTimer: number | null = null;
  private isExplicitlyClosed = false;

  constructor() {
    // Determine WS URL based on env or current window host
    const defaultWsUrl =
      window.location.protocol === 'https:'
        ? 'wss://localhost:8000/ws'
        : 'ws://localhost:8000/ws';

    this.url = import.meta.env.VITE_WS_URL || defaultWsUrl;
  }

  public connect() {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    this.isExplicitlyClosed = false;
    this.updateStatus('RECONNECTING');

    try {
      this.ws = new WebSocket(this.url);

      this.ws.onopen = () => {
        this.reconnectAttempts = 0;
        this.updateStatus('CONNECTED');
      };

      this.ws.onmessage = (event) => {
        try {
          const payload: WebSocketEventPayload = JSON.parse(event.data);
          this.emit(payload.event, payload);
        } catch (err) {
          console.warn('Failed to parse WebSocket JSON payload:', err);
        }
      };

      this.ws.onclose = () => {
        if (!this.isExplicitlyClosed) {
          this.scheduleReconnect();
        } else {
          this.updateStatus('OFFLINE');
        }
      };

      this.ws.onerror = () => {
        if (this.ws) {
          this.ws.close();
        }
      };
    } catch (err) {
      console.warn('WebSocket connection error:', err);
      this.scheduleReconnect();
    }
  }

  public disconnect() {
    this.isExplicitlyClosed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.updateStatus('OFFLINE');
  }

  private scheduleReconnect() {
    this.updateStatus('RECONNECTING');
    this.reconnectAttempts += 1;

    // Reconnect delays: 1s, 2s, 5s capped
    const delays = [1000, 2000, 5000];
    const delay = delays[Math.min(this.reconnectAttempts - 1, delays.length - 1)];

    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = window.setTimeout(() => {
      this.connect();
    }, delay);
  }

  private updateStatus(newStatus: ConnectionStatus) {
    if (this.status !== newStatus) {
      this.status = newStatus;
      this.statusListeners.forEach((cb) => cb(newStatus));
    }
  }

  public getStatus(): ConnectionStatus {
    return this.status;
  }

  public subscribe<T = any>(event: string, callback: EventCallback<T>) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback as EventCallback);

    // Auto-connect on first subscription if not connected
    if (this.status === 'OFFLINE' && !this.isExplicitlyClosed) {
      this.connect();
    }
  }

  public unsubscribe<T = any>(event: string, callback: EventCallback<T>) {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      callbacks.delete(callback as EventCallback);
      if (callbacks.size === 0) {
        this.listeners.delete(event);
      }
    }
  }

  public subscribeStatus(callback: StatusCallback) {
    this.statusListeners.add(callback);
    callback(this.status);

    if (this.status === 'OFFLINE' && !this.isExplicitlyClosed) {
      this.connect();
    }
  }

  public unsubscribeStatus(callback: StatusCallback) {
    this.statusListeners.delete(callback);
  }

  private emit(event: string, payload: WebSocketEventPayload) {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      callbacks.forEach((cb) => {
        try {
          cb(payload);
        } catch (err) {
          console.error(`Error in WebSocket subscriber for event '${event}':`, err);
        }
      });
    }
  }
}

export const wsService = new WebSocketService();
