
export interface Participant {
    user_id: string;
    ssrc: number | string; //String or number?? Shouldnt it be number??
};

export interface Room {
    participants: Participant[],
    room_id: string;
};

export interface MediaCodec {
    kind: 'audio' | 'video';
    mimeType: string;
    clockRate: number;
    channels?: number;
    parameters?: {
        minptime: number;
        useinbandfec: number;
        usedtx: number
    };
    rtcpFeedback?: {
        type: string,
        parameter?: string
    }[];
    preferredPayloadType: number;
};

export interface VoiceState {
    user_id: string;
    session_id: string;
    guild_id: string | null;
    channel_id: string | null;
    mute: boolean;
    deaf: boolean;
    self_deaf: boolean;
    self_mute: boolean;
    self_video: boolean;
    suppress: boolean;
};