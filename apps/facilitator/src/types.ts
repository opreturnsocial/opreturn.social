export interface PostRequest {
  content: string;
  pubkey: string;
  sig: string;
}

export interface PostResponse {
  ok: boolean;
  txid: string;
}
