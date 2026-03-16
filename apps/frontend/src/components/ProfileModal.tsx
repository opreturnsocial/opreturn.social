import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Clock } from "lucide-react";
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
    }
  }, [open, profile]);

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

      toast.success("${fieldName} saved", {
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
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
