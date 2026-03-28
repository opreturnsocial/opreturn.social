import { useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Feed } from "../components/Feed";
import { PostForm } from "../components/PostForm";
import { SetupProfileBanner } from "../components/SetupProfileBanner";
import { useFeed } from "../hooks/useFeed";
import type { Profile } from "../types";

interface HomePageProps {
  profiles: Record<string, Profile>;
  loggedInPubkey?: string | null;
  profile?: Profile;
  onLogin?: () => Promise<string | null>;
  onEditProfile?: () => void;
  followedPubkeys?: Set<string>;
  noteOgLeaderboard?: {
    txid: string;
    rank: number;
    timestamp: number;
    pubkey: string;
    content: string;
  }[];
}

export function HomePage({
  profiles,
  loggedInPubkey,
  profile,
  onLogin,
  onEditProfile,
  followedPubkeys,
  noteOgLeaderboard,
}: HomePageProps) {
  const [tab, setTab] = useState<"global" | "following">("global");
  const [content, setContent] = useState(() => localStorage.getItem("ors_draft_post") ?? "");
  const [pendingPost, setPendingPost] = useState(() => !!localStorage.getItem("ors_pending_post"));

  const feedFilter = localStorage.getItem("ors_feed_filter") ?? "posts";
  const filter =
    tab === "following" && loggedInPubkey
      ? { viewer: loggedInPubkey, feedFilter }
      : { feedFilter };
  const { items, parentPosts, parentActivities, loading, error, refresh, loadMore, loadingMore, hasMore } = useFeed(filter);

  function handleContentChange(value: string) {
    setContent(value);
    if (value) {
      localStorage.setItem("ors_draft_post", value);
    } else {
      localStorage.removeItem("ors_draft_post");
      localStorage.removeItem("ors_pending_post");
      setPendingPost(false);
    }
  }

  const showTabs =
    !!loggedInPubkey && !!followedPubkeys && followedPubkeys.size > 0;

  const feed = (
    <Feed
      items={items}
      parentPosts={parentPosts}
      parentActivities={parentActivities}
      loading={loading}
      error={error}
      profiles={profiles}
      loggedInPubkey={loggedInPubkey}
      onRefresh={refresh}
      noteOgLeaderboard={noteOgLeaderboard}
      onLoadMore={loadMore}
      loadingMore={loadingMore}
      hasMore={hasMore}
    />
  );

  if (!showTabs) {
    return (
      <>
        <SetupProfileBanner loggedInPubkey={loggedInPubkey} profile={profile} onEditProfile={onEditProfile} />
        <PostForm
          loggedInPubkey={loggedInPubkey ?? null}
          profile={profile}
          onPosted={refresh}
          onLogin={onLogin ?? (() => Promise.resolve(null))}
          content={content}
          onContentChange={handleContentChange}
          pendingPost={pendingPost}
        />
        {feed}
      </>
    );
  }

  return (
    <Tabs
      value={tab}
      onValueChange={(v) => setTab(v as "global" | "following")}
    >
      <SetupProfileBanner loggedInPubkey={loggedInPubkey} profile={profile} onEditProfile={onEditProfile} />
      <TabsList className="mb-2">
        <TabsTrigger value="global">Global</TabsTrigger>
        <TabsTrigger value="following">Following</TabsTrigger>
      </TabsList>
      <PostForm
        loggedInPubkey={loggedInPubkey ?? null}
        profile={profile}
        onPosted={refresh}
        onLogin={onLogin ?? (() => Promise.resolve(null))}
        content={content}
        onContentChange={handleContentChange}
      />
      <TabsContent value="global" className="mt-0">
        {feed}
      </TabsContent>
      <TabsContent value="following" className="mt-0">
        {feed}
      </TabsContent>
    </Tabs>
  );
}
