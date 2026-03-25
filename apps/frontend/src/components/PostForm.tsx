import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { submitPostFree, submitPost } from "../api/facilitator";
import { payAndBroadcast } from "../lib/payment";
import {
  buildUnsignedPayload,
  buildV1SigningBody,
  getProtocolVersion,
  MAX_CONTENT_BYTES,
} from "../lib/ors";
import { signPayload } from "../lib/signing";
import type { Profile } from "../types";
import { UserIcon } from "lucide-react";

interface PostFormProps {
  loggedInPubkey: string | null;
  profile?: Profile;
  onPosted: () => void;
  onLogin: () => Promise<string | null>;
  content: string;
  onContentChange: (content: string) => void;
  pendingPost?: boolean;
}

export function PostForm({
  loggedInPubkey,
  profile,
  onPosted,
  onLogin,
  content,
  onContentChange,
  pendingPost,
}: PostFormProps) {
  const navigate = useNavigate();
  const [posting, setPosting] = useState(false);
  const [testnetFailed, setTestnetFailed] = useState(false);

  const remaining = MAX_CONTENT_BYTES - new TextEncoder().encode(content).length;

  const initials = profile?.name
    ? profile.name.slice(0, 2).toUpperCase()
    : loggedInPubkey
      ? loggedInPubkey.slice(0, 2).toUpperCase()
      : null;

  const avatar = profile?.avatarUrl ? (
    <div className="h-10 w-10 rounded-full overflow-hidden border border-border shrink-0">
      <img src={profile.avatarUrl} alt={profile.name ?? "avatar"} className="h-full w-full object-cover" />
    </div>
  ) : initials ? (
    <div className="h-10 w-10 rounded-full bg-orange-500 flex items-center justify-center text-white text-sm font-bold border border-border shrink-0">
      {initials}
    </div>
  ) : (
    <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center border border-border shrink-0">
      <UserIcon className="size-5 text-muted-foreground" />
    </div>
  );

  async function doPost(pubkey: string) {
    setPosting(true);
    setTestnetFailed(false);
    try {
      const version = getProtocolVersion();
      const v0Unsigned = buildUnsignedPayload(content.trim(), pubkey);
      const signingPayload = version === 0 ? v0Unsigned : buildV1SigningBody(v0Unsigned);
      const sig = await signPayload(signingPayload, pubkey);
      const { txid } = await submitPostFree(content.trim(), pubkey, sig, version);
      toast.success("Posted!", { description: `Testnet TXID: ${txid}` });
      onContentChange("");
      onPosted();
    } catch (err) {
      setTestnetFailed(true);
      toast.error((err as Error).message);
    } finally {
      setPosting(false);
    }
  }

  async function doPostMainnet(pubkey: string) {
    setPosting(true);
    try {
      const version = getProtocolVersion();
      const v0Unsigned = buildUnsignedPayload(content.trim(), pubkey);
      const signingPayload = version === 0 ? v0Unsigned : buildV1SigningBody(v0Unsigned);
      const sig = await signPayload(signingPayload, pubkey);
      const { invoice, paymentHash } = await submitPost(content.trim(), pubkey, sig, version);
      const { txid } = await payAndBroadcast(invoice, paymentHash);
      toast.success("Posted to mainnet!", { description: `TXID: ${txid}` });
      onContentChange("");
      setTestnetFailed(false);
      onPosted();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setPosting(false);
    }
  }

  async function handlePost() {
    if (!content.trim()) return;
    if (!loggedInPubkey) {
      if (content.trim()) localStorage.setItem("ors_pending_post", "true");
      navigate("/auth");
      return;
    }
    doPost(loggedInPubkey);
  }

  function handleContentChange(c: string) {
    setTestnetFailed(false);
    onContentChange(c);
  }

  return (
    <div className="flex justify-start items-start gap-3 py-4 px-2 border-[1px] border-b-0">
      <div className="-mt-2">{avatar}</div>
      <div className="flex-1 space-y-2">
        {pendingPost && loggedInPubkey && content.trim() && (
          <p className="text-xs text-orange-500 font-medium">
            You're signed in - tap Post to publish your draft.
          </p>
        )}
        <Textarea
          placeholder="What's worth mentioning?"
          value={content}
          onChange={(e) => handleContentChange(e.target.value)}
          rows={3}
          autoFocus
          className="resize-none border-0 shadow-none focus-visible:ring-0 p-0 text-base placeholder:text-muted-foreground"
          disabled={posting}
        />
        <div className="flex items-center justify-end gap-3">
          {remaining < 100 && (
            <span className={`text-xs ${remaining < 20 ? "text-destructive" : "text-muted-foreground"}`}>
              {remaining} chars remaining
            </span>
          )}
          {testnetFailed && loggedInPubkey && content.trim() && (
            <button
              className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
              onClick={() => doPostMainnet(loggedInPubkey)}
              disabled={posting}
            >
              Post to mainnet instead
            </button>
          )}
          <Button
            size="sm"
            onClick={handlePost}
            className="rounded-full"
            disabled={posting || !content.trim() || remaining < 0}
          >
            {posting ? "Posting…" : "Post"}
          </Button>
        </div>
      </div>
    </div>
  );
}
