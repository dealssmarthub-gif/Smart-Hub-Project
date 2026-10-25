import { useState } from "react";
import { Label } from "@/components/ui/label";
import { INSTITUTIONS, institutionOfCampus } from "@/lib/naflis/permissions";
import type { StudentAnswer } from "@/lib/naflis/studentAnswer";

const select =
  "h-11 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

/**
 * "Are you a student?" — yes then institution and campus. Self-declared and
 * saved as profile fields only: it decides what you see, never what you can do.
 */
export function StudentQuestion({
  value,
  onChange,
}: {
  value: StudentAnswer;
  onChange: (a: StudentAnswer) => void;
}) {
  // The campus decides the institution; until a campus is picked, remember the institution chosen.
  const [picked, setPicked] = useState(() => institutionOfCampus(value.campus)?.id ?? "");
  const institutionId = value.campus ? (institutionOfCampus(value.campus)?.id ?? picked) : picked;
  const institution = INSTITUTIONS.find((i) => i.id === institutionId);
  const pick = (id: string) => {
    const inst = INSTITUTIONS.find((i) => i.id === id);
    setPicked(id);
    // One campus: choose it straight away.
    onChange({ isStudent: true, campus: inst?.campuses.length === 1 ? inst.campuses[0] : "" });
  };
  const choice = (yes: boolean) =>
    `inline-flex min-h-11 flex-1 items-center justify-center rounded-xl border px-4 text-sm font-semibold transition ${
      value.isStudent === yes
        ? "border-primary bg-primary-soft text-accent-foreground"
        : "border-border bg-card hover:bg-accent"
    }`;

  return (
    <fieldset className="space-y-3">
      <legend className="mb-1.5 text-sm font-medium">Are you a student?</legend>
      <div className="flex gap-2">
        <button
          type="button"
          aria-pressed={value.isStudent === true}
          className={choice(true)}
          onClick={() => onChange({ isStudent: true, campus: value.campus })}
        >
          Yes
        </button>
        <button
          type="button"
          aria-pressed={value.isStudent === false}
          className={choice(false)}
          onClick={() => onChange({ isStudent: false, campus: "" })}
        >
          No
        </button>
      </div>
      {value.isStudent && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="student-institution">Institution</Label>
            <select
              id="student-institution"
              className={select}
              value={institutionId}
              onChange={(e) => pick(e.target.value)}
              required
            >
              <option value="" disabled>
                Choose…
              </option>
              {INSTITUTIONS.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="student-campus">Campus</Label>
            <select
              id="student-campus"
              className={select}
              value={value.campus}
              disabled={!institution}
              onChange={(e) => onChange({ isStudent: true, campus: e.target.value })}
              required
            >
              <option value="" disabled>
                {institution ? "Choose…" : "Choose an institution first"}
              </option>
              {(institution?.campuses ?? []).map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}
    </fieldset>
  );
}
