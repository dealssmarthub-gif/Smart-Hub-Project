import { useEffect, useState } from "react";
import { Building2, GraduationCap, LocateFixed, Loader2, MapPin } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useNaflis, CAMPUSES } from "@/lib/naflis/store";
import { CAMPUS_COORDS } from "@/lib/naflis/studentSeed";
import { saveActiveCampus } from "@/services/studentOs";

/** Distance in km between two lat/lng points. */
function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

export function nearestCampus(pos: { lat: number; lng: number }): { campus: string; km: number } | null {
  let best: { campus: string; km: number } | null = null;
  for (const [campus, c] of Object.entries(CAMPUS_COORDS)) {
    const km = haversineKm(pos, c);
    if (!best || km < best.km) best = { campus, km };
  }
  return best;
}

/** Header control: registered institution badge, active-campus selector, location check. */
export function CampusContextBar() {
  const activeCampus = useNaflis((s) => s.selectedCampus);
  const registered = useNaflis((s) => s.registeredInstitution);
  const verified = useNaflis((s) => s.studentProfile.isVerified);
  const requestCampusSwitch = useNaflis((s) => s.requestCampusSwitch);
  const [locating, setLocating] = useState(false);

  // Entering Student OS while browsing another campus: offer the registered one (respects "Not now").
  useEffect(() => {
    const s = useNaflis.getState();
    if (s.studentProfile.isVerified && s.registeredInstitution && s.selectedCampus !== s.registeredInstitution) {
      s.requestCampusSwitch(s.registeredInstitution, "registered");
    }
  }, []);

  const locate = () => {
    if (!("geolocation" in navigator)) return toast.error("Location isn't available in this browser.");
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setLocating(false);
        const near = nearestCampus({ lat: p.coords.latitude, lng: p.coords.longitude });
        if (!near || near.km > 5) return toast.info("You're not near a supported campus right now.");
        if (near.campus === activeCampus) return toast.success(`You're at ${near.campus} — already your active campus.`);
        requestCampusSwitch(near.campus, "location");
      },
      (err) => {
        setLocating(false);
        toast.error(err.code === err.PERMISSION_DENIED ? "Location permission was denied." : "Couldn't get your location.");
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000 },
    );
  };

  return (
    <div className="flex items-center gap-2">
      {verified && registered && (
        <span
          className="hidden items-center gap-1 rounded-md border px-2 py-1 text-[11px] text-muted-foreground lg:flex"
          title="Registered institution (set by student verification)"
        >
          <GraduationCap className="h-3.5 w-3.5 text-sky-500" /> {registered}
        </span>
      )}
      <div className="relative flex items-center">
        <Building2 className="pointer-events-none absolute left-2.5 h-4 w-4 text-sky-500" />
        <select
          aria-label="Active campus"
          title="Active campus"
          value={activeCampus}
          onChange={(e) => requestCampusSwitch(e.target.value, "manual")}
          className="h-9 rounded-lg border border-border bg-card pl-8 pr-7 text-xs font-semibold text-foreground shadow-sm transition focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
        >
          {CAMPUSES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>
      <Button variant="ghost" size="icon" onClick={locate} disabled={locating} aria-label="Use my location to pick a campus" title="Use my location">
        {locating ? <Loader2 className="h-4 w-4 animate-spin" /> : <LocateFixed className="h-4 w-4" />}
      </Button>
    </div>
  );
}

/** The Switch / Not now prompt. Mount once per shell. */
export function CampusSwitchPrompt() {
  const prompt = useNaflis((s) => s.campusPrompt);
  const activeCampus = useNaflis((s) => s.selectedCampus);
  const registered = useNaflis((s) => s.registeredInstitution);
  const resolve = useNaflis((s) => s.resolveCampusPrompt);
  const currentUserId = useNaflis((s) => s.currentUserId);

  if (!prompt) return null;

  const title =
    prompt.reason === "location"
      ? `You seem to be at ${prompt.campus}`
      : prompt.reason === "registered"
        ? `Back to ${prompt.campus}?`
        : `Switch to ${prompt.campus}?`;
  const body =
    prompt.reason === "registered"
      ? `You're browsing ${activeCampus}. Switch back to your own campus to see your timetable, notices and nearby deals.`
      : `Your active campus changes what you see — calendar, marketplace, opportunities and Lost & Found.${
          registered && registered !== prompt.campus ? ` Your registered institution stays ${registered}.` : ""
        }`;

  return (
    <AlertDialog open onOpenChange={(open) => !open && resolve(false)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5 text-sky-500" /> {title}
          </AlertDialogTitle>
          <AlertDialogDescription>{body}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => resolve(false)}>Not now</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              resolve(true);
              void saveActiveCampus(currentUserId, prompt.campus);
              toast.success(`Active campus: ${prompt.campus}`);
            }}
          >
            Switch
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
