import { WebSocketServer } from 'ws';
import type { WebSocket } from "ws";

import { mrHandlers, OPCODES } from './handlers/mr.ts';
import { logText } from './helpers/logger.ts';
import { type GatewayPayload, GatewayPayloadSchema } from './types/gateway.ts';
import type { IncomingMessage } from 'node:http';
import { EventEmitter } from 'node:events';

const HEARTBEAT_INTERVAL = 41250;
const TIMEOUT_INTERVAL = 65000;

interface MediaServerNode {
  socket: WebSocket;
  port: number;
  public_ip: string;
  seen_at: number;
}

export interface MediaServer {
  ip: string;
  socket: WebSocket;
  port: number;
}

export class MediaRelayServer extends EventEmitter {
  private signalingServer: WebSocketServer | null = null;
  private debugLogs: boolean = false;
  public servers = new Map<string, MediaServerNode>();

  constructor() {
    super();
  }

  public debug(message: string) {
    if (this.debugLogs) {
      logText(message, 'MR_SIGNALING_SERVER');
    }
  }

  public getRandomMediaServer(): MediaServer | null {
    const nodes = Array.from(this.servers.values());

    if (nodes.length === 0) {
      return null;
    }

    const randomNode = nodes[Math.floor(Math.random() * nodes.length)];
    
    return {
      ip: randomNode.public_ip,
      socket: randomNode.socket,
      port: randomNode.port,
    };
  }

  private setupHeartbeat(socket: WebSocket) {
    const clear = () => {
      if (socket.hb?.timeout) {
        clearTimeout(socket.hb.timeout);
      }
    };

    const reset = () => {
      clear();

      if (socket.hb?.timeout) {
        socket.hb.timeout = setTimeout(() => {
          this.handleClientClose(socket, true);
        }, TIMEOUT_INTERVAL);
      }
    };

    return { reset, clear };
  }

  public handleClientConnect(socket: WebSocket, _req: IncomingMessage) {
    this.debug(`A new Media Server node is attempting to connect`);

    const hb = this.setupHeartbeat(socket);

    hb.reset();

    socket.send(JSON.stringify({
      op: OPCODES.HEARTBEAT_INFO,
      d: { heartbeat_interval: HEARTBEAT_INTERVAL },
    }));

    socket.on('message', (data) => this.handleClientMessage(socket, data, hb.reset));
    socket.on('close', () => this.handleClientClose(socket));
    socket.on('error', (err) => this.debug(`Node socket error: ${err.message}`));
  }

  private async handleClientMessage(socket: WebSocket, data: any, resetHb: () => void) {
    try {
      resetHb();
      const rawData = data.toString();
      const packet: GatewayPayload = GatewayPayloadSchema.parse(JSON.parse(rawData));

      this.debug(`Incoming Media server node OP -> ${packet.op}`);

      await mrHandlers[packet.op]?.(socket, packet as any);
    } catch (error) {
      logText(`MR Payload Error: ${error}`, 'error');

      socket.close(4000, 'Invalid payload');
    }
  }
  
  public handleClientClose(socket: WebSocket, timedOut = false) {
    if (timedOut) {
      this.debug(`!! A MEDIA SERVER HAS TIMED OUT - CHECK NODE AT ${socket.public_ip} !!`);

      socket.close(4009, 'Heartbeat timeout');
    }

    if (socket.hb?.timeout) {
      clearTimeout(socket.hb.timeout);
    }

    if (socket.public_ip) {
      this.debug(`Removing media server ${socket.public_ip} from pool.`);
      this.servers.delete(socket.public_ip);
      this.emit('node_disconnected', socket.public_ip);
    }
  }

  public registerNode(ip: string, port: number, socket: any) {
    socket.public_ip = ip;
    socket.port = port;

    this.servers.set(ip, { socket, port, public_ip: ip, seen_at: 0 });

    this.debug(`Media Server ${ip}:${port} is now active o7 and available for relay.`);
  }

  public start(server: any, debugLogs = false) {
    this.debugLogs = debugLogs;
    this.signalingServer = new WebSocketServer({ server });
    this.signalingServer.on('connection', (ws, req) => this.handleClientConnect(ws, req));

    this.debug(`Media Relay Signaling service started.`);
  }
}

export default new MediaRelayServer();