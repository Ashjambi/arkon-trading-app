declare module 'ws' {
  import { Server as HttpServer } from 'http';
  import { EventEmitter } from 'events';

  export class WebSocketServer extends EventEmitter {
    constructor(options?: { port?: number; host?: string; server?: HttpServer; path?: string });
    on(event: 'connection', listener: (ws: WebSocket, req: any) => void): this;
    on(event: string, listener: (...args: any[]) => void): this;
  }

  export class WebSocket extends EventEmitter {
    static OPEN: number;
    static CLOSING: number;
    static CLOSED: number;
    static CONNECTING: number;

    readyState: number;
    url: string;

    constructor(address: string | URL);
    send(data: any, cb?: (err?: Error) => void): void;
    close(code?: number, reason?: string): void;
    on(event: 'message', listener: (data: Buffer) => void): this;
    on(event: 'open', listener: () => void): this;
    on(event: 'close', listener: (code: number, reason: string) => void): this;
    on(event: 'error', listener: (err: Error) => void): this;
    on(event: string, listener: (...args: any[]) => void): this;
    terminate(): void;
  }

  export default WebSocket;
}

