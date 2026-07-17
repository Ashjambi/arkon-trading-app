type MessageHandler = (data: any) => void;

class BinanceSocketService {
  private ws: WebSocket | null = null;
  private baseUrl = "wss://stream.binance.com:9443/stream";
  private handlers: Map<string, Set<MessageHandler>> = new Map();
  private reconnectTimer: any = null;
  private connectionAttempts = 0;

  constructor() {
    this.connect();
  }

  private connect() {
    if (this.ws && (this.ws.readyState === WebSocket.CONNECTING || this.ws.readyState === WebSocket.OPEN)) {
      return;
    }

    this.ws = new WebSocket(this.baseUrl);

    this.ws.onopen = () => {
      this.connectionAttempts = 0;
      console.log("🟢 Binance WebSocket Connected");
      this.resubscribe();
    };

    this.ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (!payload.stream || !payload.data) return;

        const streamName = payload.stream;
        const data = payload.data;

        if (streamName.endsWith('@ticker')) {
            const symbol = data.s;
            this.notifyHandlers(`ticker.${symbol}`, data);
        } else if (streamName.includes('@depth')) {
            const symbol = streamName.split('@')[0].toUpperCase();
            this.notifyHandlers(`depth.${symbol}`, data);
        }
      } catch (e) {
        // Silently catch parse errors to avoid console spam
      }
    };

    this.ws.onclose = () => {
      this.scheduleReconnect();
    };

    this.ws.onerror = () => {
      // Suppress raw event object from console
      console.warn(`Binance WS Error (Attempt ${this.connectionAttempts})`);
      this.ws?.close();
    };
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.connectionAttempts++;
    const delay = Math.min(5000 * this.connectionAttempts, 30000); // Backoff up to 30s
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }

  private resubscribe() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    const streams = Array.from(this.handlers.keys()).map(k => {
        const parts = k.split('.');
        const symbol = parts[1];
        if (!symbol) return '';
        
        if (k.startsWith('ticker.')) return `${symbol.toLowerCase()}@ticker`;
        if (k.startsWith('depth.')) return `${symbol.toLowerCase()}@depth20@100ms`;
        return '';
    }).filter(s => s !== '');

    console.log(`[BinanceSocket] Resubscribing to streams:`, streams);
    if (streams.length > 0) {
        this.ws.send(JSON.stringify({
            method: "SUBSCRIBE",
            params: streams,
            id: Date.now()
        }));
    }
  }

  public subscribeTicker(symbol: string, handler: MessageHandler) {
    const key = `ticker.${symbol}`;
    if (!this.handlers.has(key)) this.handlers.set(key, new Set());
    this.handlers.get(key)!.add(handler);
    this.resubscribe();
  }

  public subscribeDepth(symbol: string, handler: MessageHandler) {
    const key = `depth.${symbol}`;
    if (!this.handlers.has(key)) this.handlers.set(key, new Set());
    this.handlers.get(key)!.add(handler);
    this.resubscribe();
  }

  public unsubscribe(key: string, handler: MessageHandler) {
    // Unsubscribe key already uses mapped symbol from App.tsx
    if (this.handlers.has(key)) {
      this.handlers.get(key)!.delete(handler);
      if (this.handlers.get(key)!.size === 0) {
        this.handlers.delete(key);
        // Could send UNSUBSCRIBE here if needed to optimize bandwidth
      }
    }
  }

  private notifyHandlers(key: string, data: any) {
    if (this.handlers.has(key)) {
      this.handlers.get(key)!.forEach(handler => handler(data));
    }
  }
}

export const binanceSocket = new BinanceSocketService();
