function makeRpcClient(config: {
  host: string;
  port: string;
  user: string;
  pass: string;
}) {
  const { host, port, user, pass } = config;
  const url = `http://${host}:${port}/`;

  let reqId = 0;

  async function rpcCall<T>(
    method: string,
    params: unknown[] = [],
  ): Promise<T> {
    const id = ++reqId;
    const body = JSON.stringify({ jsonrpc: "1.0", id, method, params });
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization:
          "Basic " + Buffer.from(`${user}:${pass}`).toString("base64"),
      },
      body,
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`RPC HTTP error ${res.status}: ${text}`);
    }
    const json = (await res.json()) as {
      result: T;
      error: { message: string } | null;
    };
    if (json.error) throw new Error(`RPC error: ${json.error.message}`);
    return json.result;
  }

  return {
    getBlockCount: () => rpcCall<number>("getblockcount"),
    getBlockHash: (height: number) => rpcCall<string>("getblockhash", [height]),
    getBlock: (hash: string) => rpcCall<Block>("getblock", [hash, 2]),
    getMempoolEntry: (txid: string) =>
      rpcCall<unknown>("getmempoolentry", [txid]),
    getRawTransaction: (txid: string) =>
      rpcCall<{ confirmations?: number }>("getrawtransaction", [txid, true]),
  };
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

export type RpcClient = ReturnType<typeof makeRpcClient>;

export const mainnetRpc = makeRpcClient({
  host: process.env.BITCOIN_RPC_HOST ?? "127.0.0.1",
  port: process.env.BITCOIN_RPC_PORT ?? "18443",
  user: process.env.BITCOIN_RPC_USER ?? "polaruser",
  pass: process.env.BITCOIN_RPC_PASS ?? "polarpass",
});

export const testnet4Rpc = makeRpcClient({
  host: process.env.TESTNET4_BITCOIN_RPC_HOST ?? "127.0.0.1",
  port: process.env.TESTNET4_BITCOIN_RPC_PORT ?? "18444",
  user: process.env.TESTNET4_BITCOIN_RPC_USER ?? "polaruser",
  pass: process.env.TESTNET4_BITCOIN_RPC_PASS ?? "polarpass",
});

// Re-export mainnet functions for backward compat
export const getBlockCount = mainnetRpc.getBlockCount.bind(mainnetRpc);
export const getBlockHash = mainnetRpc.getBlockHash.bind(mainnetRpc);
export const getBlock = mainnetRpc.getBlock.bind(mainnetRpc);
export const getMempoolEntry = mainnetRpc.getMempoolEntry.bind(mainnetRpc);
export const getRawTransaction = mainnetRpc.getRawTransaction.bind(mainnetRpc);
