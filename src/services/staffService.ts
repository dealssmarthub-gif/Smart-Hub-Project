import { supabase } from "@/lib/supabase";
import { uid } from "@/lib/naflis/format";
import { newInviteToken, sha256Hex, type Permission, type StaffGrant } from "@/lib/naflis/permissions";
import type { Role } from "@/lib/naflis/roles";
import { useNaflis } from "@/lib/naflis/store";

// Staff invitations and View-As sessions.
// With a signed-in Supabase session these go through SECURITY DEFINER RPCs
// (migration 07), which re-check super-admin rights and write audit_logs.
// Without one (demo personas) they run against the local store.

type Result<T = undefined> = { ok: true; message: string; data?: T } | { ok: false; message: string };

async function serverSession(): Promise<boolean> {
  if (!supabase) return false;
  try {
    const { data } = await supabase.auth.getSession();
    return Boolean(data.session);
  } catch {
    return false;
  }
}

function rpcError(message: string | undefined): string {
  if (!message) return "The server rejected the request.";
  if (message.includes("not_authorized")) return "You're not authorised to do that.";
  if (message.includes("invite_expired")) return "This invitation has expired. Ask for a new one.";
  if (message.includes("email_mismatch")) return "This invitation was sent to a different email address.";
  if (message.includes("invite_not_found")) return "Invitation not found or already used.";
  return message;
}

export interface InviteInput {
  email: string;
  name: string;
  title: string;
  role: StaffGrant["role"];
  institutionId: string;
  campusId: string;
  permissions: Permission[];
  expiresInDays?: number;
}

