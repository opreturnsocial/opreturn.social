import { toast } from "sonner";

export async function getNostrExtPubkey(): Promise<string | null> {
  if (!window.nostr) {
    toast.error("No Nostr extension found.");
    return null;
  }
  if (typeof window.nostr.signSchnorr !== "function") {
    toast.error(
      "Your Nostr extension is not supported. It does not implement window.nostr.signSchnorr. Try the Alby Browser Extension.",
    );
    return null;
  }
  try {
    return await window.nostr.getPublicKey();
  } catch {
    toast.error("Failed to get public key from extension.");
    return null;
  }
}
