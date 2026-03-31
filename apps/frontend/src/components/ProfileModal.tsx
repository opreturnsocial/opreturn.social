import { useState, useEffect } from "react";
import { toast } from "sonner";
import { mempoolTxUrl, isFreeNetwork, FREE_NETWORK } from "@/lib/utils";
import { BoxIcon, Clock, Check, Copy, ExternalLink, AlertTriangle } from "lucide-react";
import { fetchActivity } from "../api/cache";
import type { ActivityItem } from "../types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { submitProfileUpdateFree } from "../api/facilitator";
import { MakePermanentButton } from "./MakePermanentButton";
import {
  buildProfileUpdateUnsignedPayload,
  buildV1SigningBody,
  getProtocolVersion,
} from "../lib/ors";
import { signPayload } from "../lib/signing";
import type { Profile } from "../types";

const PROFILE_PROPERTY_NAME = 0x00;
const PROFILE_PROPERTY_AVATAR_URL = 0x01;
const PROFILE_PROPERTY_BIO = 0x02;

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
  const [showOrsWarning, setShowOrsWarning] = useState(false);
  const [fieldActivity, setFieldActivity] = useState<Map<number, ActivityItem>>(
    new Map(),
  );
  const [copiedField, setCopiedField] = useState<number | null>(null);

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

  function TxidRow({
    propertyKind,
    content,
  }: {
    propertyKind: number;
    content: string;
  }) {
    const item = fieldActivity.get(propertyKind);
    if (!item) return null;
    const shortTxid = `${item.txid.slice(0, 8)}...`;
    const isPending = item.blockHeight === 0;
    return (
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-mono mt-1">
        {isPending ? (
          <Clock className="h-3 w-3 shrink-0" />
        ) : (
          <Check className="h-3 w-3 shrink-0 text-green-500" />
        )}
        <span>
          {isFreeNetwork(item.network)
            ? isPending
              ? `${item.network} · in mempool`
              : `${item.network} · block ${item.blockHeight.toLocaleString()}`
            : isPending
              ? "in mempool"
              : `block ${item.blockHeight.toLocaleString()}`}
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
          onClick={() => {
            window.open(mempoolTxUrl(item.txid, item.network), "_blank");
          }}
        >
          <ExternalLink className="h-3 w-3" />
        </button>
        {isFreeNetwork(item.network) ? (
          <MakePermanentButton
            actionType="profile"
            pubkey={loggedInPubkey}
            propertyKind={propertyKind}
            content={content}
            disabled={!content.trim() || saving !== null}
            onSuccess={onProfileUpdated}
          />
        ) : (
          <span title="On-chain bitcoin transaction">
            <BoxIcon className="h-3 w-3 text-orange-500 shrink-0" />
          </span>
        )}
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
      const { txid } = await submitProfileUpdateFree(
        propertyKind,
        value.trim(),
        loggedInPubkey,
        sig,
        version,
      );

      toast.success(`${fieldName} saved`, {
        action: {
          label: "View on mempool",
          onClick: () =>
            window.open(mempoolTxUrl(txid, FREE_NETWORK), "_blank"),
        },
      });
      onProfileUpdated();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(null);
    }
  }

  return (
    <>
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
                <Button
                  size="sm"
                  onClick={() => saveField(PROFILE_PROPERTY_NAME, name, "Name")}
                  disabled={
                    saving !== null ||
                    !name.trim() ||
                    name.trim() === (profile?.name ?? "").trim()
                  }
                >
                  {saving === "Name" ? "Saving…" : "Save"}
                </Button>
              </div>
              <TxidRow propertyKind={PROFILE_PROPERTY_NAME} content={name} />
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium">
                Avatar URL{" "}
                <a
                  href="https://ors.sh"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-orange-500 hover:underline font-normal"
                >
                  Use ors.sh
                </a>
              </label>
              <div className="flex gap-2">
                <Input
                  placeholder="https://example.com/avatar.png"
                  value={avatarUrl}
                  onChange={(e) => setAvatarUrl(e.target.value)}
                  disabled={saving !== null}
                />
                <Button
                  size="sm"
                  onClick={() => {
                    if (
                      avatarUrl.trim() &&
                      !avatarUrl.startsWith("https://ors.sh/")
                    ) {
                      setShowOrsWarning(true);
                    } else {
                      saveField(
                        PROFILE_PROPERTY_AVATAR_URL,
                        avatarUrl,
                        "Avatar URL",
                      );
                    }
                  }}
                  disabled={
                    saving !== null ||
                    !avatarUrl.trim() ||
                    avatarUrl.trim() === (profile?.avatarUrl ?? "").trim()
                  }
                >
                  {saving === "Avatar URL" ? "Saving…" : "Save"}
                </Button>
              </div>
              {avatarUrl.trim() && !avatarUrl.startsWith("https://ors.sh/") && (
                <div className="text-xs text-amber-600">
                  <p className="flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" />
                    Consider using{" "}
                    <a
                      href="https://ors.sh"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline"
                    >
                      ors.sh
                    </a>
                    <br />
                  </p>
                  <p>
                    You can update the link later without a new transaction.
                  </p>
                </div>
              )}
              <TxidRow
                propertyKind={PROFILE_PROPERTY_AVATAR_URL}
                content={avatarUrl}
              />
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
                <Button
                  size="sm"
                  onClick={() => saveField(PROFILE_PROPERTY_BIO, bio, "Bio")}
                  disabled={
                    saving !== null ||
                    !bio.trim() ||
                    bio.trim() === (profile?.bio ?? "").trim()
                  }
                >
                  {saving === "Bio" ? "Saving…" : "Save Bio"}
                </Button>
              </div>
              <TxidRow propertyKind={PROFILE_PROPERTY_BIO} content={bio} />
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showOrsWarning} onOpenChange={setShowOrsWarning}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Not using ors.sh?</AlertDialogTitle>
            <AlertDialogDescription>
              With a direct URL, if you want to change your avatar in the future
              you'll need to post a new bitcoin transaction and pay another fee.
              <br />
              <br />
              Using{" "}
              <a
                href="https://ors.sh"
                target="_blank"
                rel="noopener noreferrer"
                className="underline text-orange-500"
              >
                ors.sh
              </a>{" "}
              lets you update the destination at any time for free - without a
              new transaction.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setShowOrsWarning(false);
                saveField(PROFILE_PROPERTY_AVATAR_URL, avatarUrl, "Avatar URL");
              }}
            >
              Save anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
