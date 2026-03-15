import { useState, useEffect } from "react";
import {
  Routes,
  Route,
  Navigate,
  useNavigate,
  useParams,
} from "react-router-dom";

function TxRedirect() {
  const { txid } = useParams<{ txid: string }>();
  return <Navigate to={`/tx/${txid}`} replace />;
}
import { Toaster } from "sonner";
import { Header } from "./components/Header";
import { ProfileModal } from "./components/ProfileModal";
import { WalletFundingView } from "./components/WalletFundingView";
import { HomePage } from "./pages/HomePage";
import { TxPage } from "./pages/TxPage";
import { ProfilePage } from "./pages/ProfilePage";
import { AuthPage } from "./pages/AuthPage";
import { SettingsPage } from "./pages/SettingsPage";
import { useFeed } from "./hooks/useFeed";
import { useWalletBalance } from "./hooks/useWalletBalance";
import {
  fetchProfiles,
  fetchFollows,
  fetchNoteOgRanks,
  fetchActivity,
} from "./api/cache";
import { getNostrExtPubkey } from "./lib/nostr";
import type { Profile, ActivityItem } from "./types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "./components/ui/dialog";
import { DialogDescription } from "@radix-ui/react-dialog";

export function App() {
  const navigate = useNavigate();
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [fundWalletOpen, setFundWalletOpen] = useState(false);
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  const [loggedInPubkey, setLoggedInPubkey] = useState<string | null>(null);
  const [walletFunded, setWalletFunded] = useState(() => {
    const hasLocalPrivkey = !!localStorage.getItem("ors_local_privkey");
    const hasNwcUrl = !!localStorage.getItem("ors_nwc_url");
    // Pure extension users (no local key, no NWC) don't need a wallet
    if (!hasLocalPrivkey && !hasNwcUrl) return true;
    return localStorage.getItem("ors_wallet_funded") === "true";
  });
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [activityItems, setActivityItems] = useState<ActivityItem[]>([]);
  const [noteOgLeaderboard, setNoteOgLeaderboard] = useState<
    {
      txid: string;
      rank: number;
      timestamp: number;
      pubkey: string;
      content: string;
    }[]
  >([]);
  const [followedPubkeys, setFollowedPubkeys] = useState<Set<string>>(
    new Set(),
  );
  const [pendingFollowPubkeys, setPendingFollowPubkeys] = useState<Set<string>>(
    new Set(),
  );
  const { posts, loading, error, refresh } = useFeed();
  const [walletBalance, refreshWalletBalance] = useWalletBalance();

  async function refreshProfiles() {
    try {
      const list = await fetchProfiles();
      setProfiles(Object.fromEntries(list.map((p) => [p.pubkey, p])));
    } catch {
      // silently ignore profile fetch failures
    }
  }

  async function refreshNoteOgRanks() {
    try {
      const notes = await fetchNoteOgRanks();
      setNoteOgLeaderboard(notes);
    } catch {
      // silently ignore
    }
  }

  async function refreshActivity() {
    try {
      const items = await fetchActivity();
      setActivityItems(items);
    } catch {
      // silently ignore
    }
  }

  useEffect(() => {
    refreshProfiles();
    refreshNoteOgRanks();
    refreshActivity();
    const saved = localStorage.getItem("ors_pubkey");
    if (saved) {
      setLoggedInPubkey(saved);
      refreshFollows(saved);
    }
  }, []);

  async function refreshFollows(pubkey: string) {
    try {
      const { pubkeys, pendingPubkeys } = await fetchFollows(pubkey);
      setFollowedPubkeys(new Set([...pubkeys, ...pendingPubkeys]));
      setPendingFollowPubkeys(new Set(pendingPubkeys));
    } catch {
      // silently ignore
    }
  }

  useEffect(() => {
    if (!loggedInPubkey) return;
    const interval = setInterval(() => refreshFollows(loggedInPubkey), 5000);
    return () => clearInterval(interval);
  }, [loggedInPubkey]);

  async function handleLogin(): Promise<string | null> {
    const pubkey = await getNostrExtPubkey();
    if (!pubkey) return null;
    setLoggedInPubkey(pubkey);
    localStorage.setItem("ors_pubkey", pubkey);
    refreshFollows(pubkey);
    return pubkey;
  }

  async function handleLoginAndRedirect() {
    const pubkey = await handleLogin();
    if (pubkey) navigate("/");
  }

  function handleLocalLoginAndRedirect(pubkey: string) {
    setLoggedInPubkey(pubkey);
    refreshFollows(pubkey);
    navigate("/");
  }

  function handleLoginComplete() {
    const pubkey = localStorage.getItem("ors_pubkey")!;
    setLoggedInPubkey(pubkey);
    setWalletFunded(true);
    refreshFollows(pubkey);
    navigate("/");
  }

  function handleLogout() {
    setLoggedInPubkey(null);
    localStorage.removeItem("ors_pubkey");
    localStorage.removeItem("ors_nwc_url");
    localStorage.removeItem("ors_nwc_user_provided");
    localStorage.removeItem("ors_wallet_funded");
    setWalletFunded(false);
    setFollowedPubkeys(new Set());
    setPendingFollowPubkeys(new Set());
    navigate("/");
  }

  function handleLogoutRequest() {
    const hasLocalKey = !!localStorage.getItem("ors_local_privkey");
    const hasNwcUrl = !!localStorage.getItem("ors_nwc_url");
    if (hasLocalKey || hasNwcUrl) {
      setLogoutConfirmOpen(true);
    } else {
      handleLogout();
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <Routes>
        <Route
          path="/auth"
          element={
            loggedInPubkey ? (
              <Navigate to="/" replace />
            ) : (
              <AuthPage
                onLoginWithExtension={handleLoginAndRedirect}
                onQuickStartComplete={handleLocalLoginAndRedirect}
                onLoginComplete={handleLoginComplete}
              />
            )
          }
        />
        <Route
          path="/*"
          element={
            <>
              <Header
                loggedInPubkey={loggedInPubkey}
                profile={loggedInPubkey ? profiles[loggedInPubkey] : undefined}
                walletBalance={walletBalance}
                onNavigateToAuth={() => navigate("/auth")}
                onEditProfile={() => setProfileModalOpen(true)}
                onViewProfile={() =>
                  loggedInPubkey && navigate(`/profile/${loggedInPubkey}`)
                }
                onSettings={() => navigate("/settings")}
                onLogout={handleLogoutRequest}
                onTopUp={
                  loggedInPubkey ? () => setFundWalletOpen(true) : undefined
                }
              />
              {loggedInPubkey && !walletFunded && !(window as any).webln && (
                <div className="bg-orange-50 border-b border-orange-200 px-4 py-2.5 flex items-center justify-center gap-3 text-sm text-orange-800">
                  <span>
                    Your wallet isn't funded yet - you won't be able to post.
                  </span>
                  <button
                    className="font-semibold underline underline-offset-2 hover:text-orange-600"
                    onClick={() => setFundWalletOpen(true)}
                  >
                    Fund wallet →
                  </button>
                </div>
              )}
              <main className="container max-w-2xl mx-auto px-4 py-6">
                <Routes>
                  <Route
                    path="/"
                    element={
                      <HomePage
                        posts={posts}
                        loading={loading}
                        error={error}
                        profiles={profiles}
                        loggedInPubkey={loggedInPubkey}
                        profile={
                          loggedInPubkey ? profiles[loggedInPubkey] : undefined
                        }
                        onLogin={handleLogin}
                        onRefresh={refresh}
                        onEditProfile={() => setProfileModalOpen(true)}
                        followedPubkeys={followedPubkeys}
                        activityItems={activityItems}
                        noteOgLeaderboard={noteOgLeaderboard}
                      />
                    }
                  />
                  <Route
                    path="/tx/:txid"
                    element={
                      <TxPage
                        profiles={profiles}
                        loggedInPubkey={loggedInPubkey}
                        allPosts={posts}
                        allActivityItems={activityItems}
                        noteOgLeaderboard={noteOgLeaderboard}
                      />
                    }
                  />
                  <Route path="/post/:txid" element={<TxRedirect />} />
                  <Route path="/activity/:txid" element={<TxRedirect />} />
                  <Route path="/settings" element={<SettingsPage />} />
                  <Route
                    path="/profile/:pubkey"
                    element={
                      <ProfilePage
                        profiles={profiles}
                        allPosts={posts}
                        allActivityItems={activityItems}
                        loggedInPubkey={loggedInPubkey}
                        followedPubkeys={followedPubkeys}
                        pendingFollowPubkeys={pendingFollowPubkeys}
                        onFollowChange={() =>
                          loggedInPubkey && refreshFollows(loggedInPubkey)
                        }
                        noteOgLeaderboard={noteOgLeaderboard}
                      />
                    }
                  />
                </Routes>
              </main>
              {loggedInPubkey && (
                <ProfileModal
                  open={profileModalOpen}
                  onOpenChange={setProfileModalOpen}
                  loggedInPubkey={loggedInPubkey}
                  profile={profiles[loggedInPubkey]}
                  onProfileUpdated={refreshProfiles}
                />
              )}
              <Dialog open={fundWalletOpen} onOpenChange={setFundWalletOpen}>
                <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto overflow-x-hidden">
                  <DialogHeader>
                    <DialogTitle>Fund your wallet</DialogTitle>
                    {localStorage
                      .getItem("ors_nwc_url")
                      ?.includes("lncurl") && (
                      <DialogDescription>
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
                      </DialogDescription>
                    )}
                  </DialogHeader>
                  <WalletFundingView
                    showTitle={false}
                    allowAmountEdit={true}
                    onComplete={() => {
                      setWalletFunded(true);
                      setFundWalletOpen(false);
                      refreshWalletBalance();
                    }}
                  />
                </DialogContent>
              </Dialog>
              <Dialog
                open={logoutConfirmOpen}
                onOpenChange={setLogoutConfirmOpen}
              >
                <DialogContent className="max-w-sm">
                  <DialogHeader>
                    <DialogTitle>Log out?</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-3 text-sm text-muted-foreground">
                    <p>
                      Your keys will be permanently deleted from this browser.
                    </p>
                    <p>
                      Back up your private key and wallet in Settings before
                      logging out.
                    </p>
                  </div>
                  <div className="flex gap-2 justify-end mt-4">
                    <button
                      className="px-4 py-2 rounded-md border border-input text-sm hover:bg-accent transition-colors"
                      onClick={() => setLogoutConfirmOpen(false)}
                    >
                      Cancel
                    </button>
                    <button
                      className="px-4 py-2 rounded-md bg-destructive text-destructive-foreground text-sm hover:bg-destructive/90 transition-colors"
                      onClick={() => {
                        handleLogout();
                        setLogoutConfirmOpen(false);
                      }}
                    >
                      Log out anyway
                    </button>
                  </div>
                </DialogContent>
              </Dialog>
            </>
          }
        />
      </Routes>
      <Toaster position="bottom-right" />
    </div>
  );
}
