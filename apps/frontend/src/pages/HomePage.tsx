import { useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Feed } from "../components/Feed";
import { PostForm } from "../components/PostForm";
import { SetupProfileBanner } from "../components/SetupProfileBanner";
import type { Post, Profile, ActivityItem } from "../types";

interface HomePageProps {
  posts: Post[];
  loading: boolean;
  error: string | null;
  profiles: Record<string, Profile>;
  loggedInPubkey?: string | null;
  profile?: Profile;
  onLogin?: () => Promise<string | null>;
  onRefresh?: () => void;
  onEditProfile?: () => void;
  followedPubkeys?: Set<string>;
  activityItems?: ActivityItem[];
  noteOgLeaderboard?: {
    txid: string;
    rank: number;
    timestamp: number;
    pubkey: string;
    content: string;
  }[];
}

export function HomePage({
  posts,
  loading,
  error,
  profiles,
  loggedInPubkey,
  profile,
  onLogin,
  onRefresh,
  onEditProfile,
  followedPubkeys,
  activityItems,
  noteOgLeaderboard,
}: HomePageProps) {
  const [tab, setTab] = useState<"global" | "following">("global");
  const [content, setContent] = useState("");

  const showTabs =
    !!loggedInPubkey && !!followedPubkeys && followedPubkeys.size > 0;

  if (!showTabs) {
    return (
      <>
        <SetupProfileBanner loggedInPubkey={loggedInPubkey} profile={profile} onEditProfile={onEditProfile} />
        <PostForm
          loggedInPubkey={loggedInPubkey ?? null}
          profile={profile}
          onPosted={onRefresh ?? (() => {})}
          onLogin={onLogin ?? (() => Promise.resolve(null))}
          content={content}
          onContentChange={setContent}
        />
        <Feed
          posts={posts}
          loading={loading}
          error={error}
          profiles={profiles}
          loggedInPubkey={loggedInPubkey}
          onRefresh={onRefresh}
          activityItems={activityItems}
          noteOgLeaderboard={noteOgLeaderboard}
        />
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
        onPosted={onRefresh ?? (() => {})}
        onLogin={onLogin ?? (() => Promise.resolve(null))}
        content={content}
        onContentChange={setContent}
      />
      <TabsContent value="global" className="mt-0">
        <Feed
          posts={posts}
          loading={loading}
          error={error}
          profiles={profiles}
          loggedInPubkey={loggedInPubkey}
          onRefresh={onRefresh}
          activityItems={activityItems}
          noteOgLeaderboard={noteOgLeaderboard}
        />
      </TabsContent>
      <TabsContent value="following">
        <Feed
          posts={posts}
          loading={loading}
          error={error}
          profiles={profiles}
          loggedInPubkey={loggedInPubkey}
          onRefresh={onRefresh}
          tab="following"
          followedPubkeys={followedPubkeys}
          activityItems={activityItems}
          noteOgLeaderboard={noteOgLeaderboard}
        />
      </TabsContent>
    </Tabs>
  );
}
