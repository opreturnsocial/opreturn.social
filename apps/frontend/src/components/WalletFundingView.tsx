import { useState, useEffect, useRef } from "react";
import { Check, Copy, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { NWCClient } from "@getalby/sdk/nwc";
import { getFiatValue } from "@getalby/lightning-tools/fiat";

export function WalletFundingView({
  onComplete,
  showTitle = true,
  amount,
  allowAmountEdit = false,
}: {
  onComplete: () => void;
  showTitle?: boolean;
  amount?: number;
  allowAmountEdit?: boolean;
}) {
  type WalletState =
    | "choose-amount"
    | "creating"
    | "awaiting-payment"
    | "paid"
    | "error";
  const [walletState, setWalletState] = useState<WalletState>(
    allowAmountEdit ? "choose-amount" : "creating",
  );
  const [invoiceAmount, setInvoiceAmount] = useState(amount ?? 5000);
  const [usdAmount, setUsdAmount] = useState<number | null>(null);
  const [invoice, setInvoice] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(3600);
  const [copied, setCopied] = useState(false);
  const clientRef = useRef<NWCClient | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    getFiatValue({ satoshi: invoiceAmount, currency: "USD" })
      .then((v) => setUsdAmount(v))
      .catch(() => {});
  }, [invoiceAmount]);

  function formatUsd(usd: number | null): string | null {
    if (usd === null) return null;
    return usd < 0.01
      ? "<$0.01"
      : "$" +
          usd.toLocaleString("en-US", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          });
  }

  useEffect(() => {
    if (!allowAmountEdit) setup();
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      if (timerRef.current) clearInterval(timerRef.current);
      clientRef.current?.close();
    };
  }, []);

  async function setup() {
    try {
      setWalletState("creating");
      setErrorMsg(null);

      const userProvided =
        localStorage.getItem("ors_nwc_user_provided") === "true";
      const existingUrl = localStorage.getItem("ors_nwc_url");
      let createdAt: number;
      let nwcUrl: string;

      // Top-up flow: user-provided wallets are never replaced here.
      // lncurl.lol is only called for embedded wallets with no stored URL or an expired one.
      if (userProvided && existingUrl) {
        nwcUrl = existingUrl;
        createdAt = Date.now();
      } else {
        const THIRTY_MIN = 30 * 60 * 1000;
        const storedAt = Number(
          localStorage.getItem("ors_nwc_created_at") ?? 0,
        );
        if (existingUrl && Date.now() - storedAt < THIRTY_MIN) {
          nwcUrl = existingUrl;
          createdAt = storedAt;
        } else {
          const res = await fetch("https://lncurl.lol", { method: "POST" });
          if (!res.ok) throw new Error("Failed to create wallet");
          nwcUrl = (await res.text()).trim();
          createdAt = Date.now();
          localStorage.setItem("ors_nwc_url", nwcUrl);
          localStorage.setItem("ors_nwc_created_at", String(createdAt));
        }
      }

      const client = new NWCClient({ nostrWalletConnectUrl: nwcUrl });
      clientRef.current = client;

      const tx = await client.makeInvoice({
        amount: invoiceAmount * 1000,
        description: "Fund your ORS wallet",
        expiry: 3600,
      });

      setInvoice(tx.invoice);
      setWalletState("awaiting-payment");

      const deadline = createdAt + 3600 * 1000;
      timerRef.current = setInterval(() => {
        const remaining = Math.max(
          0,
          Math.round((deadline - Date.now()) / 1000),
        );
        setSecondsLeft(remaining);
        if (remaining === 0) {
          if (timerRef.current) clearInterval(timerRef.current);
          if (pollRef.current) clearInterval(pollRef.current);
          setWalletState("error");
          setErrorMsg("Invoice expired. Please try again.");
        }
      }, 1000);

      pollRef.current = setInterval(async () => {
        try {
          const result = await client.lookupInvoice({ invoice: tx.invoice });
          if (result.state === "settled") {
            if (pollRef.current) clearInterval(pollRef.current);
            if (timerRef.current) clearInterval(timerRef.current);
            localStorage.setItem("ors_wallet_funded", "true");
            setWalletState("paid");
            setTimeout(() => onComplete(), 1500);
          }
        } catch {
          // ignore transient lookup errors
        }
      }, 5000);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Something went wrong");
      setWalletState("error");
    }
  }

  function copyInvoice() {
    if (!invoice) return;
    navigator.clipboard.writeText(invoice);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function formatTime(seconds: number) {
    const m = Math.floor(seconds / 60)
      .toString()
      .padStart(2, "0");
    const s = (seconds % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  }

  if (walletState === "choose-amount") {
    return (
      <div className="space-y-6 py-2">
        {showTitle && (
          <div className="space-y-1">
            <h1 className="text-2xl font-bold">Top up wallet</h1>
          </div>
        )}
        <div className="space-y-2">
          <label htmlFor="top-up-amount" className="text-sm font-medium">
            Amount (sats)
          </label>
          <input
            id="top-up-amount"
            type="number"
            min={1}
            value={invoiceAmount}
            onChange={(e) => setInvoiceAmount(Number(e.target.value))}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          />
          {formatUsd(usdAmount) && (
            <p className="text-xs text-muted-foreground">
              {formatUsd(usdAmount)} USD
            </p>
          )}
        </div>
        <Button
          className="w-full"
          onClick={() => {
            setWalletState("creating");
            setup();
          }}
          disabled={!invoiceAmount || invoiceAmount < 1}
        >
          Generate invoice
        </Button>
      </div>
    );
  }

  if (walletState === "creating") {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center space-y-4">
          <div className="h-12 w-12 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-muted-foreground">Setting up your wallet...</p>
        </div>
      </div>
    );
  }

  if (walletState === "error") {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-full max-w-md space-y-6 text-center">
          <p className="text-destructive font-medium">{errorMsg}</p>
          <Button onClick={setup}>Try again</Button>
        </div>
      </div>
    );
  }

  if (walletState === "paid") {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center space-y-4">
          <div className="h-16 w-16 rounded-full bg-green-100 flex items-center justify-center mx-auto">
            <Check className="h-8 w-8 text-green-600" />
          </div>
          <h2 className="text-xl font-bold">Wallet funded!</h2>
          <p className="text-muted-foreground text-sm">Taking you in...</p>
        </div>
      </div>
    );
  }

  // awaiting-payment
  const ffioUrl = `https://ff.io/?from=USDTTRC&to=BTCLN&address=${encodeURIComponent(invoice!)}&ref=gzdbpzhb`;
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&ecc=L&data=${encodeURIComponent(`lightning:${invoice!.toUpperCase()}`)}`;

  return (
    <div className="space-y-6">
      {showTitle && (
        <div className="space-y-1">
          <h1 className="text-2xl font-bold">Fund your wallet</h1>
        </div>
      )}
      {localStorage.getItem("ors_nwc_url")?.includes("lncurl") && (
        <div className="text-xs text-muted-foreground">
          Powered by{" "}
          <a
            href="https://lncurl.lol"
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold"
          >
            LNCURL
          </a>{" "}
          - 1 sat/hour hosting fee
        </div>
      )}
      <p className="text-muted-foreground text-sm">
        Send{" "}
        <span className="font-semibold text-foreground">
          {invoiceAmount.toLocaleString()} sats
          {formatUsd(usdAmount) && (
            <span className="font-normal text-muted-foreground">
              {" "}
              ({formatUsd(usdAmount)})
            </span>
          )}
        </span>{" "}
        via the <span className="font-semibold">bitcoin lightning network</span>{" "}
        to activate your wallet. Expires in{" "}
        <span
          className={`font-mono font-semibold ${secondsLeft < 300 ? "text-destructive" : "text-foreground"}`}
        >
          {formatTime(secondsLeft)}
        </span>
      </p>

      <div className="flex justify-center">
        <div className="border rounded-xl p-3 bg-white">
          <img
            src={qrUrl}
            alt="Lightning invoice QR code"
            width={220}
            height={220}
            className="block max-w-full"
          />
        </div>
      </div>

      <Card className="bg-muted/50">
        <CardContent className="p-3">
          <p className="text-xs mb-2">
            Or copy the following{" "}
            <span className="font-semibold">bitcoin lightning invoice</span>
          </p>
          <div className="flex items-center gap-2">
            <code className="text-xs font-mono break-all text-muted-foreground">
              {invoice}
            </code>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 flex-shrink-0"
              onClick={copyInvoice}
            >
              {copied ? (
                <Check className="h-3.5 w-3.5 text-green-500" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      <a
        href={ffioUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center justify-center gap-2 w-full h-11 rounded-md border border-input bg-background px-4 text-sm font-medium hover:bg-accent hover:text-accent-foreground transition-colors"
      >
        <ExternalLink className="h-4 w-4" />
        Pay with ff.io (stablecoins / crypto)
      </a>

      <p className="text-xs text-muted-foreground text-center">
        Waiting for payment...
        <span className="inline-block ml-1 h-1.5 w-1.5 rounded-full bg-orange-400 animate-pulse" />
      </p>
    </div>
  );
}