export function inviteLink(token: string): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/staff-invite?token=${encodeURIComponent(token)}`;
}

/** Creates an invitation. Returns the one-time link (the token itself is never stored). */
export async function inviteStaff(input: InviteInput): Promise<Result<{ link: string }>> {
  const email = input.email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, message: "Enter a valid email address." };
  if (!input.permissions.length) return { ok: false, message: "Pick at least one permission." };
  const expiresInDays = input.expiresInDays ?? 7;

  if (await serverSession()) {
    const { data, error } = await supabase!.rpc("naflis_invite_staff", {
      p_email: email,
      p_name: input.name.trim(),
      p_title: input.title.trim(),
      p_role: input.role,
      p_institution: input.institutionId,
      p_campus: input.campusId,
      p_permissions: input.permissions,
      p_expires_days: expiresInDays,
    });
    if (error) return { ok: false, message: rpcError(error.message) };
    const row = Array.isArray(data) ? data[0] : data;
    useNaflis.setState((s) => ({
      staffGrants: [
        {
          id: row.grant_id, email, name: input.name.trim(), title: input.title.trim(), role: input.role,
          institutionId: input.institutionId, campusId: input.campusId, permissions: input.permissions,
          status: "invited", expiresAt: Date.now() + expiresInDays * 86_400_000, invitedBy: s.currentUserId ?? "", createdAt: Date.now(),
        },
        ...s.staffGrants,
      ],
    }));
    return { ok: true, message: `Invitation created for ${email}`, data: { link: inviteLink(row.token) } };
  }

  const token = newInviteToken();
  const s = useNaflis.getState();
  const grant: StaffGrant = {
    id: "sg_" + uid() + uid(),
    email,
    name: input.name.trim() || email,
    title: input.title.trim(),
    role: input.role,
    institutionId: input.institutionId,
    campusId: input.campusId,
    permissions: input.permissions,
    status: "invited",
    tokenHash: await sha256Hex(token),
    expiresAt: Date.now() + expiresInDays * 86_400_000,
    invitedBy: s.currentUserId ?? "",
    createdAt: Date.now(),
  };
  const res = s.addStaffGrant(grant);
  if (!res.ok) return res;
  // Let a matching local account see it in their notifications (demo stand-in for the email).
  const invitee = s.users.find((u) => u.email.toLowerCase() === email);
  if (invitee) {
    s.pushNotif({ userId: invitee.id, type: "staff", title: "You've been invited as campus staff", body: `${grant.title} — open the link from your Super Admin to accept.` });
  }
  return { ok: true, message: res.message, data: { link: inviteLink(token) } };
}

/** Looks up an invitation by its token without accepting it. */
export async function previewInvite(token: string): Promise<Result<Pick<StaffGrant, "email" | "title" | "institutionId" | "campusId" | "permissions" | "status" | "expiresAt">>> {
  if (await serverSession()) {
    const { data, error } = await supabase!.rpc("naflis_preview_staff_invite", { p_token: token });
    const row = Array.isArray(data) ? data[0] : data;
    if (error || !row) return { ok: false, message: rpcError(error?.message ?? "invite_not_found") };
    return {
      ok: true,
      message: "",
      data: { email: row.email, title: row.title, institutionId: row.institution_id, campusId: row.campus_id, permissions: row.permissions, status: row.status, expiresAt: new Date(row.expires_at).getTime() },
    };
  }
  const hash = await sha256Hex(token);
  const g = useNaflis.getState().staffGrants.find((x) => x.tokenHash === hash);
  if (!g) return { ok: false, message: rpcError("invite_not_found") };
  return { ok: true, message: "", data: g };
}

export async function acceptInvite(token: string): Promise<Result> {
  if (await serverSession()) {
    const { error } = await supabase!.rpc("naflis_accept_staff_invite", { p_token: token });
    if (error) return { ok: false, message: rpcError(error.message) };
    await useNaflis.getState().refreshRoles();
    return { ok: true, message: "Invitation accepted." };
  }
  const s = useNaflis.getState();
  if (!s.currentUserId) return { ok: false, message: "Sign in to accept this invitation." };
  const hash = await sha256Hex(token);
  const g = s.staffGrants.find((x) => x.tokenHash === hash);
  if (!g) return { ok: false, message: rpcError("invite_not_found") };
  return s.activateStaffGrant(g.id, s.currentUserId);
}

export async function revokeStaff(grantId: string): Promise<Result> {
  if (await serverSession()) {
    const { error } = await supabase!.rpc("naflis_revoke_staff", { p_grant: grantId });
    if (error) return { ok: false, message: rpcError(error.message) };
  }
  return useNaflis.getState().revokeStaffGrant(grantId);
}

export async function updateStaffPermissions(grantId: string, permissions: Permission[]): Promise<Result> {
  if (!permissions.length) return { ok: false, message: "Keep at least one permission, or revoke access instead." };
  if (await serverSession()) {
    const { error } = await supabase!.rpc("naflis_update_staff_permissions", { p_grant: grantId, p_permissions: permissions });
    if (error) return { ok: false, message: rpcError(error.message) };
  }
  return useNaflis.getState().updateStaffGrant(grantId, { permissions });
}

/** Validates a scanned ticket at the gate. Server tickets are checked in atomically by the database. */
export async function validateTicket(raw: string): Promise<{ ok: boolean; message: string }> {
  const token = raw.trim().replace(/^naflis:ticket:/i, "").toUpperCase();
  const local = useNaflis.getState().tickets.find((t) => t.token === token);
  if ((!local || local.serverBacked) && (await serverSession())) {
    const { data, error } = await supabase!.rpc("naflis_check_in_ticket", { p_token: token });
    if (error) return { ok: false, message: rpcError(error.message) };
    const row = Array.isArray(data) ? data[0] : data;
    if (row?.ok && local) {
      useNaflis.setState((s) => ({ tickets: s.tickets.map((t) => (t.id === local.id ? { ...t, status: "checked_in", checkedInAt: Date.now() } : t)) }));
    }
    return { ok: Boolean(row?.ok), message: row?.message ?? "Unknown ticket." };
  }
  return useNaflis.getState().checkInTicket(token);
}

/** Starts a View-As session. In server mode it is refused unless the server logged it. */
export async function startViewAs(input: { targetUserId: string; role: Role; reason: string; minutes?: number }): Promise<Result> {
  let sessionId: string | undefined;
  if (await serverSession()) {
    const { data, error } = await supabase!.rpc("naflis_start_impersonation", {
      p_target: input.targetUserId,
      p_role: input.role,
      p_reason: input.reason,
      p_minutes: input.minutes ?? 30,
    });
    if (error) return { ok: false, message: rpcError(error.message) };
    sessionId = data as string;
  }
  return useNaflis.getState().startImpersonation({ ...input, sessionId });
}

export async function endViewAs(reason: "exit" | "expired" = "exit"): Promise<void> {
  const session = useNaflis.getState().endImpersonation(reason);
  if (session && (await serverSession())) {
    await supabase!.rpc("naflis_end_impersonation", { p_session: session.id, p_reason: reason }).then(
      () => undefined,
      () => undefined,
    );
  }
}
