import { NWCClient } from "@getalby/sdk/nwc";
import { getStatus } from "../api/facilitator";

// Pay a Lightning invoice using NWC (from localStorage) or window.webln as fallback.
export async function payInvoice(invoice: string): Promise<void> {
  const nwcUrl = localStorage.getItem("ors_nwc_url");

  if (nwcUrl) {
    const client = new NWCClient({ nostrWalletConnectUrl: nwcUrl });
    try {
      await client.payInvoice({ invoice });
      return;
    } finally {
      client.close();
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const webln = (window as any).webln;
  if (webln) {
    await webln.enable();
    await webln.sendPayment(invoice);
    return;
  }

  throw new Error("No wallet connected. Please connect a wallet in Settings.");
}

// Full pay-and-broadcast flow: pay the invoice (blocks until facilitator settles),
// then poll /status until broadcast === true.
export async function payAndBroadcast(
  invoice: string,
  paymentHash: string
): Promise<{ txid: string }> {
  await payInvoice(invoice);

  // Poll for broadcast confirmation (max ~30s)
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const status = await getStatus(paymentHash);
    if (status.broadcast && status.txid) {
      return { txid: status.txid };
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  throw new Error("Timed out waiting for broadcast confirmation");
}
