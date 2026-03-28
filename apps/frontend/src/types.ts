export interface Post {
  txid: string;
  network?: string;
  blockHeight: number;
  timestamp: number;
  content: string;
  kind: number;
  pubkey: string;
  sig: string;
  parentTxid?: string | null;
  status: string;
  replyCount?: number;
  repostCount?: number;
}

export interface Profile {
  pubkey: string;
  name?: string | null;
  bio?: string | null;
  avatarUrl?: string | null;
  bot?: boolean | null;
  status?: string;
}

export interface ActivityItem {
  type: "follow" | "unfollow" | "profile_update";
  txid: string;
  network?: string;
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

export type FeedItem =
  | ({ feedType: "post" } & Post)
  | ({ feedType: "activity" } & ActivityItem);

// Alby Extension Nostr API (window.nostr)
declare global {
  interface Window {
    nostr?: {
      getPublicKey(): Promise<string>;
      signSchnorr(msgHex: string): Promise<string>;
      hashAndSignSchnorr?(msg: string): Promise<string>;
    };
  }
}
