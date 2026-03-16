const RPC_HOST = process.env.BITCOIN_RPC_HOST ?? "127.0.0.1";
const RPC_PORT = process.env.BITCOIN_RPC_PORT ?? "18443";
const RPC_USER = process.env.BITCOIN_RPC_USER ?? "polaruser";
const RPC_PASS = process.env.BITCOIN_RPC_PASS ?? "polarpass";
const RPC_WALLET = process.env.BITCOIN_RPC_WALLET ?? "";

const RPC_URL = `http://${RPC_HOST}:${RPC_PORT}/`;
const RPC_WALLET_URL = RPC_WALLET
  ? `http://${RPC_HOST}:${RPC_PORT}/wallet/${RPC_WALLET}`
  : RPC_URL;

let reqId = 0;

async function rpcFetch<T>(url: string, method: string, params: unknown[] = []): Promise<T> {
  const id = ++reqId;
  const body = JSON.stringify({ jsonrpc: "1.0", id, method, params });

  const res = await fetch(url, {
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

export async function rpcCall<T>(method: string, params: unknown[] = []): Promise<T> {
  return rpcFetch<T>(RPC_URL, method, params);
}

async function rpcWalletCall<T>(method: string, params: unknown[] = []): Promise<T> {
  return rpcFetch<T>(RPC_WALLET_URL, method, params);
}

export async function createRawTransaction(
  inputs: [],
  outputs: { data: string }[]
): Promise<string> {
  return rpcCall<string>("createrawtransaction", [inputs, outputs]);
}

export async function fundRawTransactionWithRate(
  rawHex: string,
  feeRateBtcPerKb: number
): Promise<{ hex: string; fee: number; changepos: number }> {
  return rpcWalletCall<{ hex: string; fee: number; changepos: number }>(
    "fundrawtransaction",
    [rawHex, { feeRate: feeRateBtcPerKb }]
  );
}

export async function estimateSmartFee(blocks: number): Promise<{ feerate: number }> {
  return rpcCall<{ feerate: number }>("estimatesmartfee", [blocks]);
}

export async function signRawTransactionWithWallet(
  hex: string
): Promise<{ hex: string; complete: boolean }> {
  return rpcWalletCall<{ hex: string; complete: boolean }>(
    "signrawtransactionwithwallet",
    [hex]
  );
}

export async function sendRawTransaction(hex: string): Promise<string> {
  return rpcCall<string>("sendrawtransaction", [hex]);
}

export async function decodeRawTransaction(
  hex: string
): Promise<{ txid: string; vin: { txid: string; vout: number }[] }> {
  return rpcCall<{ txid: string; vin: { txid: string; vout: number }[] }>(
    "decoderawtransaction",
    [hex]
  );
}

export async function unlockInputs(
  inputs: { txid: string; vout: number }[]
): Promise<void> {
  await rpcWalletCall<boolean>("lockunspent", [true, inputs]);
}

export async function getWalletBalance(): Promise<number> {
  return rpcWalletCall<number>("getbalance");
}
