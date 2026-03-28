function makeRpcClient(config: {
  host: string;
  port: string;
  user: string;
  pass: string;
  wallet: string;
}) {
  const { host, port, user, pass, wallet } = config;
  const baseUrl = `http://${host}:${port}/`;
  const walletUrl = wallet
    ? `http://${host}:${port}/wallet/${wallet}`
    : baseUrl;

  let reqId = 0;

  async function rpcFetch<T>(
    url: string,
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
    call: <T>(method: string, params: unknown[] = []) =>
      rpcFetch<T>(baseUrl, method, params),
    walletCall: <T>(method: string, params: unknown[] = []) =>
      rpcFetch<T>(walletUrl, method, params),

    createRawTransaction: (inputs: [], outputs: { data: string }[]) =>
      rpcFetch<string>(baseUrl, "createrawtransaction", [inputs, outputs]),

    fundRawTransactionWithRate: (rawHex: string, feeRateBtcPerKb: number) =>
      rpcFetch<{ hex: string; fee: number; changepos: number }>(
        walletUrl,
        "fundrawtransaction",
        [rawHex, { feeRate: feeRateBtcPerKb }],
      ),

    estimateSmartFee: (blocks: number) =>
      rpcFetch<{ feerate: number }>(baseUrl, "estimatesmartfee", [blocks]),

    signRawTransactionWithWallet: (hex: string) =>
      rpcFetch<{ hex: string; complete: boolean }>(
        walletUrl,
        "signrawtransactionwithwallet",
        [hex],
      ),

    sendRawTransaction: (hex: string) =>
      rpcFetch<string>(baseUrl, "sendrawtransaction", [hex]),

    decodeRawTransaction: (hex: string) =>
      rpcFetch<{ txid: string; vin: { txid: string; vout: number }[] }>(
        baseUrl,
        "decoderawtransaction",
        [hex],
      ),

    unlockInputs: async (inputs: { txid: string; vout: number }[]) => {
      await rpcFetch<boolean>(walletUrl, "lockunspent", [true, inputs]);
    },

    getWalletBalance: () => rpcFetch<number>(walletUrl, "getbalance"),

    getRawTransactionVerbose: (txid: string) =>
      rpcFetch<{ vout: Array<{ scriptPubKey: { type: string; asm: string } }> }>(
        baseUrl,
        "getrawtransaction",
        [txid, true],
      ),
  };
}

export const mainnetRpc = makeRpcClient({
  host: process.env.BITCOIN_RPC_HOST ?? "127.0.0.1",
  port: process.env.BITCOIN_RPC_PORT ?? "18443",
  user: process.env.BITCOIN_RPC_USER ?? "polaruser",
  pass: process.env.BITCOIN_RPC_PASS ?? "polarpass",
  wallet: process.env.BITCOIN_RPC_WALLET ?? "",
});

export const freeNetworkRpc = makeRpcClient({
  host: process.env.FREE_NETWORK_BITCOIN_RPC_HOST ?? "127.0.0.1",
  port: process.env.FREE_NETWORK_BITCOIN_RPC_PORT ?? "18444",
  user: process.env.FREE_NETWORK_BITCOIN_RPC_USER ?? "polaruser",
  pass: process.env.FREE_NETWORK_BITCOIN_RPC_PASS ?? "polarpass",
  wallet: process.env.FREE_NETWORK_BITCOIN_RPC_WALLET ?? "",
});

export type RpcClient = ReturnType<typeof makeRpcClient>;

export function getRpc(network: string): RpcClient {
  return network === "mainnet" ? mainnetRpc : freeNetworkRpc;
}

// Re-export mainnet functions for backward compat with existing broadcast code
export const createRawTransaction =
  mainnetRpc.createRawTransaction.bind(mainnetRpc);
export const fundRawTransactionWithRate =
  mainnetRpc.fundRawTransactionWithRate.bind(mainnetRpc);
export const estimateSmartFee = mainnetRpc.estimateSmartFee.bind(mainnetRpc);
export const signRawTransactionWithWallet =
  mainnetRpc.signRawTransactionWithWallet.bind(mainnetRpc);
export const sendRawTransaction =
  mainnetRpc.sendRawTransaction.bind(mainnetRpc);
export const decodeRawTransaction =
  mainnetRpc.decodeRawTransaction.bind(mainnetRpc);
export const unlockInputs = mainnetRpc.unlockInputs.bind(mainnetRpc);
export const getWalletBalance = mainnetRpc.getWalletBalance.bind(mainnetRpc);
