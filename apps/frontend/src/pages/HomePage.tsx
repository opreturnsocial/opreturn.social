import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Feed } from "../components/Feed";
import { PostForm } from "../components/PostForm";
import { SetupProfileBanner } from "../components/SetupProfileBanner";
import { useFeed } from "../hooks/useFeed";
import { Button } from "@/components/ui/button";
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
  const navigate = useNavigate();
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

  function handleTabChange(value: string) {
    if (value === "following" && !loggedInPubkey) {
      navigate("/auth");
      return;
    }
    setTab(value as "global" | "following");
  }

  const hasFollows = !!loggedInPubkey && !!followedPubkeys && followedPubkeys.size > 0;

  const globalFeed = (
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

  const postForm = (
    <PostForm
      loggedInPubkey={loggedInPubkey ?? null}
      profile={profile}
      onPosted={refresh}
      onLogin={onLogin ?? (() => Promise.resolve(null))}
      content={content}
      onContentChange={handleContentChange}
      pendingPost={pendingPost}
    />
  );

  return (
    <Tabs value={tab} onValueChange={handleTabChange}>
      <SetupProfileBanner loggedInPubkey={loggedInPubkey} profile={profile} onEditProfile={onEditProfile} />
      <TabsList className="w-full rounded-none border-b bg-transparent p-0 h-auto mb-0">
        <TabsTrigger
          value="global"
          className="flex-1 rounded-none border-b-2 border-transparent py-3 text-sm font-medium text-muted-foreground data-[state=active]:border-orange-400 data-[state=active]:text-foreground data-[state=active]:font-semibold data-[state=active]:shadow-none data-[state=active]:bg-transparent"
        >
          Global
        </TabsTrigger>
        <TabsTrigger
          value="following"
          className="flex-1 rounded-none border-b-2 border-transparent py-3 text-sm font-medium text-muted-foreground data-[state=active]:border-orange-400 data-[state=active]:text-foreground data-[state=active]:font-semibold data-[state=active]:shadow-none data-[state=active]:bg-transparent"
        >
          Following
        </TabsTrigger>
      </TabsList>

      <TabsContent value="global" className="mt-0">
        {postForm}
        {globalFeed}
      </TabsContent>

      <TabsContent value="following" className="mt-0">
        {postForm}
        {!loggedInPubkey ? (
          <div className="flex flex-col items-center gap-3 py-16 text-muted-foreground">
            <p className="text-sm">Log in to see posts from people you follow.</p>
            <Button variant="default" onClick={() => navigate("/auth")}>Log in</Button>
          </div>
        ) : !hasFollows ? (
          <div className="flex flex-col items-center gap-3 py-16 text-muted-foreground">
            <p className="text-sm">You aren't following anyone yet.</p>
            <p className="text-xs">Find people to follow on the Global feed.</p>
          </div>
        ) : (
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
        )}
      </TabsContent>
    </Tabs>
  );
}
