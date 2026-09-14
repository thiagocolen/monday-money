import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { validateAddress } from "@/lib/chains/validate";
import { CHAIN_LABELS, type WalletChain, type WalletEntry } from "@/lib/chains/types";

interface AddWalletDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (wallet: WalletEntry) => void;
}

const CHAINS: WalletChain[] = ["bitcoin", "ethereum", "bsc", "solana", "arbitrum", "base", "tron"];

export function AddWalletDialog({ open, onOpenChange, onAdd }: AddWalletDialogProps) {
  const [chain, setChain] = useState<WalletChain>("ethereum");
  const [address, setAddress] = useState("");
  const [label, setLabel] = useState("");
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setChain("ethereum");
    setAddress("");
    setLabel("");
  };

  const handleSave = async () => {
    const { valid, reason } = validateAddress(chain, address);
    if (!valid) {
      toast.error(reason || "Invalid address");
      return;
    }

    setSaving(true);
    onAdd({
      id: crypto.randomUUID(),
      chain,
      address: address.trim(),
      label: label.trim(),
      addedAt: Date.now(),
    });
    setSaving(false);
    toast.success("Wallet added");
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>Add Wallet</DialogTitle>
          <DialogDescription>
            Track a public address. Only free, keyless public block explorers are used — no private keys are ever
            requested.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium">Chain</label>
            <Select value={chain} onValueChange={(v) => setChain(v as WalletChain)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CHAINS.map((c) => (
                  <SelectItem key={c} value={c}>
                    {CHAIN_LABELS[c]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="wallet-address" className="text-sm font-medium">
              Address
            </label>
            <Input
              id="wallet-address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder={
                chain === "bitcoin"
                  ? "bc1..."
                  : chain === "solana"
                    ? "Base58 address"
                    : chain === "tron"
                      ? "T..."
                      : "0x..."
              }
              className="font-mono text-xs"
            />
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="wallet-label" className="text-sm font-medium">
              Label <span className="text-muted-foreground font-normal">(optional)</span>
            </label>
            <Input
              id="wallet-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Cold storage"
            />
          </div>
        </div>

        <DialogFooter>
          <Button onClick={handleSave} disabled={saving || !address}>
            {saving ? "Adding..." : "Add Wallet"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
