import { Wallet } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import type { Profile } from "../types";
import { LogoIcon } from "@/icons/LogoIcon";

interface HeaderProps {
  loggedInPubkey: string | null;
  profile?: Profile;
  walletBalance?: number | null;
  onTopUp?: () => void;
  onOpenMobileMenu: () => void;
  showOnDesktop?: boolean;
}

export function Header({
  loggedInPubkey,
  profile,
  walletBalance,
  onTopUp,
  onOpenMobileMenu,
  showOnDesktop,
}: HeaderProps) {
  const initials = profile?.name
    ? profile.name.slice(0, 2).toUpperCase()
    : loggedInPubkey
      ? loggedInPubkey.slice(0, 2).toUpperCase()
      : null;

  return (
    <header className={`sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 ${showOnDesktop ? "" : "md:hidden"}`}>
      <div className="px-4 py-3 flex items-center justify-between">
        {/* Left: avatar (logged in) or logo (logged out) - both open the sheet */}
        <button
          onClick={onOpenMobileMenu}
          className="shrink-0"
          aria-label="Open menu"
        >
          {loggedInPubkey ? (
            profile?.avatarUrl ? (
              <img
                src={profile.avatarUrl}
                alt={profile.name ?? "avatar"}
                className="h-8 w-8 rounded-full object-cover border border-border"
              />
            ) : (
              <div className="h-8 w-8 rounded-full bg-orange-500 flex items-center justify-center text-white text-xs font-bold border border-border">
                {initials}
              </div>
            )
          ) : (
            <LogoIcon className="text-orange-400 size-8" />
          )}
        </button>

        {/* Center: logo (absolute) */}
        {loggedInPubkey && (
          <div className="absolute left-1/2 -translate-x-1/2">
            <LogoIcon className="text-orange-400 size-8" />
          </div>
        )}

        {/* Right: wallet balance */}
        {loggedInPubkey !== null && walletBalance !== undefined ? (
          <button
            onClick={onTopUp}
            className="flex items-center gap-1 text-xs font-mono text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            title="Top up wallet"
          >
            <Wallet className="h-3.5 w-3.5" />
            {walletBalance != null ? (
              `${walletBalance.toLocaleString()} sats`
            ) : (
              <Skeleton className="h-3.5 w-12 inline-block" />
            )}
          </button>
        ) : (
          <div className="w-8" />
        )}
      </div>
      <Separator />
    </header>
  );
}
