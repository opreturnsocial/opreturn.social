import { useState } from "react";
import { toast } from "sonner";
import { Copy, ExternalLink } from "lucide-react";
import { nip19 } from "nostr-tools";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getProtocolVersion } from "../lib/ors";
import { getFeeBumpSatPerVByte } from "../lib/fees";

function SecretRow({
  label,
  description,
  storageKey,
  transform,
}: {
  label: string;
  description: string;
  storageKey: string;
  transform?: (raw: string) => string;
}) {
  function handleCopy() {
    const value = localStorage.getItem(storageKey);
    if (!value) return;
    navigator.clipboard.writeText(transform ? transform(value) : value);
    toast.success("Copied!");
  }

  return (
    <div className="flex items-start justify-between gap-4 py-4">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        <div
          className="mt-2 text-sm tracking-widest text-muted-foreground select-none pointer-events-none"
          aria-hidden="true"
        >
          ••••••••••••••••
        </div>
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={handleCopy}
        className="shrink-0 mt-1"
      >
        <Copy className="h-3.5 w-3.5 mr-1.5" />
        Copy
      </Button>
    </div>
  );
}

const donationAddress = import.meta.env.VITE_FACILITATOR_DONATION_ADDRESS as
  | string
  | undefined;
const allowBroadcastV0 = import.meta.env.VITE_ALLOW_BROADCAST_V0 === "true";

