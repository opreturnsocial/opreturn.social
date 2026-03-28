import { getFeeBumpSatPerVByte, getFeePriority } from "../lib/fees";

export const FACILITATOR_BASE_URL = import.meta.env.VITE_FACILITATOR_URL ?? "http://localhost:3002";
const BASE_URL = FACILITATOR_BASE_URL;

export interface InvoiceResponse {
  invoice: string;
  paymentHash: string;
  feeSats: number;
  invoiceSats: number;
}

export interface FreePostResponse {
  txid: string;
}

async function postAndGetInvoice(endpoint: string, body: object): Promise<InvoiceResponse> {
  const res = await fetch(`${BASE_URL}${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = (await res.json()) as { error: string };
    throw new Error(err.error ?? `Facilitator error: ${res.status}`);
  }
  return res.json();
}

async function postFree(endpoint: string, body: object): Promise<FreePostResponse> {
  const res = await fetch(`${BASE_URL}/free${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = (await res.json()) as { error: string };
    throw new Error(err.error ?? `Facilitator error: ${res.status}`);
  }
  return res.json();
}

// --- Mainnet (paid) ---

export async function submitPost(content: string, pubkey: string, sig: string, protocolVersion: number): Promise<InvoiceResponse> {
  return postAndGetInvoice("/post", { content, pubkey, sig, protocolVersion, feeBumpSatPerVByte: getFeeBumpSatPerVByte(), feePriority: getFeePriority() });
}

export async function submitReply(content: string, pubkey: string, sig: string, parentTxid: string, protocolVersion: number): Promise<InvoiceResponse> {
  return postAndGetInvoice("/reply", { content, pubkey, sig, parentTxid, protocolVersion, feeBumpSatPerVByte: getFeeBumpSatPerVByte(), feePriority: getFeePriority() });
}

export async function submitRepost(pubkey: string, sig: string, referencedTxid: string, protocolVersion: number): Promise<InvoiceResponse> {
  return postAndGetInvoice("/repost", { pubkey, sig, referencedTxid, protocolVersion, feeBumpSatPerVByte: getFeeBumpSatPerVByte(), feePriority: getFeePriority() });
}

export async function submitQuoteRepost(content: string, pubkey: string, sig: string, referencedTxid: string, protocolVersion: number): Promise<InvoiceResponse> {
  return postAndGetInvoice("/quote-repost", { content, pubkey, sig, referencedTxid, protocolVersion, feeBumpSatPerVByte: getFeeBumpSatPerVByte(), feePriority: getFeePriority() });
}

export async function submitFollow(targetPubkey: string, isFollow: boolean, pubkey: string, sig: string, protocolVersion: number): Promise<InvoiceResponse> {
  return postAndGetInvoice("/follow", { targetPubkey, isFollow, pubkey, sig, protocolVersion, feeBumpSatPerVByte: getFeeBumpSatPerVByte(), feePriority: getFeePriority() });
}

export async function submitProfileUpdate(propertyKind: number, value: string, pubkey: string, sig: string, protocolVersion: number): Promise<InvoiceResponse> {
  return postAndGetInvoice("/profile", { propertyKind, value, pubkey, sig, protocolVersion, feeBumpSatPerVByte: getFeeBumpSatPerVByte(), feePriority: getFeePriority() });
}

export async function sponsorTransaction(testnetTxid: string, protocolVersion: number): Promise<InvoiceResponse> {
  return postAndGetInvoice("/sponsor", { testnetTxid, protocolVersion, feeBumpSatPerVByte: getFeeBumpSatPerVByte(), feePriority: getFeePriority() });
}

export async function getFacilitatorWalletBalance(): Promise<{ mainnetSatoshis: number; freeNetworkSatoshis: number }> {
  const res = await fetch(`${BASE_URL}/wallet-balance`);
  if (!res.ok) throw new Error(`Failed to fetch wallet balance`);
  return res.json() as Promise<{ mainnetSatoshis: number; freeNetworkSatoshis: number }>;
}

export async function getStatus(paymentHash: string): Promise<{ broadcast: boolean; txid: string | null }> {
  const res = await fetch(`${BASE_URL}/status/${paymentHash}`);
  if (!res.ok) {
    const err = (await res.json()) as { error: string };
    throw new Error(err.error ?? `Facilitator error: ${res.status}`);
  }
  return res.json();
}

// --- Free network (no Lightning required) ---

export async function submitPostFree(content: string, pubkey: string, sig: string, protocolVersion: number): Promise<FreePostResponse> {
  return postFree("/post", { content, pubkey, sig, protocolVersion });
}

export async function submitReplyFree(content: string, pubkey: string, sig: string, parentTxid: string, protocolVersion: number): Promise<FreePostResponse> {
  return postFree("/reply", { content, pubkey, sig, parentTxid, protocolVersion });
}

export async function submitRepostFree(pubkey: string, sig: string, referencedTxid: string, protocolVersion: number): Promise<FreePostResponse> {
  return postFree("/repost", { pubkey, sig, referencedTxid, protocolVersion });
}

export async function submitQuoteRepostFree(content: string, pubkey: string, sig: string, referencedTxid: string, protocolVersion: number): Promise<FreePostResponse> {
  return postFree("/quote-repost", { content, pubkey, sig, referencedTxid, protocolVersion });
}

export async function submitFollowFree(targetPubkey: string, isFollow: boolean, pubkey: string, sig: string, protocolVersion: number): Promise<FreePostResponse> {
  return postFree("/follow", { targetPubkey, isFollow, pubkey, sig, protocolVersion });
}

export async function submitProfileUpdateFree(propertyKind: number, value: string, pubkey: string, sig: string, protocolVersion: number): Promise<FreePostResponse> {
  return postFree("/profile", { propertyKind, value, pubkey, sig, protocolVersion });
}
