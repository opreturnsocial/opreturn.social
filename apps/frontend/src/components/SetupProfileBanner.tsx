import type { Profile } from "../types";

export function SetupProfileBanner({
  loggedInPubkey,
  profile,
  onEditProfile,
}: {
  loggedInPubkey?: string | null;
  profile?: Profile;
  onEditProfile?: () => void;
}) {
  if (
    !loggedInPubkey ||
    profile?.name ||
    (localStorage.getItem("ors_wallet_funded") !== "true" &&
      !(window as unknown as { nostr?: unknown }).nostr)
  ) {
    return null;
  }

  return (
    <div className="mb-4 rounded-lg border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-800 flex items-center justify-between gap-3">
      <span>Finish setting up your profile so others can find you.</span>
      <button
        className="font-semibold underline underline-offset-2 hover:text-orange-600 whitespace-nowrap"
        onClick={onEditProfile}
      >
        Set up profile →
      </button>
    </div>
  );
}
