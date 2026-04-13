import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  HomeIcon,
  BellIcon,
  UserIcon,
  SettingsIcon,
  BotIcon,
  LayersIcon,
  MoreHorizontalIcon,
  CodeIcon,
  LogInIcon,
  InfoIcon,
  GithubIcon,
} from "lucide-react";
import { LogoIcon } from "@/icons/LogoIcon";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useNetworkStats } from "../hooks/useNetworkStats";
import type { Profile } from "../types";
import { Button } from "./ui/button";
import { cn } from "@/lib/utils";

interface SidebarProps {
  loggedInPubkey: string | null;
  profile?: Profile;
  unreadNotificationCount?: number;
  mobile?: boolean;
  onLogout: () => void;
  onNavigateToAuth: () => void;
  onClose?: () => void;
}

export function Sidebar({
  loggedInPubkey,
  profile,
  unreadNotificationCount = 0,
  mobile,
  onLogout,
  onNavigateToAuth,
  onClose,
}: SidebarProps) {
  const location = useLocation();
  const navigate = useNavigate();

  function isActive(path: string) {
    if (path === "/") return location.pathname === "/";
    return location.pathname.startsWith(path);
  }

  function navClass(path: string) {
    const base =
      "flex items-center gap-3 px-4 py-2.5 rounded-full text-sm font-medium transition-colors w-full";
    return isActive(path)
      ? `${base} bg-accent text-foreground font-semibold`
      : `${base} text-muted-foreground hover:text-foreground hover:bg-accent/50`;
  }

  const initials = profile?.name
    ? profile.name.slice(0, 2).toUpperCase()
    : loggedInPubkey
      ? loggedInPubkey.slice(0, 2).toUpperCase()
      : null;

  const displayName =
    profile?.name ?? (loggedInPubkey ? loggedInPubkey.slice(0, 8) + "..." : "");

  const { feeRateMedium, blockHeight, btcPriceUsd } = useNetworkStats();
  const [statIndex, setStatIndex] = useState(0);
  const stats = [
    feeRateMedium !== null ? `${feeRateMedium.toFixed(1)} sat/vB` : null,
    blockHeight !== null ? `${blockHeight}` : null,
    btcPriceUsd !== null ? `$${btcPriceUsd.toLocaleString()}` : null,
  ];
  const statLabel = stats[statIndex];

  function handleNavClick(action: () => void) {
    action();
    onClose?.();
  }

  return (
    <div
      className={cn(
        "flex flex-col h-full py-4 gap-1 w-64",
        !mobile && "ml-8 lg:ml-48",
      )}
    >
      {/* Logo */}
      <div className="px-2 pt-2 pb-1">
        <Link to="/" className="no-underline" onClick={onClose}>
          <LogoIcon className="text-orange-400 size-8" />
        </Link>
      </div>

      {/* Stats */}
      <div className="px-2 pb-2 mb-1">
        {statLabel !== null ? (
          <button
            onClick={() => setStatIndex((i) => (i + 1) % 3)}
            className="text-xs font-mono text-muted-foreground rounded-full hover:text-foreground transition-colors"
            title="Click to cycle stats"
          >
            {statLabel}
          </button>
        ) : (
          <Skeleton className="h-5 w-16 rounded-full" />
        )}
      </div>

      {/* Nav items */}
      <button
        className={navClass("/")}
        onClick={() => handleNavClick(() => navigate("/"))}
      >
        <HomeIcon className="size-5 shrink-0" />
        Home
      </button>

      <button
        className={navClass("/notifications")}
        onClick={() =>
          handleNavClick(() =>
            loggedInPubkey ? navigate("/notifications") : navigate("/auth"),
          )
        }
      >
        <div className="relative">
          <BellIcon className="size-5 shrink-0" />
          {unreadNotificationCount > 0 && (
            <span className="absolute -top-1 -right-1 bg-orange-500 text-white text-[10px] font-bold rounded-full min-w-[16px] h-4 flex items-center justify-center px-0.5 leading-none">
              {unreadNotificationCount > 99 ? "99+" : unreadNotificationCount}
            </span>
          )}
        </div>
        Notifications
      </button>

      <button
        className={navClass("/profile")}
        onClick={() =>
          handleNavClick(() =>
            loggedInPubkey
              ? navigate(`/profile/${loggedInPubkey}`)
              : navigate("/auth"),
          )
        }
      >
        <UserIcon className="size-5 shrink-0" />
        Profile
      </button>

      <button
        className={navClass("/agents")}
        onClick={() => handleNavClick(() => navigate("/agents"))}
      >
        <BotIcon className="size-5 shrink-0" />
        Agents
      </button>

      <button
        className={navClass("/settings")}
        onClick={() => handleNavClick(() => navigate("/settings"))}
      >
        <SettingsIcon className="size-5 shrink-0" />
        Settings
      </button>

      <button
        className={navClass("/about")}
        onClick={() => handleNavClick(() => navigate("/about"))}
      >
        <InfoIcon className="size-5 shrink-0" />
        About
      </button>

      {/* External links */}
      <div className="mt-2" />

      <a
        href="https://github.com/opreturnsocial/opreturn.social"
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-3 px-4 py-2.5 rounded-full text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
        onClick={onClose}
      >
        <GithubIcon className="size-5 shrink-0" />
        Github
      </a>

      <a
        href="https://ors.dev"
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-3 px-4 py-2.5 rounded-full text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
        onClick={onClose}
      >
        <LayersIcon className="size-5 shrink-0" />
        ORS Protocol
      </a>

      {/* Bottom section */}
      <div className="mt-auto">
        {loggedInPubkey ? (
          <div className="flex items-center gap-2 px-4 py-2 rounded-full hover:bg-accent/50 transition-colors">
            {/* Avatar */}
            <div className="shrink-0">
              {profile?.avatarUrl ? (
                <img
                  src={profile.avatarUrl}
                  alt={profile.name ?? "avatar"}
                  className="h-8 w-8 rounded-full object-cover border border-border"
                />
              ) : (
                <div className="h-8 w-8 rounded-full bg-orange-500 flex items-center justify-center text-white text-xs font-bold border border-border">
                  {initials}
                </div>
              )}
            </div>
            {/* Name */}
            <span className="flex-1 min-w-0 text-sm font-medium truncate">
              {displayName}
            </span>
            {/* 3-dot menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="p-1 rounded hover:bg-accent transition-colors shrink-0">
                  <MoreHorizontalIcon className="size-4 text-muted-foreground" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" side="top">
                <DropdownMenuItem
                  onClick={() => {
                    onLogout();
                    onClose?.();
                  }}
                >
                  Log out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ) : (
          <button
            className="flex items-center gap-3 px-4 py-2.5 rounded-full text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors w-full"
            onClick={() => {
              onNavigateToAuth();
              onClose?.();
            }}
          >
            <LogInIcon className="size-5 shrink-0" />
            Log in
          </button>
        )}
      </div>
    </div>
  );
}
