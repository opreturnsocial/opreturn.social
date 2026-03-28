export interface Post {
  txid: string;
  network?: string;
  blockHeight: number;
  timestamp: number;
  content: string;
  kind: number;
  pubkey: string;
  sig: string;
  parentTxid?: string | null;
  status: string;
  replyCount?: number;
  repostCount?: number;
}

export interface Profile {
  pubkey: string;
  name?: string | null;
  bio?: string | null;
  avatarUrl?: string | null;
  status?: string;
}

export interface ActivityItem {
  type: "follow" | "unfollow" | "profile_update";
  txid: string;
  network?: string;
  pubkey: string;
  timestamp: number;
  blockHeight: number;
  status: string;
  targetPubkey?: string;
  propertyKind?: number;
  value?: string;
}

export type FeedItem =
  | ({ feedType: "post" } & Post)
  | ({ feedType: "activity" } & ActivityItem);

async function get<T>(url: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url);
  } catch (err) {
    throw new Error(`Failed to reach cache server at ${url}: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (!res.ok) {
    const err = (await res.json().catch(() => ({ error: `Cache server error: ${res.status}` }))) as { error: string };
    throw new Error(err.error ?? `Cache server error: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export async function fetchFeed(
  cacheUrl: string,
  opts: { limit?: number; offset?: number; pubkey?: string; viewer?: string; feedFilter?: string },
): Promise<{ items: FeedItem[]; parentPosts: Post[]; parentActivities: ActivityItem[] }> {
  const { limit = 20, offset = 0, pubkey, viewer, feedFilter } = opts;
  let url = `${cacheUrl}/feed?limit=${limit}&offset=${offset}`;
  if (pubkey) url += `&pubkey=${encodeURIComponent(pubkey)}`;
  if (viewer) url += `&viewer=${encodeURIComponent(viewer)}`;
  if (feedFilter) url += `&feedFilter=${encodeURIComponent(feedFilter)}`;
  const data = await get<{ items: FeedItem[]; parentPosts?: Post[]; parentActivities?: ActivityItem[] }>(url);
  return {
    items: data.items,
    parentPosts: data.parentPosts ?? [],
    parentActivities: data.parentActivities ?? [],
  };
}

export async function fetchPost(txid: string, cacheUrl: string): Promise<Post> {
  return get<Post>(`${cacheUrl}/posts/${txid}`);
}

export async function fetchReplies(txid: string, cacheUrl: string): Promise<Post[]> {
  const data = await get<{ posts: Post[] }>(`${cacheUrl}/posts/${txid}/replies`);
  return data.posts;
}

export async function fetchProfiles(cacheUrl: string): Promise<Profile[]> {
  const data = await get<{ profiles: Profile[] }>(`${cacheUrl}/profiles`);
  return data.profiles;
}

export async function fetchProfileByPubkey(pubkey: string, cacheUrl: string): Promise<Profile | null> {
  const profiles = await fetchProfiles(cacheUrl);
  return profiles.find((p) => p.pubkey === pubkey) ?? null;
}
