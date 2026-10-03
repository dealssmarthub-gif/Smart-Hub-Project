/** HTTP-style errors raised by the service layer, so callers (and tests) see the same status the server would send. */
export class AccessDeniedError extends Error {
  readonly status = 403;
  readonly code = "FORBIDDEN";
  constructor(message = "Access denied.") {
    super(message);
    this.name = "AccessDeniedError";
  }
}

export class SubscriptionRequiredError extends Error {
  readonly status = 402;
  readonly code = "SUBSCRIPTION_REQUIRED";
  constructor(message = "Upgrade your NAFLIS plan to use this feature.") {
    super(message);
    this.name = "SubscriptionRequiredError";
  }
}

/** Supabase/PostgREST signals for a row-level-security denial. */
export function isRlsDenied(error: { code?: string; message?: string; status?: number } | null | undefined): boolean {
  if (!error) return false;
  return error.code === "42501" || error.status === 403 || /row-level security|permission denied|not_authorized/i.test(error.message ?? "");
}
