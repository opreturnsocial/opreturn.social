import type { Post, Profile } from "../types";

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

export interface FollowRecord { pubkey: string; txid: string; blockHeight: number; status: string }

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

export async function fetchOgLeaderboard(): Promise<{ pubkey: string; rank: number; firstTimestamp: number }[]> {
  const res = await fetch(`${BASE_URL}/og`);
  if (!res.ok) throw new Error(`Cache server error: ${res.status}`);
  const data = (await res.json()) as { leaderboard: { pubkey: string; rank: number; firstTimestamp: number }[] };
  return data.leaderboard;
}

export async function fetchNoteOgRanks(): Promise<{ txid: string; rank: number; timestamp: number; pubkey: string; content: string }[]> {
  const res = await fetch(`${BASE_URL}/og/notes`);
  if (!res.ok) throw new Error(`Cache server error: ${res.status}`);
  const data = (await res.json()) as { notes: { txid: string; rank: number; timestamp: number; pubkey: string; content: string }[] };
  return data.notes;
}
