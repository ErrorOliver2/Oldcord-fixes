export enum RTCOpcode {
    IDENTIFY = 0,
    SELECT_PROTOCOL = 1,
    READY = 2,
    HEARTBEAT = 3,
    SESSION_DESCRIPTION = 4,
    SPEAKING = 5,
    HEARTBEAT_ACK = 6,
    RESUME = 7,
    HELLO = 8,
    INVALID_SESSION = 9,
    ICE_CANDIDATES = 10,
    CLIENT_CONNECT = 11,
    VIDEO = 12,
    DISCONNECT = 13
};

export interface RTCPacket<Op extends RTCOpcode, Data> {
  op: Op;
  d: Data;
}

export type RTCIdentify = RTCPacket<RTCOpcode.IDENTIFY, {
  server_id: string;
  user_id: string;
  session_id: string;
  token: string;
  video?: boolean;
}>;

export type RTCSelectProtocol = RTCPacket<RTCOpcode.SELECT_PROTOCOL, {
  protocol: 'udp' | 'webrtc' | 'webrtc-p2p';
  data?: string; // aka the SDP
  sdp?: string;
  codecs?: Array<{
    name: string;
    type: 'audio' | 'video';
    priority: number;
    payload_type: number;
  }>;
}>;

export type RTCSpeaking = RTCPacket<RTCOpcode.SPEAKING, {
  speaking: number | boolean;
  delay?: number;
  ssrc: number;
  user_id?: string;
}>;

export type RTCVideo = RTCPacket<RTCOpcode.VIDEO, {
  user_id?: string;
  audio_ssrc: number;
  video_ssrc: number;
  rtx_ssrc: number;
}>;

export type RTCHeartbeat = RTCPacket<RTCOpcode.HEARTBEAT, number>;

export type RTCHeartbeatAck = RTCPacket<RTCOpcode.HEARTBEAT_ACK, number>;

export type RTCHello = RTCPacket<RTCOpcode.HELLO, {
  heartbeat_interval: number;
}>;

export type AnyRTCPacket = 
  | RTCIdentify 
  | RTCSelectProtocol 
  | RTCSpeaking 
  | RTCVideo 
  | RTCPacket<RTCOpcode.HEARTBEAT, number>
  | RTCPacket<RTCOpcode.RESUME, { token: string; session_id: string; server_id: string }>;