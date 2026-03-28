import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ClockIcon, MoreHorizontalIcon } from "lucide-react";
import { TxidDropdownItem } from "./TxidDropdownItem";

interface TxDropdownMenuProps {
  txid: string;
  network?: string;
  blockHeight: number;
  children?: ReactNode;
}

function blockStatusLabel(blockHeight: number, network?: string): string {
  const net = network ?? "mainnet";
  if (blockHeight === 0) return `${net} · in mempool`;
  return `${net} · block ${blockHeight.toLocaleString()}`;
}

export function TxDropdownMenu({ txid, network, blockHeight, children }: TxDropdownMenuProps) {
  return (
    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
      {blockHeight === 0 && (
        <div title="Unconfirmed Transaction">
          <ClockIcon className="h-3.5 w-3.5 text-muted-foreground" />
        </div>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground">
            <MoreHorizontalIcon className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
            {blockStatusLabel(blockHeight, network)}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <TxidDropdownItem txid={txid} network={network} />
          {children}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
