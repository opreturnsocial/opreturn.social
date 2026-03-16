import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Clock, Check, Copy, ExternalLink } from "lucide-react";
import { fetchActivity } from "../api/cache";
import type { ActivityItem } from "../types";
import { useNetworkStats } from "../hooks/useNetworkStats";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { submitProfileUpdate } from "../api/facilitator";
import { payAndBroadcast } from "../lib/payment";
import {
  buildProfileUpdateUnsignedPayload,
  buildV1SigningBody,
  getProtocolVersion,
  estimatedVBytes,
} from "../lib/ors";
import { getFeeBumpSatPerVByte } from "../lib/fees";
import { signPayload } from "../lib/signing";
import type { Profile } from "../types";

const PROPERTY_NAME = 0x00;
const PROPERTY_AVATAR_URL = 0x01;
const PROPERTY_BIO = 0x02;

interface ProfileModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  loggedInPubkey: string;
  profile?: Profile;
  onProfileUpdated: () => void;
}

export function ProfileModal({
  open,
  onOpenChange,
  loggedInPubkey,
  profile,
  onProfileUpdated,
}: ProfileModalProps) {
  const [name, setName] = useState(profile?.name ?? "");
  const [bio, setBio] = useState(profile?.bio ?? "");
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatarUrl ?? "");
  const [saving, setSaving] = useState<string | null>(null);
  const [fieldActivity, setFieldActivity] = useState<Map<number, ActivityItem>>(
    new Map(),
  );
  const [copiedField, setCopiedField] = useState<number | null>(null);
  const { feeRate, btcPriceUsd } = useNetworkStats();

  function fieldCost(value: string) {
    if (feeRate === null || !value.trim()) return null;
    const valueBytes = new TextEncoder().encode(value).length;
    // kindData = propertyKind(1) + valueBytes
    const vBytes = estimatedVBytes(1 + valueBytes, getProtocolVersion());
    const effectiveFeeRate = feeRate + getFeeBumpSatPerVByte();
    const sats = Math.ceil(vBytes * effectiveFeeRate);
    const usd =
      btcPriceUsd !== null ? ((sats * btcPriceUsd) / 1e8).toFixed(2) : null;
    return { sats, usd };
  }

  useEffect(() => {
    if (open) {
      setName(profile?.name ?? "");
      setBio(profile?.bio ?? "");
      setAvatarUrl(profile?.avatarUrl ?? "");
      fetchActivity(50, 0, loggedInPubkey)
        .then((items) => {
          const map = new Map<number, ActivityItem>();
          for (const item of items) {
            if (
              item.type === "profile_update" &&
              item.propertyKind !== undefined
            ) {
              if (!map.has(item.propertyKind)) map.set(item.propertyKind, item);
            }
          }
          setFieldActivity(map);
        })
        .catch(() => {});
    }
  }, [open, profile, loggedInPubkey]);

  function TxidRow({ propertyKind }: { propertyKind: number }) {
    const item = fieldActivity.get(propertyKind);
    if (!item) return null;
    const shortTxid = `${item.txid.slice(0, 8)}...${item.txid.slice(-8)}`;
    const isPending = item.blockHeight === 0;
    return (
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-mono mt-1">
        {isPending ? (
          <Clock className="h-3 w-3 shrink-0" />
        ) : (
          <Check className="h-3 w-3 shrink-0 text-green-500" />
        )}
        <span>
          {isPending ? "In Mempool" : `Confirmed at block ${item.blockHeight}`}
        </span>
        <span className="opacity-60">{shortTxid}</span>
        <button
          className="text-muted-foreground hover:text-foreground transition-colors"
          onClick={() => {
            navigator.clipboard.writeText(item.txid);
            setCopiedField(propertyKind);
            setTimeout(() => setCopiedField(null), 1500);
          }}
        >
          {copiedField === propertyKind ? (
            <Check className="h-3 w-3 text-green-500" />
          ) : (
            <Copy className="h-3 w-3" />
          )}
        </button>
        <button
          className="text-muted-foreground hover:text-foreground transition-colors"
          onClick={() =>
            window.open(`https://mempool.space/tx/${item.txid}`, "_blank")
          }
        >
          <ExternalLink className="h-3 w-3" />
        </button>
      </div>
    );
  }

  async function saveField(
    propertyKind: number,
    value: string,
    fieldName: string,
  ) {
    if (!value.trim()) return;

    setSaving(fieldName);
    try {
      const version = getProtocolVersion();
      const v0Unsigned = buildProfileUpdateUnsignedPayload(
        propertyKind,
        value.trim(),
        loggedInPubkey,
      );
      const signingPayload =
        version === 0 ? v0Unsigned : buildV1SigningBody(v0Unsigned);
      const sig = await signPayload(signingPayload, loggedInPubkey);
      const { invoice, paymentHash } = await submitProfileUpdate(
        propertyKind,
        value.trim(),
        loggedInPubkey,
        sig,
        version,
      );
      const { txid } = await payAndBroadcast(invoice, paymentHash);

      toast.success(`${fieldName} saved`, {
        description: `TXID: ${txid}`,
      });
      onProfileUpdated();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Edit Profile</DialogTitle>
          {profile?.status === "pending" && (
            <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
              <Clock className="h-3 w-3" /> Awaiting block confirmation
            </p>
          )}
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1">
            <label className="text-sm font-medium">Name</label>
            <div className="flex gap-2">
              <Input
                placeholder="Your name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={saving !== null}
              />
              {(() => {
                const c = fieldCost(name);
                return (
                  c && (
                    <span className="text-xs text-muted-foreground font-mono self-center whitespace-nowrap">
                      ~{c.sats} sats{c.usd !== null && ` ($${c.usd})`}
                    </span>
                  )
                );
              })()}
              <Button
                size="sm"
                onClick={() => saveField(PROPERTY_NAME, name, "Name")}
                disabled={saving !== null || !name.trim()}
              >
                {saving === "Name" ? "Saving…" : "Save"}
              </Button>
            </div>
            <TxidRow propertyKind={PROPERTY_NAME} />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">Avatar URL</label>
            <div className="flex gap-2">
              <Input
                placeholder="https://example.com/avatar.png"
                value={avatarUrl}
                onChange={(e) => setAvatarUrl(e.target.value)}
                disabled={saving !== null}
              />
              {(() => {
                const c = fieldCost(avatarUrl);
                return (
                  c && (
                    <span className="text-xs text-muted-foreground font-mono self-center whitespace-nowrap">
                      ~{c.sats} sats{c.usd !== null && ` ($${c.usd})`}
                    </span>
                  )
                );
              })()}
              <Button
                size="sm"
                onClick={() =>
                  saveField(PROPERTY_AVATAR_URL, avatarUrl, "Avatar URL")
                }
                disabled={saving !== null || !avatarUrl.trim()}
              >
                {saving === "Avatar URL" ? "Saving…" : "Save"}
              </Button>
            </div>
            <TxidRow propertyKind={PROPERTY_AVATAR_URL} />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">Bio</label>
            <Textarea
              placeholder="Tell the world who you are"
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              rows={3}
              className="resize-none"
              disabled={saving !== null}
            />
            <div className="flex items-center gap-2">
              {(() => {
                const c = fieldCost(bio);
                return (
                  c && (
                    <span className="text-xs text-muted-foreground font-mono">
                      ~{c.sats} sats{c.usd !== null && ` ($${c.usd})`}
                    </span>
                  )
                );
              })()}
              <Button
                size="sm"
                onClick={() => saveField(PROPERTY_BIO, bio, "Bio")}
                disabled={saving !== null || !bio.trim()}
              >
                {saving === "Bio" ? "Saving…" : "Save Bio"}
              </Button>
            </div>
            <TxidRow propertyKind={PROPERTY_BIO} />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
