import { useState, useEffect } from "react";
import {
  Zap,
  Shield,
  LockIcon,
  KeyIcon,
} from "lucide-react";
import { FeatureList } from "./AboutPage";
import { LogoIcon } from "@/icons/LogoIcon";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { generateSecretKey, getPublicKey, nip19 } from "nostr-tools";
import { getNostrExtPubkey } from "@/lib/nostr";

type AuthStep =
  | "landing"
  | "signup-welcome"
  | "signup-choice"
  | "login-choice"
  | "quick-start-key"
  | "enter-nsec";

export function AuthPage({
  onLoginWithExtension,
  onLoginComplete,
}: {
  onLoginWithExtension: () => Promise<void>;
  onLoginComplete: () => void;
}) {
  const [step, setStep] = useState<AuthStep>("landing");

  async function handleNostrExtPubkey() {
    const pubkey = await getNostrExtPubkey();
    if (!pubkey) return;
    localStorage.setItem("ors_pubkey", pubkey);
    onLoginComplete();
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
        onContinue={onLoginComplete}
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
        onContinue={onLoginComplete}
      />
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

          <FeatureList />

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
                  A key will be generated and saved in this browser. Faster
                  setup, less secure.
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
              Enter key
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
  useEffect(() => {
    // Generate key if not already done
    if (localStorage.getItem("ors_pubkey")) return;
    const privKey = generateSecretKey();
    const pubHex = getPublicKey(privKey);
    const privHex = Array.from(privKey)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    localStorage.setItem("ors_local_privkey", privHex);
    localStorage.setItem("ors_pubkey", pubHex);
  }, []);

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
            <p className="font-semibold mb-1 flex items-center gap-1">
              <LockIcon className="h-3.5 w-3.5" />
              Back up your key anytime
            </p>
            <p>
              You can export your private key from Settings at any time. Without
              a backup, you cannot recover your account if you lose access to
              this browser.
            </p>
          </div>

          <Button className="w-full h-11" onClick={onContinue}>
            Continue
          </Button>
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
              Enter key
            </Button>
            <p className="text-xs text-muted-foreground text-center">
              Your key will be saved in browser storage.
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
              this browser's local storage. For best security, use the{" "}
              <span className="font-medium">Alby Browser Extension</span> to
              store your key.
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
