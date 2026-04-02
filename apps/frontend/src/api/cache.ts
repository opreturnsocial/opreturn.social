import type { Post, Profile, ActivityItem, FeedItem } from "../types";

const BASE_URL = import.meta.env.VITE_CACHE_SERVER_URL ?? "http://localhost:3001";

export async function fetchPosts(limit = 50, offset = 0, pubkey?: string): Promise<Post[]> {
  let url = `${BASE_URL}/posts?limit=${limit}&offset=${offset}`;
  if (pubkey) url += `&pubkey=${pubkey}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Cache server error: ${res.status}`);
  const data = (await res.json()) as { posts: Post[] };
  return data.posts;
}

export async function fetchPost(txid: string): Promise<Post> {
  const res = await fetch(`${BASE_URL}/posts/${txid}`);
  if (!res.ok) throw new Error(`Cache server error: ${res.status}`);
  return res.json() as Promise<Post>;
}

export async function fetchReplies(txid: string): Promise<Post[]> {
  const res = await fetch(`${BASE_URL}/posts/${txid}/replies`);
  if (!res.ok) throw new Error(`Cache server error: ${res.status}`);
  const data = (await res.json()) as { posts: Post[] };
  return data.posts;
}

export interface FollowRecord { pubkey: string; txid: string; blockHeight: number; status: string; network?: string }

export async function fetchFollows(pubkey: string): Promise<{ pubkeys: string[]; pendingPubkeys: string[]; follows: FollowRecord[] }> {
  const res = await fetch(`${BASE_URL}/follows/${pubkey}`);
  if (!res.ok) throw new Error(`Cache server error: ${res.status}`);
  const data = (await res.json()) as { pubkeys: string[]; pendingPubkeys: string[]; follows: FollowRecord[] };
  return { pubkeys: data.pubkeys, pendingPubkeys: data.pendingPubkeys ?? [], follows: data.follows ?? [] };
}

export async function fetchFollowers(pubkey: string): Promise<{ pubkeys: string[]; pendingPubkeys: string[]; follows: FollowRecord[] }> {
  const res = await fetch(`${BASE_URL}/followers/${pubkey}`);
  if (!res.ok) throw new Error(`Cache server error: ${res.status}`);
  const data = (await res.json()) as { pubkeys: string[]; pendingPubkeys: string[]; follows: FollowRecord[] };
  return { pubkeys: data.pubkeys, pendingPubkeys: data.pendingPubkeys ?? [], follows: data.follows ?? [] };
}

export async function fetchProfiles(): Promise<Profile[]> {
  const res = await fetch(`${BASE_URL}/profiles`);
  if (!res.ok) throw new Error(`Cache server error: ${res.status}`);
  const data = (await res.json()) as { profiles: Profile[] };
  return data.profiles;
}

export async function fetchActivityItem(txid: string): Promise<ActivityItem> {
  const res = await fetch(`${BASE_URL}/activity/${txid}`);
  if (!res.ok) throw new Error(`Cache server error: ${res.status}`);
  return res.json() as Promise<ActivityItem>;
}

export async function fetchActivity(limit = 50, offset = 0, pubkey?: string, type?: string): Promise<ActivityItem[]> {
  let url = `${BASE_URL}/activity?limit=${limit}&offset=${offset}`;
  if (pubkey) url += `&pubkey=${pubkey}`;
  if (type) url += `&type=${encodeURIComponent(type)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Cache server error: ${res.status}`);
  const data = (await res.json()) as { items: ActivityItem[] };
  return data.items;
}

export async function fetchFeed(
  limit = 20,
  offset = 0,
  filter?: { pubkey?: string; viewer?: string; feedFilter?: string },
): Promise<{ items: FeedItem[]; parentPosts: Post[]; parentActivities: ActivityItem[]; hasMore: boolean }> {
  let url = `${BASE_URL}/feed?limit=${limit}&offset=${offset}`;
  if (filter?.pubkey) url += `&pubkey=${encodeURIComponent(filter.pubkey)}`;
  if (filter?.viewer) url += `&viewer=${encodeURIComponent(filter.viewer)}`;
  if (filter?.feedFilter) url += `&feedFilter=${encodeURIComponent(filter.feedFilter)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Cache server error: ${res.status}`);
  const data = await res.json() as { items: FeedItem[]; parentPosts?: Post[]; parentActivities?: ActivityItem[]; hasMore?: boolean };
  return { items: data.items, parentPosts: data.parentPosts ?? [], parentActivities: data.parentActivities ?? [], hasMore: data.hasMore ?? false };
}

export async function fetchOgLeaderboard(): Promise<{ pubkey: string; rank: number; firstTimestamp: number }[]> {
  const res = await fetch(`${BASE_URL}/og`);
  if (!res.ok) throw new Error(`Cache server error: ${res.status}`);
  const data = (await res.json()) as { leaderboard: { pubkey: string; rank: number; firstTimestamp: number }[] };
  return data.leaderboard;
}

export async function fetchRepLeaderboard(): Promise<{ pubkey: string; rep: number; rank: number }[]> {
  const res = await fetch(`${BASE_URL}/rep`);
  if (!res.ok) throw new Error(`Cache server error: ${res.status}`);
  const data = (await res.json()) as { leaderboard: { pubkey: string; rep: number; rank: number }[] };
  return data.leaderboard;
}

export async function fetchNoteOgRanks(): Promise<{ txid: string; rank: number; timestamp: number; pubkey: string; content: string }[]> {
  const res = await fetch(`${BASE_URL}/og/notes`);
  if (!res.ok) throw new Error(`Cache server error: ${res.status}`);
  const data = (await res.json()) as { notes: { txid: string; rank: number; timestamp: number; pubkey: string; content: string }[] };
  return data.notes;
}
