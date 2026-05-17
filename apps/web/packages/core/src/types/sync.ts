export interface SyncUpdate {
  collectionName: string;
  update: Uint8Array;
  origin: string | null;
}

export interface SyncState {
  synced: boolean;
  pendingUpdates: number;
  connectedPeers: number;
}

export interface AwarenessState {
  peerId: string;
  did: string;
  cursor?: { line: number; column: number };
  [key: string]: unknown;
}
