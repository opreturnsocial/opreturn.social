import { useState, useEffect } from "react";
import {
  Zap,
  Shield,
  KeyIcon,
  GlobeIcon,
  BoxIcon,
  Copy,
  Check,
  Wallet,
} from "lucide-react";
import { LogoIcon } from "@/icons/LogoIcon";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { generateSecretKey, getPublicKey, nip19 } from "nostr-tools";
import { WalletFundingView } from "@/components/WalletFundingView";
import { NWCClient } from "@getalby/sdk/nwc";
import { getNostrExtPubkey } from "@/lib/nostr";

type AuthStep =
  | "landing"
  | "signup-welcome"
  | "signup-choice"
  | "login-choice"
  | "quick-start-key"
  | "quick-start-wallet"
  | "wallet-choice"
  | "wallet-fund"
  | "wallet-nwc-paste"
  | "wallet-low-balance"
  | "enter-nsec";

export function AuthPage({
  onLoginWithExtension,
  onQuickStartComplete,
  onLoginComplete,
}: {
  onLoginWithExtension: () => Promise<void>;
  onQuickStartComplete: (pubkey: string) => void;
  onLoginComplete: () => void;
}) {
  const [step, setStep] = useState<AuthStep>("landing");
  const [nwcBalance, setNwcBalance] = useState(0);

  async function handleNostrExtPubkey() {
    const pubkey = await getNostrExtPubkey();
    if (!pubkey) return;
    localStorage.setItem("ors_pubkey", pubkey);
    setStep("wallet-choice");
  }

  if (step === "landing") {
    return (
      <LandingView
        onSignup={() => setStep("signup-welcome")}
        onLogin={() => setStep("login-choice")}
      />
    );
  }
  if (step === "signup-welcome") {
    return (
      <SignupWelcomeView
        onBack={() => setStep("landing")}
        onContinue={() => setStep("signup-choice")}
      />
    );
  }
  if (step === "signup-choice") {
    return (
      <SignupChoiceView
        onBack={() => setStep("signup-welcome")}
        onLoginWithExtension={onLoginWithExtension}
        onQuickStart={() => setStep("quick-start-key")}
        onOtherNostrExt={handleNostrExtPubkey}
        onEnterNsec={() => setStep("enter-nsec")}
      />
    );
  }
  if (step === "quick-start-key") {
    return (
      <QuickStartKeyView
        onBack={() => setStep("signup-choice")}
        onContinue={() => setStep("quick-start-wallet")}
      />
    );
  }
  if (step === "quick-start-wallet") {
    return (
      <QuickStartWalletView
        onBack={() => setStep("quick-start-key")}
        onComplete={onQuickStartComplete}
      />
    );
  }
  if (step === "login-choice") {
    return (
      <LoginChoiceView
        onBack={() => setStep("landing")}
        onLoginWithExtension={onLoginWithExtension}
        onOtherNostrExt={handleNostrExtPubkey}
        onEnterNsec={() => setStep("enter-nsec")}
      />
    );
  }
  if (step === "enter-nsec") {
    return (
      <EnterNsecView
        onBack={() => setStep("login-choice")}
        onContinue={() => setStep("wallet-choice")}
      />
    );
  }
  if (step === "wallet-choice") {
    return (
      <WalletChoiceView
        onEmbedded={() => setStep("wallet-fund")}
        onNwcPaste={() => setStep("wallet-nwc-paste")}
      />
    );
  }
  if (step === "wallet-fund") {
    return (
      <WalletFundView
        onBack={() => setStep("wallet-choice")}
        onComplete={onLoginComplete}
      />
    );
  }
  if (step === "wallet-nwc-paste") {
    return (
      <WalletNwcPasteView
        onBack={() => setStep("wallet-choice")}
        onComplete={onLoginComplete}
        onLowBalance={(sats) => {
          setNwcBalance(sats);
          setStep("wallet-low-balance");
        }}
      />
    );
  }
  if (step === "wallet-low-balance") {
    return (
      <div className="min-h-screen flex flex-col">
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="w-full max-w-md space-y-6">
            <div className="space-y-1">
              <h1 className="text-2xl font-bold">Top up your wallet</h1>
              <p className="text-muted-foreground text-sm">
                Your wallet has{" "}
                <span className="font-semibold text-foreground">
                  {nwcBalance.toLocaleString()} sats
                </span>
                . Pay the invoice below to add 5,000 sats and start posting.
              </p>
            </div>
            <WalletFundingView showTitle={false} onComplete={onLoginComplete} />
            <div className="flex justify-center">
              <button
                className="text-sm text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
                onClick={() => setStep("wallet-nwc-paste")}
              >
                Try a different wallet
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }
}

function LandingView({
  onSignup,
  onLogin,
}: {
  onSignup: () => void;
  onLogin: () => void;
}) {
  return (
    <div className="min-h-screen flex flex-col md:flex-row">
      {/* Left - Brand */}
      <div className="flex-1 flex items-center justify-center bg-orange-500 p-12 min-h-[40vh] md:min-h-screen">
        <div className="text-white flex flex-col items-center gap-6">
          <LogoIcon className="text-white size-48" />
          <p className="text-orange-100 font-medium text-center">
            <span className="font-semibold">OP_RETURN SOCIAL</span>
            <br />
            Freedom is not free
          </p>
        </div>
      </div>

      {/* Right - Actions */}
      <div className="flex-1 flex items-center justify-center p-8 md:p-16">
        <div className="w-full max-w-sm space-y-8">
          <div>
            <h1 className="text-4xl font-bold tracking-tight">Join today</h1>
          </div>

          <div className="space-y-3">
            <Button className="w-full h-11 text-base" onClick={onSignup}>
              Create account
            </Button>
          </div>

          <div className="space-y-3">
            <p className="text-sm font-semibold text-foreground">
              Already have an account?
            </p>
            <Button
              variant="outline"
              className="w-full h-11 text-base font-semibold"
              onClick={onLogin}
            >
              Sign in
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SignupWelcomeView({
  onBack,
  onContinue,
}: {
  onBack: () => void;
  onContinue: () => void;
}) {
  return (
    <div className="min-h-screen flex flex-col">
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md space-y-8">
          <div className="flex items-center justify-center">
            <LogoIcon className="text-orange-500 size-32" />
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-bold">Welcome to OP_RETURN SOCIAL</h1>
            <p className="text-muted-foreground">
              A permissionless social protocol built on bitcoin
            </p>
          </div>

          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 h-6 w-6 rounded-full bg-orange-100 flex items-center justify-center flex-shrink-0">
                <BoxIcon className="h-3.5 w-3.5 text-orange-600" />
              </div>
              <div>
                <p className="font-semibold text-sm">Posts live on bitcoin</p>
                <p className="text-sm text-muted-foreground">
                  Every post is a bitcoin transaction.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="mt-0.5 h-6 w-6 rounded-full bg-orange-100 flex items-center justify-center flex-shrink-0">
                <KeyIcon className="h-3.5 w-3.5 text-orange-600" />
              </div>
              <div>
                <p className="font-semibold text-sm">You own your identity</p>
                <p className="text-sm text-muted-foreground">
                  Your posts are signed by your own key.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="mt-0.5 h-6 w-6 rounded-full bg-orange-100 flex items-center justify-center flex-shrink-0">
                <GlobeIcon className="h-3.5 w-3.5 text-orange-600" />
              </div>
              <div>
                <p className="font-semibold text-sm">Open Protocol</p>
                <p className="text-sm text-muted-foreground">
                  Choose your own app and rules.
                </p>
              </div>
            </div>
          </div>

          <Button className="w-full h-11" onClick={onContinue}>
            Continue
          </Button>
        </div>
      </div>
    </div>
  );
}

function SignupChoiceView({
  onBack,
  onLoginWithExtension,
  onQuickStart,
  onOtherNostrExt,
  onEnterNsec,
}: {
  onBack: () => void;
  onLoginWithExtension: () => Promise<void>;
  onQuickStart: () => void;
  onOtherNostrExt: () => void;
  onEnterNsec: () => void;
}) {
  return (
    <div className="min-h-screen flex flex-col">
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md space-y-6">
          <div>
            <h1 className="text-3xl font-bold">How would you like to start?</h1>
            <p className="text-muted-foreground mt-1">
              Choose the option that fits you best.
            </p>
          </div>

          <div className="space-y-4">
            {/* Quick Start - Primary */}
            <Card className="border-primary border-2">
              <CardContent className="p-5 space-y-3">
                <div className="flex items-center gap-2">
                  <Zap className="h-5 w-5" />
                  <h2 className="font-bold text-lg">Quick Start</h2>
                </div>
                <p className="text-sm text-muted-foreground">
                  A custodial wallet and key will generated and saved in this
                  browser. Faster setup, less secure.
                </p>
                <Button className="w-full" onClick={onQuickStart}>
                  Quick Start
                </Button>
              </CardContent>
            </Card>

            <div className="flex items-center gap-3">
              <Separator className="flex-1" />
              <span className="text-xs text-muted-foreground">or</span>
              <Separator className="flex-1" />
            </div>

            {/* Secure Start - Secondary */}
            <Card>
              <CardContent className="p-5 space-y-3">
                <div className="flex items-center gap-2">
                  <Shield className="h-5 w-5 text-muted-foreground" />
                  <h2 className="font-bold text-lg text-muted-foreground">
                    Secure Start
                  </h2>
                </div>
                <p className="text-sm text-muted-foreground">
                  Use the Alby Browser Extension for full control of your keys.
                </p>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={async () => {
                    if ((window as unknown as { alby?: unknown }).alby) {
                      await onLoginWithExtension();
                    } else {
                      window.open(
                        "https://getalby.com/alby-extension?ref=opreturn.social",
                        "_blank",
                      );
                    }
                  }}
                >
                  <Shield className="h-4 w-4" /> Start with Alby Extension
                </Button>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={onOtherNostrExt}
                >
                  Use other Nostr extension
                </Button>
              </CardContent>
            </Card>

            <div className="flex items-center gap-3">
              <Separator className="flex-1" />
              <span className="text-xs text-muted-foreground">or</span>
              <Separator className="flex-1" />
            </div>

            <Button
              variant="outline"
              className="w-full h-11"
              onClick={onEnterNsec}
            >
              Connect wallet and enter key
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function QuickStartKeyView({
  onBack,
  onContinue,
}: {
  onBack: () => void;
  onContinue: () => void;
}) {
  const [pubkeyHex, setPubkeyHex] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    // Generate key if not already done
    const existing = localStorage.getItem("ors_pubkey");
    if (existing) {
      setPubkeyHex(existing);
      return;
    }
    const privKey = generateSecretKey();
    const pubHex = getPublicKey(privKey);
    const privHex = Array.from(privKey)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    localStorage.setItem("ors_local_privkey", privHex);
    localStorage.setItem("ors_pubkey", pubHex);
    setPubkeyHex(pubHex);
  }, []);

  const npub = pubkeyHex ? nip19.npubEncode(pubkeyHex) : null;

  function copyPubkey() {
    if (!npub) return;
    navigator.clipboard.writeText(npub);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="min-h-screen flex flex-col">
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md space-y-6">
          <div className="flex items-center justify-center">
            <div className="h-16 w-16 rounded-full bg-orange-100 flex items-center justify-center">
              <KeyIcon className="h-8 w-8 text-orange-600" />
            </div>
          </div>

          <div className="space-y-2 text-center">
            <h1 className="text-2xl font-bold">Your key has been created</h1>
            <p className="text-muted-foreground text-sm">
              A unique cryptographic key has been generated and saved in your
              browser. It signs your posts and proves your identity.
            </p>
          </div>

          <div className="rounded-lg border border-orange-200 bg-orange-50 p-4 text-sm text-orange-800">
            <p className="font-semibold mb-1">Back up your key anytime</p>
            <p>
              You can export your private key from Settings at any time. Without
              a backup, you cannot recover your account if you lose access to
              this browser.
            </p>
          </div>

          <Button className="w-full h-11" onClick={onContinue}>
            Continue - Set up wallet
          </Button>
        </div>
      </div>
    </div>
  );
}

function QuickStartWalletView({
  onBack,
  onComplete,
}: {
  onBack: () => void;
  onComplete: (pubkey: string) => void;
}) {
  function handleComplete() {
    const pubkey = localStorage.getItem("ors_pubkey")!;
    onComplete(pubkey);
  }

  return (
    <div className="min-h-screen flex flex-col">
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md">
          <WalletFundingView onComplete={handleComplete} />
        </div>
      </div>
    </div>
  );
}

function LoginChoiceView({
  onBack,
  onLoginWithExtension,
  onOtherNostrExt,
  onEnterNsec,
}: {
  onBack: () => void;
  onLoginWithExtension: () => Promise<void>;
  onOtherNostrExt: () => void;
  onEnterNsec: () => void;
}) {
  return (
    <div className="min-h-screen flex flex-col">
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-sm space-y-6">
          <div>
            <h1 className="text-3xl font-bold">Sign in to ORS</h1>
          </div>

          <div className="space-y-3">
            <Button
              className="w-full h-11 gap-2"
              onClick={async () => {
                if ((window as unknown as { alby?: unknown }).alby) {
                  await onLoginWithExtension();
                } else {
                  window.open(
                    "https://getalby.com/alby-extension?ref=opreturn.social",
                    "_blank",
                  );
                }
              }}
            >
              <Shield className="h-4 w-4" />
              Sign in with Alby Extension
            </Button>

            <Button
              variant="outline"
              className="w-full h-11"
              onClick={onOtherNostrExt}
            >
              Use other Nostr extension
            </Button>

            <div className="flex items-center gap-3">
              <Separator className="flex-1" />
              <span className="text-xs text-muted-foreground">or</span>
              <Separator className="flex-1" />
            </div>

            <Button
              variant="outline"
              className="w-full h-11"
              onClick={onEnterNsec}
            >
              Connect wallet and enter key
            </Button>
            <p className="text-xs text-muted-foreground text-center">
              Your wallet and key will be saved in browser storage.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function EnterNsecView({
  onBack,
  onContinue,
}: {
  onBack: () => void;
  onContinue: () => void;
}) {
  const [nsec, setNsec] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleSubmit() {
    setError(null);
    try {
      const decoded = nip19.decode(nsec.trim());
      if (decoded.type !== "nsec") {
        setError("That doesn't look like a valid nsec key.");
        return;
      }
      const privKeyBytes = decoded.data as Uint8Array;
      const pubHex = getPublicKey(privKeyBytes);
      const privHex = Array.from(privKeyBytes)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      localStorage.setItem("ors_local_privkey", privHex);
      localStorage.setItem("ors_pubkey", pubHex);
      onContinue();
    } catch {
      setError("Invalid nsec. Please check your key and try again.");
    }
  }

  return (
    <div className="min-h-screen flex flex-col">
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md space-y-6">
          <div className="flex items-center justify-center">
            <div className="h-16 w-16 rounded-full bg-orange-100 flex items-center justify-center">
              <KeyIcon className="h-8 w-8 text-orange-600" />
            </div>
          </div>

          <div className="space-y-2 text-center">
            <h1 className="text-2xl font-bold">Enter your private key</h1>
            <p className="text-muted-foreground text-sm">
              Paste your nsec to sign in. It will be stored locally in your
              browser.
            </p>
          </div>

          <div className="space-y-2">
            <Textarea
              placeholder="nsec1..."
              value={nsec}
              onChange={(e) => setNsec(e.target.value)}
              className="font-mono text-sm resize-none"
              rows={3}
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>

          <div className="rounded-lg border border-orange-200 bg-orange-50 p-4 text-sm text-orange-800">
            <p className="font-semibold mb-1">Your key stays in your browser</p>
            <p>
              Your private key is never sent to any server. It is stored only in
              this browser's local storage.
            </p>
          </div>

          <div className="space-y-2">
            <Button
              className="w-full h-11"
              onClick={handleSubmit}
              disabled={!nsec.trim()}
            >
              Continue
            </Button>
            <Button variant="ghost" className="w-full" onClick={onBack}>
              Back
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function WalletChoiceView({
  onEmbedded,
  onNwcPaste,
}: {
  onEmbedded: () => void;
  onNwcPaste: () => void;
}) {
  return (
    <div className="min-h-screen flex flex-col">
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md space-y-6">
          <div>
            <h1 className="text-3xl font-bold">Set up your wallet</h1>
            <p className="text-muted-foreground mt-1">
              You need a lightning wallet to post.
            </p>
          </div>

          <div className="space-y-4">
            <Card className="border-primary border-2">
              <CardContent className="p-5 space-y-3">
                <div className="flex items-center gap-2">
                  <Zap className="h-5 w-5" />
                  <h2 className="font-bold text-lg">Embedded wallet</h2>
                </div>
                <p className="text-sm text-muted-foreground">
                  We create a custodial wallet for you via lncurl.lol. Fund it
                  with 5,000 sats to start posting. Zero config.
                </p>
                <Button className="w-full" onClick={onEmbedded}>
                  Create embedded wallet
                </Button>
              </CardContent>
            </Card>

            <div className="flex items-center gap-3">
              <Separator className="flex-1" />
              <span className="text-xs text-muted-foreground">or</span>
              <Separator className="flex-1" />
            </div>

            <Card>
              <CardContent className="p-5 space-y-3">
                <div className="flex items-center gap-2">
                  <Wallet className="h-5 w-5 text-muted-foreground" />
                  <h2 className="font-bold text-lg text-muted-foreground">
                    Connect existing wallet
                  </h2>
                </div>
                <p className="text-sm text-muted-foreground">
                  Paste a Nostr Wallet Connect URL from any compatible wallet
                  (Alby, Mutiny, etc.).
                </p>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={onNwcPaste}
                >
                  Paste NWC URL
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

function WalletFundView({
  onBack,
  onComplete,
}: {
  onBack: () => void;
  onComplete: () => void;
}) {
  return (
    <div className="min-h-screen flex flex-col">
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md">
          <WalletFundingView onComplete={onComplete} />
        </div>
      </div>
    </div>
  );
}

function WalletNwcPasteView({
  onBack,
  onComplete,
  onLowBalance,
}: {
  onBack: () => void;
  onComplete: () => void;
  onLowBalance: (sats: number) => void;
}) {
  const [url, setUrl] = useState("");
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setError(null);
    const trimmed = url.trim();
    if (!trimmed.startsWith("nostr+walletconnect://")) {
      setError("URL must start with nostr+walletconnect://");
      return;
    }
    setChecking(true);
    try {
      const client = new NWCClient({ nostrWalletConnectUrl: trimmed });
      const { balance } = await client.getBalance();
      client.close();
      const sats = Math.floor(balance / 1000);
      localStorage.setItem("ors_nwc_url", trimmed);
      localStorage.setItem("ors_nwc_user_provided", "true");
      if (sats >= 5000) {
        localStorage.setItem("ors_wallet_funded", "true");
        onComplete();
      } else {
        onLowBalance(sats);
      }
    } catch {
      setError("Could not connect to wallet. Please check your URL.");
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col">
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md space-y-6">
          <div className="flex items-center justify-center">
            <div className="h-16 w-16 rounded-full bg-orange-100 flex items-center justify-center">
              <Wallet className="h-8 w-8 text-orange-600" />
            </div>
          </div>

          <div className="space-y-2 text-center">
            <h1 className="text-2xl font-bold">Connect your wallet</h1>
            <p className="text-muted-foreground text-sm">
              Paste your Nostr Wallet Connect URL below. Your wallet needs at
              least 5,000 sats.
            </p>
          </div>

          <div className="space-y-2">
            <Textarea
              placeholder="nostr+walletconnect://..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="font-mono text-sm resize-none"
              rows={4}
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>

          <div className="space-y-2">
            <Button
              className="w-full h-11"
              onClick={handleSubmit}
              disabled={!url.trim() || checking}
            >
              {checking ? "Checking balance..." : "Connect wallet"}
            </Button>
            <Button variant="ghost" className="w-full" onClick={onBack}>
              Back
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
