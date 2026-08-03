import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, useEffect } from "react";
import { z } from "zod";
import { Search as SearchIcon, X, Bell, Package } from "lucide-react";
import { ProductCard } from "@/components/naflis/ProductCard";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CATEGORIES, useNaflis } from "@/lib/naflis/store";
import { GHS } from "@/lib/naflis/format";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, DialogDescription,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/buyer/search")({
  validateSearch: z.object({ q: z.string().optional() }).parse,
  component: SearchPage,
});

function SearchPage() {
  const search = Route.useSearch();
  const products = useNaflis((s) => s.products);
  const recordSearch = useNaflis((s) => s.recordSearch);
  const setPriceAlert = useNaflis((s) => s.setPriceAlert);
  const createRequest = useNaflis((s) => s.createProductRequest);
  const pushNotif = useNaflis((s) => s.pushNotif);

  const [q, setQ] = useState(search.q ?? "");
  const [cat, setCat] = useState<string>("all");
  const [priceRange, setPriceRange] = useState<[number, number]>([0, 25000]);
  const [minDiscount, setMinDiscount] = useState(0);
  const [freeDelivery, setFreeDelivery] = useState(false);
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [reserveOnly, setReserveOnly] = useState(false);
  const [installmentOnly, setInstallmentOnly] = useState(false);
  const [sort, setSort] = useState<"relevance" | "price-asc" | "price-desc" | "discount">("relevance");

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    let r = products.filter((p) => {
      if (query) {
        const hay = `${p.name} ${p.brand} ${p.category} ${p.description}`.toLowerCase();
        if (!hay.includes(query)) return false;
      }
      if (cat !== "all" && p.category !== cat) return false;
      if (p.price < priceRange[0] || p.price > priceRange[1]) return false;
      const disc = ((p.originalPrice - p.price) / p.originalPrice) * 100;
      if (disc < minDiscount) return false;
      if (freeDelivery && !p.freeDelivery) return false;
      if (reserveOnly && !p.paymentOptions.includes("reserve")) return false;
      if (installmentOnly && !p.paymentOptions.includes("installment")) return false;
      if (verifiedOnly && !p.verifiedDiscount) return false;
      return true;
    });
    if (sort === "price-asc") r = r.sort((a, b) => a.price - b.price);
    if (sort === "price-desc") r = r.sort((a, b) => b.price - a.price);
    if (sort === "discount")
      r = r.sort(
        (a, b) =>
          (b.originalPrice - b.price) / b.originalPrice -
          (a.originalPrice - a.price) / a.originalPrice,
      );
    return r;
  }, [products, q, cat, priceRange, minDiscount, freeDelivery, verifiedOnly, reserveOnly, installmentOnly, sort]);

  useEffect(() => {
    if (q.trim().length > 2) {
      const t = setTimeout(() => recordSearch(q.trim(), filtered.length), 500);
      return () => clearTimeout(t);
    }
  }, [q, filtered.length, recordSearch]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" className="pl-9" />
          {q && (
            <button onClick={() => setQ("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <Select value={sort} onValueChange={(v) => setSort(v as any)}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="relevance">Relevance</SelectItem>
            <SelectItem value="price-asc">Price: low → high</SelectItem>
            <SelectItem value="price-desc">Price: high → low</SelectItem>
            <SelectItem value="discount">Biggest discount</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-6 md:grid-cols-[220px_1fr]">
        {/* Filters */}
        <aside className="space-y-4 rounded-xl border bg-card p-4">
          <div>
            <Label className="text-xs uppercase tracking-wider">Category</Label>
            <Select value={cat} onValueChange={setCat}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs uppercase tracking-wider">Price (GHS)</Label>
            <Slider
              min={0} max={25000} step={100}
              value={priceRange}
              onValueChange={(v) => setPriceRange(v as [number, number])}
              className="mt-2"
            />
            <p className="mt-1 text-xs text-muted-foreground">{GHS(priceRange[0])} — {GHS(priceRange[1])}</p>
          </div>
          <div>
            <Label className="text-xs uppercase tracking-wider">Minimum discount</Label>
            <Slider
              min={0} max={80} step={5} value={[minDiscount]}
              onValueChange={(v) => setMinDiscount(v[0])} className="mt-2"
            />
            <p className="mt-1 text-xs text-muted-foreground">{minDiscount}% or more</p>
          </div>
          <div className="space-y-2">
            <Toggle checked={freeDelivery} onChange={setFreeDelivery} label="Free delivery" />
            <Toggle checked={verifiedOnly} onChange={setVerifiedOnly} label="Verified discount" />
            <Toggle checked={reserveOnly} onChange={setReserveOnly} label="Reserve & Pay eligible" />
            <Toggle checked={installmentOnly} onChange={setInstallmentOnly} label="Take Now Pay Later" />
          </div>
        </aside>

        {/* Results */}
        <div>
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {filtered.length} {filtered.length === 1 ? "product" : "products"}
              {q && <> for "<span className="font-medium text-foreground">{q}</span>"</>}
            </p>
            <div className="flex gap-2">
              {q && filtered.length === 0 && (
                <PriceFeedback query={q} onNotify={() => {
                  pushNotif({
                    userId: "u_buyer1", type: "price-drop",
                    title: "We'll ping you", body: `We'll let you know when "${q}" becomes available.`,
                  });
                  toast.success("You'll be notified");
                }} />
              )}
              <RequestProduct
                defaultName={q}
                onSubmit={(data) => {
                  createRequest(data);
                  toast.success("Product request submitted — sellers will see this in their intelligence dashboard");
                }}
              />
            </div>
          </div>

          {filtered.length === 0 ? (
            <div className="rounded-xl border bg-card p-10 text-center">
              <Package className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
              <h3 className="text-lg font-semibold">No matches yet</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Sellers are preparing offers for this product. Tell us the price you'd pay, or notify us when it's available.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
              {filtered.slice(0, 60).map((p) => <ProductCard key={p.id} product={p} />)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm">
      <Checkbox checked={checked} onCheckedChange={(v) => onChange(Boolean(v))} />
      {label}
    </label>
  );
}

function PriceFeedback({ query, onNotify }: { query: string; onNotify: () => void }) {
  const recordSearch = useNaflis((s) => s.recordSearch);
  const [feedback, setFeedback] = useState<string | null>(null);
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Bell className="mr-1 h-4 w-4" /> Give price feedback
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Sellers are preparing offers</DialogTitle>
          <DialogDescription>
            Which price would make you consider buying "{query}"? Your answer feeds directly into seller intelligence.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          {["Great price", "Fair price", "Slightly expensive", "Too expensive"].map((f) => (
            <Button
              key={f}
              variant={feedback === f ? "default" : "outline"}
              className="w-full justify-start"
              onClick={() => setFeedback(f)}
            >
              {f}
            </Button>
          ))}
        </div>
        <DialogFooter>
          <Button
            onClick={() => {
              recordSearch(query + " [feedback:" + (feedback ?? "notify") + "]", 0);
              onNotify();
            }}
          >
            Notify me when available
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RequestProduct({ defaultName, onSubmit }: {
  defaultName?: string;
  onSubmit: (data: any) => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(defaultName ?? "");
  const [category, setCategory] = useState("Phones");
  const [brand, setBrand] = useState("");
  const [specs, setSpecs] = useState("");
  const [priceMin, setPriceMin] = useState(500);
  const [priceMax, setPriceMax] = useState(2000);
  const [wantsReserve, setWantsReserve] = useState(false);
  const [wantsInstallment, setWantsInstallment] = useState(true);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">Request a product</Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Request a product</DialogTitle>
          <DialogDescription>Sellers will see this in their Opportunity Dashboard.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Product name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Preferred brand</Label>
              <Input value={brand} onChange={(e) => setBrand(e.target.value)} />
            </div>
          </div>
          <div>
            <Label>Key specifications</Label>
            <Textarea value={specs} onChange={(e) => setSpecs(e.target.value)} rows={2} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Min price (GHS)</Label>
              <Input type="number" value={priceMin} onChange={(e) => setPriceMin(+e.target.value)} />
            </div>
            <div>
              <Label>Max price (GHS)</Label>
              <Input type="number" value={priceMax} onChange={(e) => setPriceMax(+e.target.value)} />
            </div>
          </div>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={wantsReserve} onCheckedChange={(v) => setWantsReserve(!!v)} />
              Interested in Reserve & Pay
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={wantsInstallment} onCheckedChange={(v) => setWantsInstallment(!!v)} />
              Interested in Pay Later
            </label>
          </div>
        </div>
        <DialogFooter>
          <Button
            onClick={() => {
              if (!name.trim()) { toast.error("Product name required"); return; }
              onSubmit({ name, category, brand, specs, priceMin, priceMax, wantsReserve, wantsInstallment, region: "Greater Accra" });
              setOpen(false);
            }}
          >
            Submit request
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
