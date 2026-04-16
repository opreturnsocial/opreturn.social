import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { toast } from "sonner";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function shortenTxid(txid: string): string {
  return `${txid.slice(0, 8)}...${txid.slice(-8)}`;
}

export const FREE_NETWORK = import.meta.env.VITE_FREE_NETWORK ?? "mutinynet";

export function isFreeNetwork(network?: string): boolean {
  return !!network && network !== "mainnet";
}

export function mempoolTxUrl(txid: string, network?: string): string {
  if (network === "testnet4") return `https://mempool.space/testnet4/tx/${txid}`;
  if (network === "signet") return `https://mempool.space/signet/tx/${txid}`;
  if (network === "mutinynet") return `https://mutinynet.com/tx/${txid}`;
  return `https://mempool.space/tx/${txid}`;
}

export function warnIfNoProfileName(name: string | null | undefined, onEditProfile?: () => void) {
  if (!name) {
    toast.warning("This won't appear in the global feed until you set a name on your profile.", {
      ...(onEditProfile ? { action: { label: "Update profile", onClick: onEditProfile } } : {}),
    });
  }
}

export function formatRelativeTime(timestamp: number): string {
  if (timestamp === 0) return "just now";
  const diffMs = Date.now() - timestamp * 1000;
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return "just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}h`;
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 7) return `${diffDay}d`;
  return `${Math.floor(diffDay / 7)}w`;
}
