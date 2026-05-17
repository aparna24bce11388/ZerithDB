/** UUID v4 peer identifier — assigned on connection */
export type PeerId = string;

/** Room identifier = `appId:collectionName` */
export type RoomId = string;

export interface PeerInfo {
  peerId: PeerId;
  did: string;
  publicKey: string;
  connectedAt: number;
}

export interface NetworkMessage {
  type: "sync-update" | "awareness" | "ping" | "pong";
  from: PeerId;
  payload: Uint8Array | string;
  signature?: string;
}
