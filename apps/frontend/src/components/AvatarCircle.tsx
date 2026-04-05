import type { Profile } from "../types";

interface AvatarCircleProps {
  profile?: Profile;
  pubkey: string;
  size?: "sm" | "md";
}

export function AvatarCircle({ profile, pubkey, size = "sm" }: AvatarCircleProps) {
  const dim = size === "md" ? "h-8 w-8" : "h-7 w-7";
  if (profile?.avatarUrl) {
    return (
      <img
        src={profile.avatarUrl}
        alt={profile.name ?? pubkey.slice(0, 4)}
        className={`${dim} rounded-full object-cover border border-border flex-shrink-0`}
      />
    );
  }
  const initials = profile?.name
    ? profile.name.slice(0, 2).toUpperCase()
    : pubkey.slice(0, 2).toUpperCase();
  return (
    <div className={`${dim} rounded-full bg-orange-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0`}>
      {initials}
    </div>
  );
}
