import { BoxIcon, KeyIcon, GlobeIcon } from "lucide-react";
import { LogoIcon } from "@/icons/LogoIcon";

export function FeatureList() {
  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 h-6 w-6 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
          <BoxIcon className="h-3.5 w-3.5 text-gray-500" />
        </div>
        <div>
          <p className="font-semibold text-sm">Post for free</p>
          <p className="text-sm text-muted-foreground">
            All activity is represented by transactions on Mutinynet, one of
            bitcoin's test networks.
          </p>
        </div>
      </div>

      <div className="flex items-start gap-3">
        <div className="mt-0.5 h-6 w-6 rounded-full bg-orange-100 flex items-center justify-center flex-shrink-0">
          <BoxIcon className="h-3.5 w-3.5 text-orange-600" />
        </div>
        <div>
          <p className="font-semibold text-sm">Post to mainnet</p>
          <p className="text-sm text-muted-foreground">
            Optionally connect a lightning wallet to broadcast posts to bitcoin
            mainnet for permanent, censorship-resistant storage.
          </p>
        </div>
      </div>

      <div className="flex items-start gap-3">
        <div className="mt-0.5 h-6 w-6 rounded-full bg-orange-100 flex items-center justify-center flex-shrink-0">
          <KeyIcon className="h-3.5 w-3.5 text-orange-600" />
        </div>
        <div>
          <p className="font-semibold text-sm">You own your identity</p>
          <p className="text-sm text-muted-foreground">
            Your posts are signed by your own key.
          </p>
        </div>
      </div>

      <div className="flex items-start gap-3">
        <div className="mt-0.5 h-6 w-6 rounded-full bg-orange-100 flex items-center justify-center flex-shrink-0">
          <GlobeIcon className="h-3.5 w-3.5 text-orange-600" />
        </div>
        <div>
          <p className="font-semibold text-sm">Open Protocol</p>
          <p className="text-sm text-muted-foreground">
            Choose your own app and rules.
          </p>
        </div>
      </div>
    </div>
  );
}

export function AboutPage() {
  return (
    <div className="px-6 py-12 space-y-10">
      {/* Description */}
      <div className="space-y-1">
        <h1 className="text-2xl font-bold">About</h1>
        <p className="text-muted-foreground">
          OP_RETURN Social (ORS) is a permissionless social protocol built on
          bitcoin.
        </p>
        <p className="text-muted-foreground mt-2">
          This website is the first ORS client.
        </p>
      </div>

      <FeatureList />
    </div>
  );
}
