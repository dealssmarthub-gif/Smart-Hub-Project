import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, Loader2, Phone, Plus, Store, X } from "lucide-react";
import { toast } from "sonner";
import { RoleShell } from "@/components/naflis/RoleShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fmtDate } from "@/lib/naflis/format";
import { supabase } from "@/lib/supabase";
import {
  createVendorFor,
  listVendors,
  setVendorStatus,
  type AdminVendor,
} from "@/services/vendorAdmin";
import { syncStudentListings, type VendorStatus } from "@/services/studentListings";

export const Route = createFileRoute("/super/vendors")({
  component: VendorManagement,
});

const STATUS_BADGE: Record<VendorStatus, "default" | "secondary" | "outline"> = {
  approved: "default",
  pending: "secondary",
  rejected: "outline",
};

function VendorManagement() {
  const [filter, setFilter] = useState<"all" | VendorStatus>("pending");
  const vendors = useQuery({
    queryKey: ["admin-vendors"],
    queryFn: listVendors,
    enabled: Boolean(supabase),
  });
  const rows = (vendors.data ?? []).filter((v) => filter === "all" || v.status === filter);
  const pendingCount = (vendors.data ?? []).filter((v) => v.status === "pending").length;

  return (
    <RoleShell
      title="Vendors"
      subtitle="Create seller accounts and approve them. Only approved vendors' products and listings are public."
      icon={Store}
      badge="Super Admin"
    >
      <Button asChild variant="ghost" size="sm" className="mb-4">
        <Link to="/super">
          <ArrowLeft className="mr-1 h-4 w-4" /> Engine room
        </Link>
      </Button>

      {!supabase ? (
        <p className="rounded-2xl border border-border-soft bg-card p-6 text-center text-sm text-muted-foreground">
          Vendors are managed in the database. Connect Supabase to use this page.
        </p>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
          <CreateVendorForm />

          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-bold">Vendors ({rows.length})</h2>
              <select
                aria-label="Filter by status"
                className="h-9 rounded-md border bg-background px-2 text-sm"
                value={filter}
                onChange={(e) => setFilter(e.target.value as typeof filter)}
              >
                <option value="pending">Pending ({pendingCount})</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
                <option value="all">All</option>
              </select>
            </div>
            {vendors.isLoading && (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading vendors…
              </p>
            )}
            {vendors.error && (
              <p className="rounded-lg bg-error/10 p-3 text-sm text-error">
                Couldn't load vendors: {(vendors.error as Error).message}
              </p>
            )}
            {vendors.isSuccess && rows.length === 0 && (
              <p className="rounded-2xl border border-border-soft bg-card p-6 text-center text-sm text-muted-foreground">
                {filter === "pending" ? "No vendors waiting for approval." : "No vendors here."}
              </p>
            )}
            {rows.map((v) => (
              <VendorRow key={v.id} vendor={v} />
            ))}
          </div>
        </div>
      )}
    </RoleShell>
  );
}

function VendorRow({ vendor }: { vendor: AdminVendor }) {
  const qc = useQueryClient();
  const change = useMutation({
    mutationFn: (status: VendorStatus) => setVendorStatus(vendor.id, status),
    onSuccess: async (_, status) => {
      toast.success(
        `${vendor.storeName} ${status === "approved" ? "approved" : status === "rejected" ? "rejected" : "set to pending"}.`,
      );
      await qc.invalidateQueries({ queryKey: ["admin-vendors"] });
      // Approving or rejecting changes which student listings are public.
      await syncStudentListings().catch(() => undefined);
    },
    onError: (err) => toast.error((err as Error).message),
  });

  return (
    <div className="rounded-2xl border border-border-soft bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold">{vendor.storeName}</p>
          <p className="truncate text-xs text-muted-foreground">
            {vendor.ownerName ? `${vendor.ownerName} · ` : ""}
            {vendor.ownerEmail || "owner unknown"}
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Phone className="h-3 w-3" />{" "}
              {vendor.contactPhone || "No contact phone (buyers won't see a contact button)"}
            </span>
            <span>
              {vendor.productCount} product{vendor.productCount === 1 ? "" : "s"}
            </span>
            <span>Since {fmtDate(vendor.createdAt)}</span>
          </p>
        </div>
        <Badge variant={STATUS_BADGE[vendor.status]} className="capitalize">
          {vendor.status}
        </Badge>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {vendor.status !== "approved" && (
          <Button size="sm" onClick={() => change.mutate("approved")} disabled={change.isPending}>
            {change.isPending ? (
              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Check className="mr-1 h-3.5 w-3.5" />
            )}{" "}
            Approve
          </Button>
        )}
        {vendor.status !== "rejected" && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => change.mutate("rejected")}
            disabled={change.isPending}
          >
            <X className="mr-1 h-3.5 w-3.5" /> {vendor.status === "approved" ? "Suspend" : "Reject"}
          </Button>
        )}
      </div>
    </div>
  );
}

function CreateVendorForm() {
  const qc = useQueryClient();
  const [email, setEmail] = useState("");
  const [storeName, setStoreName] = useState("");
  const [phone, setPhone] = useState("");
  const create = useMutation({
    mutationFn: () => createVendorFor({ ownerEmail: email, storeName, contactPhone: phone }),
    onSuccess: async () => {
      toast.success(`${storeName.trim()} created. It's pending until you approve it.`);
      setEmail("");
      setStoreName("");
      setPhone("");
      await qc.invalidateQueries({ queryKey: ["admin-vendors"] });
    },
    onError: (err) => toast.error((err as Error).message),
  });

  return (
    <form
      className="h-fit space-y-3 rounded-3xl border border-border-soft bg-card p-5 shadow-soft"
      onSubmit={(e) => {
        e.preventDefault();
        create.mutate();
      }}
    >
      <h2 className="flex items-center gap-2 font-bold">
        <Plus className="h-4 w-4 text-link" /> New vendor
      </h2>
      <p className="text-xs text-muted-foreground">
        For an existing account. Students who post a listing get a vendor automatically; it appears
        here as pending.
      </p>
      <div className="space-y-1">
        <Label htmlFor="v-email" className="text-xs">
          Owner's account email
        </Label>
        <Input
          id="v-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="seller@example.com"
          required
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="v-name" className="text-xs">
          Shop name
        </Label>
        <Input
          id="v-name"
          value={storeName}
          onChange={(e) => setStoreName(e.target.value)}
          placeholder="e.g. Legon Book Corner"
          required
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="v-phone" className="text-xs">
          Contact phone (optional)
        </Label>
        <Input
          id="v-phone"
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="e.g. 024 123 4567"
          aria-describedby="v-phone-hint"
        />
        <p id="v-phone-hint" className="text-[11px] text-muted-foreground">
          Visible to anyone viewing this vendor's listings once it's approved. Add it only with the
          owner's agreement.
        </p>
      </div>
      <Button type="submit" className="w-full" disabled={create.isPending}>
        {create.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} Create vendor
      </Button>
    </form>
  );
}
