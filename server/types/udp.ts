export enum UdpPacketTypeByLength {
    MIN_LENGTH = 4,
    IP_DISCOVERY = 70,
    PING = 8,
    VOICE_DATA_THRESHOLD = 12
}

export enum UdpPacketType {
  Ping = 'ping',
  Voice = 'voice',
  Discovery = 'discovery',
  Unknown = 'unknown'
}

export interface UdpPingPacket {
  type: UdpPacketType.Ping;
  d: { timestamp: number };
  s: number;
}

export interface UdpVoicePacket {
  type: UdpPacketType.Voice;
  d: Buffer<ArrayBuffer>; // Decrypted data
  s: number; // SSRC
}

export interface UdpDiscoveryPacket {
  type: UdpPacketType.Discovery;
  d: { address: string; port: number };
  s: number; // SSRC
}

export type UdpPacket = UdpPingPacket | UdpVoicePacket | UdpDiscoveryPacket;