export function SettingsPage() {
  const [hasNwcUrl, setHasNwcUrl] = useState(
    !!localStorage.getItem("ors_nwc_url"),
  );
  const [disconnectOpen, setDisconnectOpen] = useState(false);
  const [protocolVersion, setProtocolVersionState] =
    useState(getProtocolVersion);
  const [feeBump, setFeeBumpState] = useState(getFeeBumpSatPerVByte);
  const hasPrivkey = !!localStorage.getItem("ors_local_privkey");
  const hasSecrets = hasPrivkey || hasNwcUrl;

  function handleFeeBumpChange(v: number) {
    localStorage.setItem("ors_fee_bump_sat_per_vbyte", String(v));
    setFeeBumpState(v);
    toast.success(
      v === 0 ? "Fee bump reset to 0" : `Fee bump set to +${v} sat/vB`,
    );
  }

  function handleVersionChange(v: number) {
    if (v === 0 && !allowBroadcastV0) {
      toast.error("v0 broadcasting is currently disabled.");
      return;
    }
    localStorage.setItem("ors_protocol_version", String(v));
    setProtocolVersionState(v);
    toast.success(`Protocol version set to v${v}`);
  }

  function handleDisconnectWallet() {
    localStorage.removeItem("ors_nwc_url");
    localStorage.removeItem("ors_nwc_user_provided");
    localStorage.removeItem("ors_nwc_created_at");
    localStorage.removeItem("ors_wallet_funded");
    setHasNwcUrl(false);
    setDisconnectOpen(false);
    toast.success("Wallet disconnected.");
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Settings</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Backup</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {hasSecrets ? (
            <div className="divide-y">
              {hasPrivkey && (
                <SecretRow
                  label="Private Key"
                  description="Your Nostr signing key. Store it somewhere safe - it cannot be recovered if lost."
                  storageKey="ors_local_privkey"
                  transform={(hex) => {
                    const bytes = new Uint8Array(
                      hex.match(/.{2}/g)!.map((b) => parseInt(b, 16)),
                    );
                    return nip19.nsecEncode(bytes);
                  }}
                />
              )}
              {hasNwcUrl && (
                <SecretRow
                  label="Wallet Connection Secret"
                  description="Your wallet connection string. You can import it into another app like Alby Go."
                  storageKey="ors_nwc_url"
                />
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground py-2">
              No backup needed - you're using an external Nostr extension.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Protocol Version</CardTitle>
        </CardHeader>
        <CardContent className="pt-0 space-y-3">
          <p className="text-xs text-muted-foreground">
            Controls how your posts are embedded in bitcoin transactions.
          </p>
          {[
            {
              v: 1,
              label: "v1 - Chunked 80-byte (Recommended)",
              description:
                "Splits posts across multiple 80-byte OP_RETURN outputs. Works with most miners on mainnet.",
            },
            {
              v: 0,
              label: "v0 - Single OP_RETURN",
              description:
                "Single output, smaller fee. Most miners reject payloads >80 bytes.",
            },
          ].map(({ v, label, description }) => (
            <div
              key={v}
              className={`flex items-start gap-3 rounded-md border p-3 cursor-pointer transition-colors ${protocolVersion === v ? "border-primary bg-primary/5" : "hover:bg-accent/30"}`}
              onClick={() => handleVersionChange(v)}
            >
              <div
                className={`mt-0.5 h-4 w-4 rounded-full border-2 flex-shrink-0 ${protocolVersion === v ? "border-primary bg-primary" : "border-muted-foreground"}`}
              />
              <div>
                <p className="text-sm font-medium">{label}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {description}
                </p>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Fee Priority</CardTitle>
        </CardHeader>
        <CardContent className="pt-0 space-y-3">
          <p className="text-xs text-muted-foreground">
            Add extra sat/vB on top of the estimated network fee rate to
            prioritise confirmation speed.
          </p>
          <div className="flex gap-2">
            {[0, 1, 2, 5, 10].map((v) => (
              <Button
                key={v}
                variant={feeBump === v ? "default" : "outline"}
                size="sm"
                onClick={() => handleFeeBumpChange(v)}
              >
                {v === 0 ? "0" : `+${v}`}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {hasNwcUrl && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Wallet</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="flex items-start justify-between gap-4 py-2">
              <div>
                <p className="text-sm font-medium">Disconnect wallet</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Remove the saved wallet connection from this browser.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="shrink-0 mt-1 text-destructive border-destructive hover:bg-destructive hover:text-destructive-foreground"
                onClick={() => setDisconnectOpen(true)}
              >
                Disconnect
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog open={disconnectOpen} onOpenChange={setDisconnectOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Disconnect wallet?</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 text-sm text-muted-foreground">
            <p>Your wallet connection will be removed from this browser.</p>
            <p>You won't be able to post until you reconnect a wallet.</p>
          </div>
          <div className="flex gap-2 justify-end mt-4">
            <button
              className="px-4 py-2 rounded-md border border-input text-sm hover:bg-accent transition-colors"
              onClick={() => setDisconnectOpen(false)}
            >
              Cancel
            </button>
            <button
              className="px-4 py-2 rounded-md bg-destructive text-destructive-foreground text-sm hover:bg-destructive/90 transition-colors"
              onClick={handleDisconnectWallet}
            >
              Disconnect
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {donationAddress && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Support</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <p className="text-xs text-muted-foreground mb-3">
              Help keep the facilitator running by donating bitcoin on-chain.
            </p>
            <div className="flex items-center justify-between gap-4">
              <p className="text-sm font-mono text-muted-foreground truncate">
                {donationAddress}
              </p>
              <div className="flex gap-2 shrink-0">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    navigator.clipboard.writeText(donationAddress);
                    toast.success("Copied!");
                  }}
                >
                  <Copy className="h-3.5 w-3.5 mr-1.5" />
                  Copy
                </Button>
                <a
                  href={`https://mempool.space/address/${donationAddress}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Button variant="outline" size="sm">
                    <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                    View
                  </Button>
                </a>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <p className="text-xs text-muted-foreground text-center pt-2">
        Commit {__COMMIT_HASH__} &bull;{" "}
        <a
          href="https://github.com/opreturnsocial/opreturn.social/"
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium hover:text-foreground transition-colors"
        >
          GitHub
        </a>
      </p>
    </div>
  );
}
