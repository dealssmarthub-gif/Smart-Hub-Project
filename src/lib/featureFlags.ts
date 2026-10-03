import { useEffect, useSyncExternalStore } from "react";
import { supabase } from "@/lib/supabase";
import { useNaflis } from "@/lib/naflis/store";

// ============================================================================
// ENGINE ROOM — FEATURE FLAGS
// ============================================================================
// Resolution order for a flag: Supabase `feature_flags` row (cached) → built-in
// default. Lookups are synchronous and never wait on the network, so the app
// behaves the same offline or while the first fetch is still in flight.

export interface FeatureFlag {
  key: string;
  label: string;
  description: string;
  enabled: boolean;
  /** When set, only these roles get the feature. */
  roles?: string[] | null;
  /** When set, only these institutions get the feature. */
  institutionIds?: string[] | null;
}

export const DEFAULT_FLAGS: FeatureFlag[] = [
  { key: "student_os", label: "Student OS", description: "Student workspace: campus marketplace, deals, resources and calendar.", enabled: true },
  { key: "src_portal", label: "SRC / Institutional Portal", description: "Campus notices and academic resource publishing for SRC heads.", enabled: true },
  { key: "role_switcher", label: "Workspace Switcher", description: "Let multi-role accounts switch context from the top bar.", enabled: true },
  { key: "reserve_and_pay", label: "Reserve & Pay", description: "Allow buyers to pre-pay in installments before delivery.", enabled: true },
  { key: "take_now_pay_later", label: "Take Now Pay Later", description: "Credit-based instant purchase with repayment plan.", enabled: true },
  { key: "auto_settlements", label: "Auto Settlements", description: "Automatically release seller funds 24h after delivery.", enabled: true },
  { key: "regional_flash_sales", label: "Regional Flash Sales", description: "Show flash sales personalised by buyer region.", enabled: true },
  { key: "seller_ai_price_intel", label: "AI Price Intelligence", description: "Enable AI-driven price recommendation for sellers.", enabled: true },
  { key: "brand_studio_beta", label: "Brand Studio (Beta)", description: "Automated store & catalog generator (beta cohort).", enabled: false },
  { key: "fraud_hard_block", label: "Fraud Hard Block", description: "Auto-suspend accounts with high risk score.", enabled: false },
];

const CACHE_KEY = "naflis-feature-flags-v1";
const TTL_MS = 60_000;

type FlagMap = Record<string, FeatureFlag>;

const defaults: FlagMap = Object.fromEntries(DEFAULT_FLAGS.map((f) => [f.key, f]));
let flags: FlagMap = defaults;
let hydrated = false;
let lastFetch = 0;
let inflight: Promise<void> | null = null;
const listeners = new Set<() => void>();

function commit(next: FlagMap) {
  flags = next;
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(Object.values(next)));
  } catch {
    // storage unavailable — in-memory only
  }
  listeners.forEach((l) => l());
}

/** Seed the in-memory map from the last values this browser saw. */
function hydrate() {
  if (hydrated || typeof localStorage === "undefined") return;
  hydrated = true;
  try {
    const cached = JSON.parse(localStorage.getItem(CACHE_KEY) ?? "null");
    if (Array.isArray(cached)) {
      flags = { ...defaults, ...Object.fromEntries(cached.map((f: FeatureFlag) => [f.key, { ...defaults[f.key], ...f }])) };
    }
  } catch {
    // corrupt cache — defaults stand
  }
}

/** Pull `feature_flags` from Supabase. Safe to call often; failures keep current values. */
export function refreshFeatureFlags(force = false): Promise<void> {
  if (!supabase || typeof window === "undefined") return Promise.resolve();
  if (inflight) return inflight;
  if (!force && Date.now() - lastFetch < TTL_MS) return Promise.resolve();
  lastFetch = Date.now();
  const client = supabase;
  inflight = (async () => {
    try {
      const { data, error } = await client.from("feature_flags").select("*");
      if (error || !data) return;
      const next: FlagMap = { ...flags };
      for (const row of data) {
        const base = next[row.key] ?? defaults[row.key];
        next[row.key] = {
          key: row.key,
          label: row.label ?? base?.label ?? row.key,
          description: row.description ?? base?.description ?? "",
          enabled: Boolean(row.enabled),
          roles: row.roles ?? null,
          institutionIds: row.institution_ids ?? null,
        };
      }
      commit(next);
    } catch {
      // offline — cached/default values stay in effect
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

function evaluate(flag: FeatureFlag | undefined, role?: string, institutionId?: string): boolean {
  if (!flag || !flag.enabled) return false;
  if (flag.roles?.length && !(role && flag.roles.includes(role))) return false;
  if (flag.institutionIds?.length && !(institutionId && flag.institutionIds.includes(institutionId))) return false;
  return true;
}

/**
 * Is `flagKey` on for this role / institution?
 * Synchronous: answers from cache or defaults and refreshes in the background.
 * Unknown keys are off.
 */
export function isFeatureEnabled(flagKey: string, role?: string, institutionId?: string): boolean {
  hydrate();
  void refreshFeatureFlags();
  return evaluate(flags[flagKey], role, institutionId);
}

export function listFeatureFlags(): FeatureFlag[] {
  hydrate();
  return Object.values(flags);
}

/**
 * Super Admin: change a flag. Applies locally at once; `persisted` reports
 * whether Supabase accepted the write (false offline / in demo mode).
 */
export async function setFeatureFlag(
  key: string,
  patch: Partial<Pick<FeatureFlag, "enabled" | "roles" | "institutionIds">>,
): Promise<{ persisted: boolean }> {
  hydrate();
  const current = flags[key] ?? { key, label: key, description: "", enabled: false };
  const next = { ...current, ...patch };
  commit({ ...flags, [key]: next });
  if (!supabase) return { persisted: false };
  try {
    const { error } = await supabase.from("feature_flags").upsert(
      {
        key,
        label: next.label,
        description: next.description,
        enabled: next.enabled,
        roles: next.roles ?? null,
        institution_ids: next.institutionIds ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "key" },
    );
    return { persisted: !error };
  } catch {
    return { persisted: false };
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const getSnapshot = () => flags;
const getServerSnapshot = () => defaults;

/** All flags, re-rendering when any change. */
export function useFeatureFlags(): FeatureFlag[] {
  const map = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  useEffect(() => {
    hydrate();
    if (flags !== map) listeners.forEach((l) => l());
    void refreshFeatureFlags();
  }, [map]);
  return Object.values(map);
}

/** Flag state for the signed-in user's active context and institution. */
export function useFeatureFlag(flagKey: string): boolean {
  const map = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const role = useNaflis((s) => s.role);
  const institutionId = useNaflis((s) => s.users.find((u) => u.id === s.currentUserId)?.institutionId);
  useEffect(() => {
    hydrate();
    if (flags !== map) listeners.forEach((l) => l());
    void refreshFeatureFlags();
  }, [map]);
  return evaluate(map[flagKey], role, institutionId);
}
