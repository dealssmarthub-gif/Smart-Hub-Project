import { supabase } from "@/lib/supabase";
import { AccessDeniedError, isRlsDenied } from "@/lib/naflis/errors";
import { useNaflis, type CampusEvent, type CampusResource } from "@/lib/naflis/store";

// SRC / institutional publishing API. Every call is checked twice:
//  - by the database (scoped RLS from migration 07) when there is a Supabase session,
//  - by the store's scope check, which mirrors those policies.
// Either refusal surfaces as AccessDeniedError (status 403).

async function session(): Promise<boolean> {
  if (!supabase) return false;
  try {
    return Boolean((await supabase.auth.getSession()).data.session);
  } catch {
    return false;
  }
}

const isUuid = (id: string) => /^[0-9a-f-]{36}$/i.test(id);

function denied(campus: string): AccessDeniedError {
  return new AccessDeniedError(`Access denied: you don't have permission to manage content for ${campus}.`);
}

export async function publishCampusEvent(input: Omit<CampusEvent, "id" | "createdAt">): Promise<CampusEvent> {
  const permission = input.kind === "announcement" ? "student.announcements.create" : "student.events.create";
  if (!useNaflis.getState().hasPermission(permission, input.campus)) throw denied(input.campus);
  let id: string | undefined;
  if (await session()) {
    const { data, error } = await supabase!
      .from("campus_events")
      .insert({
        kind: input.kind ?? "event",
        title: input.title,
        description: input.description,
        event_date: input.eventDate,
        venue: input.venue,
        banner_url: input.bannerUrl,
        campus: input.campus,
        pinned: input.pinned,
        organizer: input.organizer,
      })
      .select("id")
      .single();
    if (error) throw isRlsDenied(error) ? denied(input.campus) : new Error(error.message);
    id = data.id;
  }
  const created = useNaflis.getState().addCampusEvent({ ...input, id });
  if (!created) throw denied(input.campus);
  return created;
}

async function mutateEvent(eventId: string, op: "pin" | "delete") {
  const s = useNaflis.getState();
  const ev = s.campusEvents.find((e) => e.id === eventId);
  if (!ev) throw new Error("Notice not found.");
  if (await session() && isUuid(eventId)) {
    const q =
      op === "pin"
        ? supabase!.from("campus_events").update({ pinned: !ev.pinned }).eq("id", eventId).select("id")
        : supabase!.from("campus_events").delete().eq("id", eventId).select("id");
    const { data, error } = await q;
    if (error) throw isRlsDenied(error) ? denied(ev.campus) : new Error(error.message);
    // RLS hides rows you can't touch: zero affected rows means "not yours".
    if (!data?.length) throw denied(ev.campus);
  }
  const ok = op === "pin" ? s.togglePinEvent(eventId) : s.deleteCampusEvent(eventId);
  if (!ok) throw denied(ev.campus);
  return ev;
}

export const togglePinCampusEvent = (eventId: string) => mutateEvent(eventId, "pin");
export const removeCampusEvent = (eventId: string) => mutateEvent(eventId, "delete");

export async function publishCampusResource(input: Omit<CampusResource, "id" | "createdAt" | "downloads">): Promise<CampusResource> {
  if (!useNaflis.getState().hasPermission("student.resources.manage", input.campus)) throw denied(input.campus);
  if (await session()) {
    const { error } = await supabase!.from("campus_resources").insert({
      title: input.title,
      description: input.description,
      resource_type: input.resourceType,
      course_code: input.courseCode,
      department: input.department,
      campus: input.campus,
      file_url: input.fileUrl,
      file_name: input.fileName,
      file_size: input.fileSize,
    });
    if (error) throw isRlsDenied(error) ? denied(input.campus) : new Error(error.message);
  }
  const created = useNaflis.getState().addCampusResource(input);
  if (!created) throw denied(input.campus);
  return created;
}

export async function removeCampusResource(resourceId: string): Promise<void> {
  const s = useNaflis.getState();
  const r = s.campusResources.find((x) => x.id === resourceId);
  if (!r) throw new Error("Resource not found.");
  if (await session() && isUuid(resourceId)) {
    const { data, error } = await supabase!.from("campus_resources").delete().eq("id", resourceId).select("id");
    if (error) throw isRlsDenied(error) ? denied(r.campus) : new Error(error.message);
    if (!data?.length) throw denied(r.campus);
  }
  if (!s.deleteCampusResource(resourceId)) throw denied(r.campus);
}
