import { useState } from "react";
import { Check, Copy, ExternalLink } from "lucide-react";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { shortenTxid } from "@/lib/utils";

interface TxidDropdownItemProps {
  txid: string;
}

export function TxidDropdownItem({ txid }: TxidDropdownItemProps) {
  const shortTxid = shortenTxid(txid);
  const [copied, setCopied] = useState(false);

  function handleCopy(e: React.MouseEvent) {
    e.stopPropagation();
    navigator.clipboard.writeText(txid);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  function handleOpen(e: React.MouseEvent) {
    e.stopPropagation();
    window.open(`https://mempool.space/tx/${txid}`, "_blank");
  }

  return (
    <DropdownMenuItem className="font-mono text-xs" onSelect={(e) => e.preventDefault()}>
      <span className="text-muted-foreground mr-2">TXID</span>
      <span className="mr-2">{shortTxid}</span>
      <div className="ml-auto flex items-center gap-1.5">
        <button className="text-muted-foreground hover:text-foreground" onClick={handleCopy}>
          {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
        </button>
        <button className="text-muted-foreground hover:text-foreground" onClick={handleOpen}>
          <ExternalLink className="h-3.5 w-3.5" />
        </button>
      </div>
    </DropdownMenuItem>
  );
}
