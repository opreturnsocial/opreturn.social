export interface StoredPost {
  txid: string;
  blockHeight: number;
  timestamp: number;
  content: string;
  kind: number;
  pubkey: string;
  sig: string;
  parentTxid?: string | null;
  status: string;
}

export interface StoredProfile {
  pubkey: string;
  name?: string | null;
  bio?: string | null;
  avatarUrl?: string | null;
  status?: string | null;
}
