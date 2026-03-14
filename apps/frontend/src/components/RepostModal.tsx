import { useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { submitRepost, submitQuoteRepost } from "../api/facilitator";
import { payAndBroadcast } from "../lib/payment";
import {
  buildRepostUnsignedPayload,
  buildQuoteRepostUnsignedPayload,
  buildV1SigningBody,
  getProtocolVersion,
  MAX_CONTENT_BYTES,
} from "../lib/ors";
import { signPayload } from "../lib/signing";
import type { Post } from "../types";

interface RepostModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onReposted: () => void;
  post: Post;
  loggedInPubkey: string | null;
}

export function RepostModal({
  open,
  onOpenChange,
  onReposted,
  post,
  loggedInPubkey,
}: RepostModalProps) {
  const [quote, setQuote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const isQuote = quote.trim().length > 0;
  const remaining = MAX_CONTENT_BYTES - new TextEncoder().encode(quote).length;

  async function handleSubmit() {
    if (!loggedInPubkey) return;

    setSubmitting(true);
    try {
      const pubkey = loggedInPubkey;
      const version = getProtocolVersion();

      let v0Unsigned: Uint8Array<ArrayBuffer>;
      if (isQuote) {
        v0Unsigned = buildQuoteRepostUnsignedPayload(quote.trim(), pubkey, post.txid);
      } else {
        v0Unsigned = buildRepostUnsignedPayload(pubkey, post.txid);
      }

      const signingPayload = version === 0 ? v0Unsigned : buildV1SigningBody(v0Unsigned);
      const sig = await signPayload(signingPayload, pubkey);

      let invoiceRes;
      if (isQuote) {
        invoiceRes = await submitQuoteRepost(quote.trim(), pubkey, sig, post.txid, version);
      } else {
        invoiceRes = await submitRepost(pubkey, sig, post.txid, version);
      }
      const { txid } = await payAndBroadcast(invoiceRes.invoice, invoiceRes.paymentHash);

      toast.success(
        `${isQuote ? "Quote reposted" : "Reposted"}! ${txid.slice(0, 16)}…`,
      );
      setQuote("");
      onOpenChange(false);
      onReposted();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Repost</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="rounded-md border p-3 text-sm text-muted-foreground bg-muted/30">
            <p className="font-mono text-xs mb-1">{post.txid.slice(0, 16)}…</p>
            <p className="whitespace-pre-wrap break-words line-clamp-3">
              {post.content}
            </p>
          </div>
          <Textarea
            placeholder="Add a comment to quote repost (optional)"
            value={quote}
            onChange={(e) => setQuote(e.target.value)}
            rows={3}
            className="resize-none"
            disabled={submitting}
          />
          {remaining < 100 && (
            <p className={`text-xs text-right ${remaining < 20 ? "text-destructive" : "text-muted-foreground"}`}>
              {remaining} chars remaining
            </p>
          )}
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting || remaining < 0}>
            {submitting ? "Posting…" : isQuote ? "Quote Repost" : "Repost"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
