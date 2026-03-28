import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { mempoolTxUrl } from "@/lib/utils";
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
import { sponsorTransaction } from "../api/facilitator";
import { payAndBroadcast } from "../lib/payment";
import { getProtocolVersion } from "../lib/ors";
import { WalletFundingView } from "@/components/WalletFundingView";

interface SponsorButtonProps {
  testnetTxid: string;
  loggedInPubkey?: string | null;
  onSuccess: () => void;
}

export function SponsorButton({
  testnetTxid,
  loggedInPubkey,
  onSuccess,
}: SponsorButtonProps) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [hasWallet, setHasWallet] = useState(
    () => !!(localStorage.getItem("ors_nwc_url") || (window as any).webln)
  );
  const [walletSetupView, setWalletSetupView] = useState<"choose" | "create" | "connect">("choose");
  const [nwcUrl, setNwcUrl] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [paying, setPaying] = useState(false);

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
      const invoiceRes = await sponsorTransaction(testnetTxid, getProtocolVersion());
      const { txid } = await payAndBroadcast(invoiceRes.invoice, invoiceRes.paymentHash);
      toast.success("Broadcast to bitcoin mainnet!", { action: { label: "View on mempool", onClick: () => window.open(mempoolTxUrl(txid), "_blank") } });
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
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-orange-500 transition-colors cursor-pointer"
        title="Broadcast to mainnet"
        onClick={(e) => {
          e.stopPropagation();
          if (!loggedInPubkey) {
            navigate("/auth");
            return;
          }
          setOpen(true);
        }}
      >
        <BoxIcon className="h-3.5 w-3.5" />
      </button>

      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setWalletSetupView("choose"); }}>
        <DialogContent className="max-w-sm max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
          <DialogHeader>
            <DialogTitle>Broadcast to bitcoin mainnet</DialogTitle>
          </DialogHeader>

          {hasWallet ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Anyone can pay to broadcast this testnet transaction to bitcoin mainnet. A small transaction fee applies.
              </p>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" size="sm" onClick={() => setOpen(false)} disabled={paying}>
                  Cancel
                </Button>
                <Button size="sm" onClick={handlePay} disabled={paying}>
                  {paying ? "Broadcasting…" : "Pay & Broadcast"}
                </Button>
              </div>
            </div>
          ) : walletSetupView === "choose" ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                You need a bitcoin lightning wallet to broadcast to mainnet.
              </p>
              <div className="flex flex-col gap-2">
                <Button onClick={() => setWalletSetupView("create")}>
                  Create a wallet
                </Button>
                <Button variant="outline" onClick={() => setWalletSetupView("connect")}>
                  Connect a wallet
                </Button>
              </div>
            </div>
          ) : walletSetupView === "create" ? (
            <WalletFundingView
              showTitle={false}
              amount={5000}
              onComplete={() => setHasWallet(true)}
            />
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Connect a bitcoin lightning wallet to broadcast to mainnet.
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
                <Button variant="outline" size="sm" onClick={() => setWalletSetupView("choose")} disabled={connecting}>
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
