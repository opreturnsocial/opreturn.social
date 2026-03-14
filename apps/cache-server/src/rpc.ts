const RPC_HOST = process.env.BITCOIN_RPC_HOST ?? "127.0.0.1";
const RPC_PORT = process.env.BITCOIN_RPC_PORT ?? "18443";
const RPC_USER = process.env.BITCOIN_RPC_USER ?? "polaruser";
const RPC_PASS = process.env.BITCOIN_RPC_PASS ?? "polarpass";

const RPC_URL = `http://${RPC_HOST}:${RPC_PORT}/`;

let reqId = 0;

export async function rpcCall<T>(method: string, params: unknown[] = []): Promise<T> {
  const id = ++reqId;
  const body = JSON.stringify({ jsonrpc: "1.0", id, method, params });

  const res = await fetch(RPC_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization:
        "Basic " + Buffer.from(`${RPC_USER}:${RPC_PASS}`).toString("base64"),
    },
    body,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`RPC HTTP error ${res.status}: ${text}`);
  }

  const json = (await res.json()) as { result: T; error: { message: string } | null };
  if (json.error) {
    throw new Error(`RPC error: ${json.error.message}`);
  }
  return json.result;
}

export async function getBlockCount(): Promise<number> {
  return rpcCall<number>("getblockcount");
}

export async function getBlockHash(height: number): Promise<string> {
  return rpcCall<string>("getblockhash", [height]);
}

export interface BlockTx {
  txid: string;
  vout: Array<{
    scriptPubKey: {
      asm: string;
      hex: string;
    };
  }>;
}

export interface Block {
  hash: string;
  height: number;
  time: number;
  tx: BlockTx[];
}

export async function getBlock(hash: string): Promise<Block> {
  return rpcCall<Block>("getblock", [hash, 2]);
}

export async function getMempoolEntry(txid: string): Promise<unknown> {
  return rpcCall<unknown>("getmempoolentry", [txid]);
}

export async function getRawTransaction(txid: string): Promise<{ confirmations?: number }> {
  return rpcCall<{ confirmations?: number }>("getrawtransaction", [txid, true]);
}
