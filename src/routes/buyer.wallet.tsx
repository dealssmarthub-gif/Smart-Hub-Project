import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Wallet, Plus, ArrowDownToLine, ArrowUpFromLine, Send, Shield, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useNaflis, useWallet } from "@/lib/naflis/store";
import { GHS, fmtDate } from "@/lib/naflis/format";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/buyer/wallet")({
  component: WalletPage,
});

function WalletPage() {
  const wallet = useWallet();
  const fundWallet = useNaflis((s) => s.fundWallet);
  const toggleAutoFund = useNaflis((s) => s.toggleAutoFund);

  if (!wallet) return null;

  return (
    <div className="space-y-6">
      <div className="rounded-2xl gradient-hero p-6 text-white shadow-premium">
        <div className="flex items-center gap-2 text-white/70">
          <Wallet className="h-4 w-4" />
          <span className="text-xs uppercase tracking-widest">NAFLIS Wallet</span>
        </div>
        <p className="mt-2 text-4xl font-black">{GHS(wallet.balance)}</p>
        <p className="text-xs text-white/70">Available balance</p>
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="In escrow" value={GHS(wallet.escrow)} />
          <Stat label="Reserved" value={GHS(wallet.reserved)} />
          <Stat label="Cashback" value={GHS(wallet.cashback)} />
          <Stat label="Credit limit" value={GHS(wallet.creditLimit)} />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <FundDialog onFund={(amt, src) => { fundWallet(amt, src); toast.success(`+${GHS(amt)} added from ${src}`); }} />
        <Button variant="outline"><ArrowUpFromLine className="mr-1 h-4 w-4" /> Withdraw</Button>
        <Button variant="outline"><Send className="mr-1 h-4 w-4" /> Send</Button>
        <Button variant="outline"><Shield className="mr-1 h-4 w-4" /> Freeze wallet</Button>
      </div>

      <div className="rounded-2xl border bg-card p-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="flex items-center gap-2 font-bold"><Zap className="h-4 w-4 text-gold" /> Auto-funding</h3>
            <p className="text-sm text-muted-foreground">
              Automatically top up when balance falls below GHS {wallet.autoFund.threshold} or an installment is due.
            </p>
          </div>
          <Switch checked={wallet.autoFund.enabled} onCheckedChange={toggleAutoFund} />
        </div>
        {wallet.autoFund.enabled && (
          <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <Stat label="Backup source" value={wallet.linked[0]?.label ?? "MTN MoMo"} light />
            <Stat label="Max per top-up" value={GHS(wallet.autoFund.max)} light />
          </div>
        )}
      </div>

      <div className="rounded-2xl border bg-card p-5">
        <h3 className="mb-3 font-bold">Linked payment methods</h3>
        <ul className="divide-y">
          {wallet.linked.map((l) => (
            <li key={l.label} className="flex items-center justify-between py-3">
              <div>
                <p className="font-medium">{l.label}</p>
                <p className="text-xs text-muted-foreground">{l.masked}</p>
              </div>
              <span className="text-xs uppercase tracking-wide text-muted-foreground">{l.type}</span>
            </li>
          ))}
          <li className="pt-3">
            <Button variant="outline" size="sm"><Plus className="mr-1 h-4 w-4" /> Link another method</Button>
          </li>
        </ul>
      </div>

      <div className="rounded-2xl border bg-card">
        <div className="border-b p-5">
          <h3 className="font-bold">Recent transactions</h3>
        </div>
        <div className="divide-y">
          {wallet.transactions.slice(0, 20).map((tx) => (
            <div key={tx.id} className="flex items-center gap-3 p-4">
              <div className={`grid h-9 w-9 place-items-center rounded-full ${
                tx.type === "credit" ? "bg-success/10 text-success" :
                tx.type === "escrow-in" ? "bg-sky-500/10 text-sky-500" :
                "bg-muted text-muted-foreground"
              }`}>
                {tx.type === "credit" ? <ArrowDownToLine className="h-4 w-4" /> : <ArrowUpFromLine className="h-4 w-4" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{tx.description}</p>
                <p className="text-xs text-muted-foreground">{fmtDate(tx.createdAt)}</p>
              </div>
              <p className={`font-semibold ${tx.type === "credit" ? "text-success" : ""}`}>
                {tx.type === "credit" ? "+" : "-"}{GHS(tx.amount)}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, light }: { label: string; value: React.ReactNode; light?: boolean }) {
  return (
    <div className={`rounded-lg ${light ? "border bg-card" : "bg-white/10"} p-3`}>
      <p className={`text-xs ${light ? "text-muted-foreground" : "text-white/70"}`}>{label}</p>
      <p className={`text-lg font-bold ${light ? "" : "text-white"}`}>{value}</p>
    </div>
  );
}

function FundDialog({ onFund }: { onFund: (amt: number, src: string) => void }) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(500);
  const [source, setSource] = useState("MTN Mobile Money");
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gradient-hero text-white hover:opacity-95">
          <Plus className="mr-1 h-4 w-4" /> Add money
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Top up your NAFLIS Wallet</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Amount (GHS)</Label>
            <Input type="number" value={amount} onChange={(e) => setAmount(+e.target.value)} />
          </div>
          <div className="grid grid-cols-3 gap-2">
            {[200, 500, 1000, 2000, 5000, 10000].map((v) => (
              <Button key={v} variant="outline" size="sm" onClick={() => setAmount(v)}>{GHS(v)}</Button>
            ))}
          </div>
          <div>
            <Label>Source</Label>
            <div className="mt-2 flex flex-wrap gap-2">
              {["MTN Mobile Money", "Vodafone Cash", "GCB Bank", "Visa •••• 4322"].map((s) => (
                <Button
                  key={s} type="button" variant={source === s ? "default" : "outline"} size="sm"
                  onClick={() => setSource(s)}
                >{s}</Button>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={() => { if (amount > 0) { onFund(amount, source); setOpen(false); } }}>
            Confirm top-up
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
