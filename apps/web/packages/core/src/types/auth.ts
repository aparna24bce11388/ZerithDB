/** Base58-encoded Ed25519 public key */
export type PublicKey = string;

/** Raw signature bytes as a hex string */
export type Signature = string;

/**
 * A ZerithDB identity — a keypair derived DID.
 * The `did` field is the W3C DID Key (`did:key:z6Mk...`).
 */
export interface Identity {
  /** W3C DID Key identifier — e.g. `did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK` */
  did: string;
  publicKey: PublicKey;
  /** Created at Unix timestamp (ms) */
  createdAt: number;
}
