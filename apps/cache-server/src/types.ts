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

export interface StoredActivityItem {
  type: "follow" | "unfollow" | "profile_update";
  txid: string;
  pubkey: string;
  timestamp: number;
  blockHeight: number;
  status: string;
  targetPubkey?: string;
  propertyKind?: number;
  value?: string;
  replyCount: number;
  repostCount: number;
}
