
import { DeribitBookSummary, DeribitOrderBook, DeribitCandleData } from "../types";

type SocketCallback = (data: any) => void;

class DeribitSocketService {
  private socket: WebSocket | null = null;
  private baseUrl = "wss://www.deribit.com/ws/api/v2";
  private subscriptions: Set<string> = new Set();
  private callbacks: Map<string, SocketCallback[]> = new Map();
  private requestCallbacks: Map<string, (data: any) => void> = new Map();
  private isConnected = false;
  private reconnectTimeout: any = null;

  constructor() {
    this.connect();
  }

  private connect() {
    if (typeof window === 'undefined' || !window.WebSocket) {
      console.warn("WebSocket not supported in this environment");
      return;
    }

    if (this.socket && (this.socket.readyState === WebSocket.CONNECTING || this.socket.readyState === WebSocket.OPEN)) {
      return;
    }

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.socket) {
      this.socket.onclose = null;
      this.socket.close();
    }

    this.socket = new WebSocket(this.baseUrl);

    this.socket.onopen = () => {
      this.isConnected = true;
      console.log("Deribit WebSocket Connected");
      this.resubscribe();
      
      // Setup heartbeat to keep connection alive
      this.send({
        jsonrpc: "2.0",
        id: 9999,
        method: "public/set_heartbeat",
        params: { interval: 30 }
      });
    };

    this.socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        // Respond to heartbeat
        if (data.method === "heartbeat") {
          this.send({
            jsonrpc: "2.0",
            id: 9999,
            method: "public/test",
            params: {}
          });
          return;
        }
        
        // Handle request responses
        if (data.id !== undefined) {
          const idStr = String(data.id);
          if (this.requestCallbacks.has(idStr)) {
            const cb = this.requestCallbacks.get(idStr);
            if (cb) {
              if (data.error) {
                console.error(`Deribit WS Error for id ${idStr}:`, data.error);
                cb(null); // Resolve with null so hybridFetch can fallback or handle it
              } else {
                cb(data.result);
              }
              this.requestCallbacks.delete(idStr);
            }
            return;
          }
        }

        // Handle subscriptions
        if (data.params && data.params.channel) {
          const channel = data.params.channel;
          const callbacks = this.callbacks.get(channel);
          if (callbacks) {
            callbacks.forEach((cb) => cb(data.params.data));
          }
        }
      } catch (err) {
        console.error("Error parsing WS message:", err, event.data);
      }
    };

    this.socket.onclose = () => {
      this.isConnected = false;
      this.reconnectTimeout = setTimeout(() => this.connect(), 5000);
    };

    this.socket.onerror = () => {
      console.warn("Deribit WebSocket Error (connection dropped)");
    };
  }

  private resubscribe() {
    if (this.subscriptions.size > 0 && this.isConnected) {
      const channels = Array.from(this.subscriptions);
      this.send({
        jsonrpc: "2.0",
        id: Date.now(),
        method: "public/subscribe",
        params: { channels },
      });
    }
  }

  private send(message: any) {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(message));
    }
  }

  public subscribe(channel: string, callback: SocketCallback) {
    if (!this.callbacks.has(channel)) {
      this.callbacks.set(channel, []);
    }
    this.callbacks.get(channel)?.push(callback);

    if (!this.subscriptions.has(channel)) {
      this.subscriptions.add(channel);
      if (this.isConnected) {
        this.send({
          jsonrpc: "2.0",
          id: Date.now(),
          method: "public/subscribe",
          params: { channels: [channel] },
        });
      }
    }
  }

  public unsubscribe(channel: string, callback: SocketCallback) {
    const callbacks = this.callbacks.get(channel);
    if (callbacks) {
      const index = callbacks.indexOf(callback);
      if (index !== -1) {
        callbacks.splice(index, 1);
      }
      if (callbacks.length === 0) {
        this.callbacks.delete(channel);
        this.subscriptions.delete(channel);
        if (this.isConnected) {
          this.send({
            jsonrpc: "2.0",
            id: Date.now(),
            method: "public/unsubscribe",
            params: { channels: [channel] },
          });
        }
      }
    }
  }

  private requestCounter = 0;

  public request(method: string, params: any): Promise<any> {
    return new Promise((resolve, reject) => {
      this.requestCounter = (this.requestCounter + 1) % 1000000;
      const id = String(this.requestCounter);
      this.requestCallbacks.set(id, resolve);
      
      // Universal timeout after 15s
      const timeoutId = setTimeout(() => {
        if (this.requestCallbacks.has(id)) {
          this.requestCallbacks.delete(id);
          reject(new Error(`WebSocket request timeout for ${method}`));
        }
      }, 15000);

      const originalResolve = resolve;
      this.requestCallbacks.set(id, (data: any) => {
        clearTimeout(timeoutId);
        originalResolve(data);
      });
      
      if (this.isConnected) {
        this.send({
          jsonrpc: "2.0",
          id,
          method,
          params,
        });
      } else {
        clearTimeout(timeoutId);
        this.requestCallbacks.delete(id);
        reject(new Error(`WebSocket not connected for ${method}`));
      }
    });
  }

  // Helper to get ticker data
  public subscribeTicker(instrument: string, callback: (ticker: any) => void) {
    this.subscribe(`ticker.${instrument}.raw`, callback);
  }

  // Helper to get book summary
  public subscribeBookSummary(currency: string, kind: string, callback: (summary: any) => void) {
    this.subscribe(`book.summary.${currency}.${kind}`, callback);
  }

  // Helper to get order book
  public subscribeOrderBook(instrument: string, callback: (book: any) => void) {
    this.subscribe(`book.${instrument}.none.10.100ms`, callback);
  }

  // Helper to get trades
  public subscribeTrades(instrument: string, callback: (trades: any[]) => void) {
    this.subscribe(`trades.${instrument}.100ms`, callback);
  }
}

export const deribitSocket = new DeribitSocketService();
