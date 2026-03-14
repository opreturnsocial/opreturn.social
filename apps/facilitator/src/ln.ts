import crypto from "node:crypto";
import { NWCClient } from "@getalby/sdk/nwc";

const NWC_URL = process.env.NWC_URL;
let _client: NWCClient | null = null;

function getClient(): NWCClient {
  if (!NWC_URL) throw new Error("NWC_URL is not configured in .env");
  if (!_client) {
    _client = new NWCClient({ nostrWalletConnectUrl: NWC_URL });
  }
  return _client;
}

export function generatePreimage(): { preimage: Buffer; paymentHash: Buffer } {
  const preimage = crypto.randomBytes(32);
  const paymentHash = crypto.createHash("sha256").update(preimage).digest();
  return { preimage, paymentHash };
}

export async function createHoldInvoice(
  paymentHashHex: string,
  amountSats: number,
  description: string,
  expirySecs: number
): Promise<string> {
  const c = getClient();
  const result = await c.makeHoldInvoice({
    amount: amountSats * 1000, // NWC uses millisats
    description,
    payment_hash: paymentHashHex,
    expiry: expirySecs,
  });
  return result.invoice;
}

// Returns the invoice state. State "accepted" means the HTLC is held (payer sent
// funds, awaiting facilitator settle/cancel).
export async function lookupInvoiceState(
  paymentHashHex: string
): Promise<"settled" | "pending" | "failed" | "accepted"> {
  const c = getClient();
  const result = await c.lookupInvoice({ payment_hash: paymentHashHex });
  return result.state;
}

export async function settleHoldInvoice(preimageHex: string): Promise<void> {
  const c = getClient();
  await c.settleHoldInvoice({ preimage: preimageHex });
}

export async function cancelHoldInvoice(paymentHashHex: string): Promise<void> {
  const c = getClient();
  await c.cancelHoldInvoice({ payment_hash: paymentHashHex });
}

export async function subscribeHoldInvoiceAccepted(
  onAccepted: (paymentHash: string) => void
): Promise<() => void> {
  const c = getClient();
  return c.subscribeNotifications((notification) => {
    if (notification.notification_type === "hold_invoice_accepted") {
      onAccepted(notification.notification.payment_hash);
    }
  }, ["hold_invoice_accepted"]);
}
