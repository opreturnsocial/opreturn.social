import { useState } from "react";
import { CornerDownLeftIcon, User, Wallet } from "lucide-react";
import { Link } from "react-router-dom";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useNetworkStats } from "../hooks/useNetworkStats";
import type { Profile } from "../types";
import { LogoIcon } from "@/icons/LogoIcon";

interface HeaderProps {
  loggedInPubkey: string | null;
  profile?: Profile;
  walletBalance?: number | null;
  onNavigateToAuth: () => void;
  onEditProfile: () => void;
  onViewProfile: () => void;
  onSettings: () => void;
  onLogout: () => void;
  onTopUp?: () => void;
}

export function Header({
  loggedInPubkey,
  profile,
  walletBalance,
  onNavigateToAuth,
  onEditProfile,
  onViewProfile,
  onSettings,
  onLogout,
  onTopUp,
}: HeaderProps) {
  const { feeRate, blockHeight, btcPriceUsd } = useNetworkStats();
  const [statIndex, setStatIndex] = useState(0);

  const stats = [
    feeRate !== null ? `${feeRate.toFixed(1)} sat/vB` : null,
    blockHeight !== null ? `${blockHeight}` : null,
    btcPriceUsd !== null ? `$${btcPriceUsd.toLocaleString()}` : null,
  ];
  const statLabel = stats[statIndex];

  const initials = profile?.name
    ? profile.name.slice(0, 2).toUpperCase()
    : loggedInPubkey
      ? loggedInPubkey.slice(0, 2).toUpperCase()
      : null;

  const avatarButton = profile?.avatarUrl ? (
    <div className="h-8 w-8 rounded-full overflow-hidden border border-border cursor-pointer">
      <img
        src={profile.avatarUrl}
        alt={profile.name ?? "avatar"}
        className="h-full w-full object-cover"
      />
    </div>
  ) : (
    <div className="h-8 w-8 rounded-full bg-orange-500 flex items-center justify-center text-white text-xs font-bold border border-border cursor-pointer">
      {initials}
    </div>
  );

  return (
    <header className="sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
        <Link to="/" className="no-underline">
          <span className="text-xs text-muted-foreground">
            <LogoIcon className="text-orange-400 size-8" />
          </span>
        </Link>
        {statLabel !== null ? (
          <button
            onClick={() => setStatIndex((i) => (i + 1) % 3)}
            className="text-xs font-mono text-muted-foreground bg-muted px-2 py-0.5 rounded-full hover:text-foreground transition-colors"
            title="Click to cycle stats"
          >
            {statLabel}
          </button>
        ) : (
          <Skeleton className="h-5 w-16 rounded-full" />
        )}
        <div className="flex items-center gap-3">
          {loggedInPubkey !== null &&
            walletBalance != null &&
            (onTopUp ? (
              <button
                onClick={onTopUp}
                className="flex items-center gap-1 text-xs font-mono text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                title="Top up wallet"
              >
                <Wallet className="h-3.5 w-3.5" />
                {walletBalance.toLocaleString()} sats
              </button>
            ) : (
              <span className="flex items-center gap-1 text-xs font-mono text-muted-foreground">
                <Wallet className="h-3.5 w-3.5" />
                {walletBalance.toLocaleString()} sats
              </span>
            ))}
          {loggedInPubkey === null ? (
            <button
              onClick={onNavigateToAuth}
              className="h-8 w-8 rounded-full border border-border flex items-center justify-center hover:bg-accent transition-colors"
              title="Log in"
            >
              <User className="h-4 w-4 text-muted-foreground" />
            </button>
          ) : (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>{avatarButton}</DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={onViewProfile}>
                  View Profile
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onEditProfile}>
                  Edit Profile
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onSettings}>
                  Settings
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <a href="https://ors.dev" target="_blank" rel="noopener noreferrer">
                    ORS Protocol
                  </a>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onLogout}>Logout</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>
      <Separator />
    </header>
  );
}
