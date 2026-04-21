import udp from 'dgram';
import sodium from 'libsodium-wrappers';
import { logText } from './helpers/logger.ts';
import { UdpPacketType, UdpPacketTypeByLength, type UdpDiscoveryPacket, type UdpPacket, type UdpVoicePacket } from './types/udp.ts';
import { EventEmitter } from 'node:events';

const DEFAULT_ENCRYPTION_MODE = "xsalsa20_poly1305";
const DEFAULT_ENCRYPTION_KEY = [
  211, 214, 237, 8, 221, 92, 86, 132, 167, 57, 17, 71, 189, 169, 224, 211, 115, 17, 191,
  82, 96, 98, 107, 155, 92, 72, 52, 246, 52, 109, 142, 194,
];

export class UdpServer extends EventEmitter {
  private socket: udp.Socket;
  private debugLogs: boolean = false;

  public clients = new Map();
  public encryptionsMap = new Map();

  constructor() {
    super();

    this.socket = udp.createSocket('udp4');
    this.setupListeners();
  }

  private debug(message: string) {
    if (this.debugLogs) {
      logText(message, 'UDP_SERVER');
    }
  }

  private setupListeners() {
    this.socket.on('listening', () => {
      const addr = this.socket.address();

      this.debug(`Ready on ${addr.address}:${addr.port}`);
    });

    this.socket.on('error', (err) => {
      this.debug(`Server error: ${err.stack}`);

      this.socket.close();
    });

    this.socket.on('message', (msg, info) => this.handleIncoming(msg, info));
  }

  private ensureSession(ssrc: number, info: udp.RemoteInfo) {
    let session = this.clients.get(ssrc);

    if (!session) {
      let encryption = this.encryptionsMap.get(ssrc);

      encryption ??= {
        mode: DEFAULT_ENCRYPTION_MODE,
        key: DEFAULT_ENCRYPTION_KEY,
      };

      const sesh = {
        ip_addr: info.address,
        ip_port: info.port,
        encryption_mode: encryption.mode,
        encryption_key: encryption.key,
      };

      this.clients.set(ssrc, sesh);
    }
  }

  public parseUdpPacket(msg: Buffer<ArrayBuffer>, info: udp.RemoteInfo): UdpPacket | null {
    if (msg.length < UdpPacketTypeByLength.MIN_LENGTH) {
      this.debug(`Message length check failed, packet had no ssrc.`);

      return null;
    }

    const ssrc = msg.readUInt32BE(0);

    if (msg.length === UdpPacketTypeByLength.IP_DISCOVERY) {
      return {
        type: UdpPacketType.Discovery,
        s: ssrc,
        d: {
          address: info.address,
          port: info.port
        }
      };
    } else if (msg.length === UdpPacketTypeByLength.PING) {
      return {
        type: UdpPacketType.Ping,
        s: ssrc,
        d: {
          timestamp: Date.now()
        }
      }
    } else if (msg.length > UdpPacketTypeByLength.VOICE_DATA_THRESHOLD) {
      return {
        type: UdpPacketType.Voice,
        s: ssrc,
        d: msg
      }
    }

    return null;
  }

  private handleIncoming(msg: Buffer<ArrayBuffer>, info: udp.RemoteInfo) {
    const packet = this.parseUdpPacket(msg, info);

    if (!packet) {
      return;
    }

    this.ensureSession(packet.s, info);

    switch (packet.type) {
      case UdpPacketType.Ping:
        this.sendBytes(info.address, info.port, msg);

        break;
      case UdpPacketType.Discovery:
        this.handleDiscovery(packet, info);

        break;
      case UdpPacketType.Voice:
        this.handleVoiceData(packet);

        break;
    }
  }

  private handleVoiceData(packet: UdpVoicePacket) {
    try {
      const ssrc = packet.s;
      const session = this.clients.get(ssrc);

      if (!session) {
        this.debug(`Received voice data for unknown SSRC: ${String(ssrc)}`);

        return;
      }

      let msg = packet.d;

      const voiceKey = Buffer.from(session.encryption_key);
      const nonce = Buffer.alloc(24).fill(0);

      msg.subarray(0, 12).copy(nonce, 0);

      const encryptedPayload = msg.subarray(12);
      const decryptedOpusData = sodium.crypto_secretbox_open_easy(
        encryptedPayload,
        nonce,
        voiceKey,
      );

      if (!decryptedOpusData) {
        this.debug(`Failed to decrypt voice packet from SSRC: ${String(ssrc)}`);

        return;
      }

      for (const [otherSsrc, otherSession] of this.clients) {
        if (otherSsrc !== ssrc) {
          const otherKey = Buffer.from(otherSession.encryption_key);
          const reEncryptionNonce = Buffer.alloc(24).fill(0);

          msg.subarray(0, 12).copy(reEncryptionNonce, 0);

          const reEncryptedPayload = sodium.crypto_secretbox_easy(
            decryptedOpusData,
            reEncryptionNonce,
            otherKey,
          );

          const reEncryptedPacket = Buffer.concat([
            msg.subarray(0, 12),
            typeof reEncryptedPayload === 'string'
              ? Buffer.from(reEncryptedPayload, 'utf8')
              : Buffer.from(reEncryptedPayload),
          ]);

          this.sendBytes(otherSession.ip_addr, otherSession.ip_port, reEncryptedPacket);
          this.emit('speaking', { ssrc, speaking: true, delay: 0 }); //we need to then loop through rtc server clients and dispatch op speaking to them with tehse properties
          /*
          udpServer.on('speaking', (data) => {
  rtcServer.broadcast({
    op: OPCODES.SPEAKING,
    d: {
      ssrc: data.ssrc,
      speaking: data.speaking,
      delay: 0,
    },
  });
});
*/
        }
      }
    }
    catch (error) {
      this.debug(`Failed to handle voice data for client`);

      console.error(error);
    }
  }

  private handleDiscovery(packet: UdpDiscoveryPacket, info: udp.RemoteInfo) {
    const response = Buffer.alloc(70);

    response.writeUInt32LE(packet.s, 0);
    response.write(info.address, 4, 'utf8');
    response.writeUInt16LE(info.port, 68);

    this.sendBytes(info.address, info.port, response);
  }

  public sendBytes(address: string, port: number, bytes: Buffer) {
    this.socket.send(bytes, port, address, (err) => {
      if (err) {
        this.debug(`Failed to send UDP packet response -> ${err.message}`);
      }
    });
  }

  public async start(port: number, debugLogs = false) {
    await sodium.ready;

    this.debugLogs = debugLogs;
    this.socket.bind(port);
  }
}

export default new UdpServer();