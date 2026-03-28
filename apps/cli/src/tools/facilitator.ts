export interface FreePostResponse {
  txid: string;
}

async function postFree(facilitatorUrl: string, endpoint: string, body: object): Promise<FreePostResponse> {
  const res = await fetch(`${facilitatorUrl}/free${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({ error: `Facilitator error: ${res.status}` }))) as { error: string };
    throw new Error(err.error ?? `Facilitator error: ${res.status}`);
  }
  return res.json() as Promise<FreePostResponse>;
}

const PROTOCOL_VERSION = 1;

export async function submitPostFree(
  facilitatorUrl: string,
  params: { content: string; pubkey: string; sig: string },
): Promise<FreePostResponse> {
  return postFree(facilitatorUrl, "/post", { ...params, protocolVersion: PROTOCOL_VERSION });
}

export async function submitReplyFree(
  facilitatorUrl: string,
  params: { content: string; pubkey: string; sig: string; parentTxid: string },
): Promise<FreePostResponse> {
  return postFree(facilitatorUrl, "/reply", { ...params, protocolVersion: PROTOCOL_VERSION });
}

export async function submitRepostFree(
  facilitatorUrl: string,
  params: { pubkey: string; sig: string; referencedTxid: string },
): Promise<FreePostResponse> {
  return postFree(facilitatorUrl, "/repost", { ...params, protocolVersion: PROTOCOL_VERSION });
}

export async function submitQuoteRepostFree(
  facilitatorUrl: string,
  params: { content: string; pubkey: string; sig: string; referencedTxid: string },
): Promise<FreePostResponse> {
  return postFree(facilitatorUrl, "/quote-repost", { ...params, protocolVersion: PROTOCOL_VERSION });
}

export async function submitFollowFree(
  facilitatorUrl: string,
  params: { targetPubkey: string; isFollow: boolean; pubkey: string; sig: string },
): Promise<FreePostResponse> {
  return postFree(facilitatorUrl, "/follow", { ...params, protocolVersion: PROTOCOL_VERSION });
}

export async function submitProfileUpdateFree(
  facilitatorUrl: string,
  params: { propertyKind: number; value: string; pubkey: string; sig: string },
): Promise<FreePostResponse> {
  return postFree(facilitatorUrl, "/profile", { ...params, protocolVersion: PROTOCOL_VERSION });
}
