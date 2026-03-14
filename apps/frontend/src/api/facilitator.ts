import { getFeeBumpSatPerVByte } from "../lib/fees";

export const FACILITATOR_BASE_URL = import.meta.env.VITE_FACILITATOR_URL ?? "http://localhost:3002";
const BASE_URL = FACILITATOR_BASE_URL;

export interface InvoiceResponse {
  invoice: string;
  paymentHash: string;
  feeSats: number;
  invoiceSats: number;
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

export async function submitPost(
  content: string,
  pubkey: string,
  sig: string,
  protocolVersion: number
): Promise<InvoiceResponse> {
  return postAndGetInvoice("/post", { content, pubkey, sig, protocolVersion, feeBumpSatPerVByte: getFeeBumpSatPerVByte() });
}

export async function submitReply(
  content: string,
  pubkey: string,
  sig: string,
  parentTxid: string,
  protocolVersion: number
): Promise<InvoiceResponse> {
  return postAndGetInvoice("/reply", { content, pubkey, sig, parentTxid, protocolVersion, feeBumpSatPerVByte: getFeeBumpSatPerVByte() });
}

export async function submitRepost(
  pubkey: string,
  sig: string,
  referencedTxid: string,
  protocolVersion: number
): Promise<InvoiceResponse> {
  return postAndGetInvoice("/repost", { pubkey, sig, referencedTxid, protocolVersion, feeBumpSatPerVByte: getFeeBumpSatPerVByte() });
}

export async function submitQuoteRepost(
  content: string,
  pubkey: string,
  sig: string,
  referencedTxid: string,
  protocolVersion: number
): Promise<InvoiceResponse> {
  return postAndGetInvoice("/quote-repost", { content, pubkey, sig, referencedTxid, protocolVersion, feeBumpSatPerVByte: getFeeBumpSatPerVByte() });
}

export async function submitFollow(
  targetPubkey: string,
  isFollow: boolean,
  pubkey: string,
  sig: string,
  protocolVersion: number
): Promise<InvoiceResponse> {
  return postAndGetInvoice("/follow", { targetPubkey, isFollow, pubkey, sig, protocolVersion, feeBumpSatPerVByte: getFeeBumpSatPerVByte() });
}

export async function submitProfileUpdate(
  propertyKind: number,
  value: string,
  pubkey: string,
  sig: string,
  protocolVersion: number
): Promise<InvoiceResponse> {
  return postAndGetInvoice("/profile", { propertyKind, value, pubkey, sig, protocolVersion, feeBumpSatPerVByte: getFeeBumpSatPerVByte() });
}

export async function getStatus(paymentHash: string): Promise<{ broadcast: boolean; txid: string | null }> {
  const res = await fetch(`${BASE_URL}/status/${paymentHash}`);
  if (!res.ok) {
    const err = (await res.json()) as { error: string };
    throw new Error(err.error ?? `Facilitator error: ${res.status}`);
  }
  return res.json();
}
