import { useState } from "react";
import { toast } from "sonner";
import { BoxIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { NWCClient } from "@getalby/sdk/nwc";
import {
  submitPost,
  submitReply,
  submitRepost,
  submitQuoteRepost,
  submitFollow,
  submitProfileUpdate,
} from "../api/facilitator";
import { payAndBroadcast } from "../lib/payment";
import { useNetworkStats } from "../hooks/useNetworkStats";
import {
  buildUnsignedPayload,
  buildReplyUnsignedPayload,
  buildRepostUnsignedPayload,
  buildQuoteRepostUnsignedPayload,
  buildFollowUnsignedPayload,
  buildProfileUpdateUnsignedPayload,
  buildV1SigningBody,
  getProtocolVersion,
  estimatedVBytes,
} from "../lib/ors";
import { getFeeBumpSatPerVByte, getFeePriority } from "../lib/fees";
import { signPayload } from "../lib/signing";

type ActionType = "post" | "reply" | "repost" | "quote-repost" | "follow" | "profile";

interface MakePermanentButtonProps {
  actionType: ActionType;
  pubkey: string;
  content?: string;
  parentTxid?: string;
  repostTxid?: string;
  followPubkey?: string;
  followIsFollow?: boolean;
  propertyKind?: number;
  disabled?: boolean;
  disabledReason?: string;
  onSuccess: () => void;
}

function feeEstimate(
  actionType: ActionType,
  content: string | undefined,
  repostTxid: string | undefined,
  followPubkey: string | undefined,
  propertyKind: number | undefined,
  feeRateHigh: number | null,
  feeRateMedium: number | null,
  feeMarkupPercent: number,
  btcPriceUsd: number | null,
): { sats: number; usd: string | null } | null {
  const priority = getFeePriority();
  const baseRate = priority === "high" ? feeRateHigh : feeRateMedium;
  if (baseRate === null) return null;

  let kindDataBytes: number;
  switch (actionType) {
    case "post":
      kindDataBytes = new TextEncoder().encode(content ?? "").length;
      break;
    case "reply":
      kindDataBytes = 32 + new TextEncoder().encode(content ?? "").length;
      break;
    case "repost":
      kindDataBytes = 32;
      break;
    case "quote-repost":
      kindDataBytes = 32 + new TextEncoder().encode(content ?? "").length;
      break;
    case "follow":
      kindDataBytes = 33;
      break;
    case "profile":
      kindDataBytes = 1 + new TextEncoder().encode(content ?? "").length;
      break;
  }
  void repostTxid; void followPubkey; void propertyKind;

  const version = getProtocolVersion();
  const vBytes = estimatedVBytes(kindDataBytes, version);
  const effectiveFeeRate = baseRate + getFeeBumpSatPerVByte();
  const sats = Math.ceil(vBytes * effectiveFeeRate * (1 + feeMarkupPercent / 100));
  const usd = btcPriceUsd !== null ? ((sats * btcPriceUsd) / 1e8).toFixed(2) : null;
  return { sats, usd };
}

export function MakePermanentButton({
  actionType,
  pubkey,
  content,
  parentTxid,
  repostTxid,
  followPubkey,
  followIsFollow,
  propertyKind,
  disabled,
  disabledReason,
  onSuccess,
}: MakePermanentButtonProps) {
  const [open, setOpen] = useState(false);
  const [hasWallet, setHasWallet] = useState(
    () => !!(localStorage.getItem("ors_nwc_url") || (window as any).webln)
  );
  const [nwcUrl, setNwcUrl] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [paying, setPaying] = useState(false);
  const { feeRateHigh, feeRateMedium, feeMarkupPercent, btcPriceUsd } = useNetworkStats();

  const fee = feeEstimate(
    actionType, content, repostTxid, followPubkey, propertyKind,
    feeRateHigh, feeRateMedium, feeMarkupPercent, btcPriceUsd,
  );

  async function handleConnect() {
    if (!nwcUrl.trim()) return;
    setConnecting(true);
    try {
      const client = new NWCClient({ nostrWalletConnectUrl: nwcUrl.trim() });
      await client.getBalance();
      localStorage.setItem("ors_nwc_url", nwcUrl.trim());
      setHasWallet(true);
      setNwcUrl("");
    } catch {
      toast.error("Could not connect to wallet - check your NWC URL");
    } finally {
      setConnecting(false);
    }
  }

  async function handlePay() {
    setPaying(true);
    try {
      const version = getProtocolVersion();

      let v0Unsigned: Uint8Array<ArrayBuffer>;
      switch (actionType) {
        case "post":
          v0Unsigned = buildUnsignedPayload(content!, pubkey);
          break;
        case "reply":
          v0Unsigned = buildReplyUnsignedPayload(content!, pubkey, parentTxid!);
          break;
        case "repost":
          v0Unsigned = buildRepostUnsignedPayload(pubkey, repostTxid!);
          break;
        case "quote-repost":
          v0Unsigned = buildQuoteRepostUnsignedPayload(content!, pubkey, repostTxid!);
          break;
        case "follow":
          v0Unsigned = buildFollowUnsignedPayload(followPubkey!, followIsFollow ?? true, pubkey);
          break;
        case "profile":
          v0Unsigned = buildProfileUpdateUnsignedPayload(propertyKind!, content!, pubkey);
          break;
      }

      const signingPayload = version === 0 ? v0Unsigned : buildV1SigningBody(v0Unsigned);
      const sig = await signPayload(signingPayload, pubkey);

      let invoiceRes;
      switch (actionType) {
        case "post":
          invoiceRes = await submitPost(content!, pubkey, sig, version);
          break;
        case "reply":
          invoiceRes = await submitReply(content!, pubkey, sig, parentTxid!, version);
          break;
        case "repost":
          invoiceRes = await submitRepost(pubkey, sig, repostTxid!, version);
          break;
        case "quote-repost":
          invoiceRes = await submitQuoteRepost(content!, pubkey, sig, repostTxid!, version);
          break;
        case "follow":
          invoiceRes = await submitFollow(followPubkey!, followIsFollow ?? true, pubkey, sig, version);
          break;
        case "profile":
          invoiceRes = await submitProfileUpdate(propertyKind!, content!, pubkey, sig, version);
          break;
      }

      const { txid } = await payAndBroadcast(invoiceRes.invoice, invoiceRes.paymentHash);
      toast.success("Posted permanently to bitcoin!", { description: `TXID: ${txid}` });
      setOpen(false);
      onSuccess();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setPaying(false);
    }
  }

  return (
    <>
      <button
        className={`flex items-center gap-1 text-xs transition-colors ${
          disabled
            ? "text-muted-foreground/40 cursor-not-allowed"
            : "text-muted-foreground hover:text-orange-500 cursor-pointer"
        }`}
        title={disabled ? disabledReason : "Publish permanently to bitcoin"}
        onClick={(e) => {
          e.stopPropagation();
          if (!disabled) setOpen(true);
        }}
        disabled={disabled}
      >
        <BoxIcon className="h-3.5 w-3.5" />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm" onClick={(e) => e.stopPropagation()}>
          <DialogHeader>
            <DialogTitle>Make permanent on bitcoin</DialogTitle>
          </DialogHeader>

          {hasWallet ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                This will post permanently to bitcoin mainnet. It costs a small fee.
              </p>
              {fee && (
                <p className="text-sm font-mono">
                  ~{fee.sats} sats{fee.usd !== null && ` ($${fee.usd})`}
                </p>
              )}
              <div className="flex gap-2 justify-end">
                <Button variant="outline" size="sm" onClick={() => setOpen(false)} disabled={paying}>
                  Cancel
                </Button>
                <Button size="sm" onClick={handlePay} disabled={paying}>
                  {paying ? "Paying…" : "Pay & Post Permanently"}
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Connect a bitcoin lightning wallet to make permanent posts.
              </p>
              <div className="space-y-2">
                <label className="text-sm font-medium">Nostr Wallet Connect URL</label>
                <Input
                  placeholder="nostr+walletconnect://..."
                  value={nwcUrl}
                  onChange={(e) => setNwcUrl(e.target.value)}
                  disabled={connecting}
                />
              </div>
              {(window as any).webln && (
                <p className="text-xs text-muted-foreground">
                  Or use your browser extension - it will be detected automatically.
                </p>
              )}
              <div className="flex gap-2 justify-end">
                <Button variant="outline" size="sm" onClick={() => setOpen(false)} disabled={connecting}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleConnect}
                  disabled={connecting || !nwcUrl.trim()}
                >
                  {connecting ? "Connecting…" : "Connect Wallet"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
