import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useNaflis, CAMPUSES } from "@/lib/naflis/store";
import { GraduationCap, CheckCircle2, ShieldCheck, Sparkles, Building2, BookOpen } from "lucide-react";
import { toast } from "sonner";

export function StudentVerificationModal() {
  const open = useNaflis((s) => s.verifyModalOpen);
  const setOpen = useNaflis((s) => s.setVerifyModalOpen);
  const studentProfile = useNaflis((s) => s.studentProfile);
  const verifyStudent = useNaflis((s) => s.verifyStudent);

  const [institution, setInstitution] = useState(
    studentProfile?.institution && studentProfile.institution !== "All Campuses"
      ? studentProfile.institution
      : "UG - Legon"
  );
  const [studentId, setStudentId] = useState(studentProfile?.studentId || "");
  const [course, setCourse] = useState(studentProfile?.course || "");
  const [level, setLevel] = useState(studentProfile?.level || "Level 200");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const availableCampuses = CAMPUSES.filter((c) => c !== "All Campuses");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!studentId.trim()) {
      toast.error("Please provide your Student ID number.");
      return;
    }

    setIsSubmitting(true);
    setTimeout(() => {
      verifyStudent({
        studentId: studentId.trim(),
        institution,
        course: course.trim() || "Undergraduate Studies",
        level,
      });
      setIsSubmitting(false);
      setOpen(false);
      toast.success("Student status verified successfully! Student discounts unlocked.");
    }, 600);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-md sm:max-w-lg border bg-card p-6 shadow-premium rounded-2xl">
        <DialogHeader className="space-y-2">
          <div className="flex items-center gap-2">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-sky-500/10 text-sky-500">
              <GraduationCap className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-xl font-bold flex items-center gap-2">
                Student Verification
                {studentProfile.isVerified && (
                  <Badge className="bg-sky-500/15 text-sky-500 border-sky-500/30 gap-1 text-[11px]">
                    <CheckCircle2 className="h-3 w-3" /> Active
                  </Badge>
                )}
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Get verified to unlock exclusive student prices, group buys, and campus escrow privileges.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {studentProfile.isVerified && (
          <div className="rounded-xl border border-sky-500/20 bg-sky-500/5 p-4 text-xs space-y-1.5">
            <div className="flex items-center justify-between font-semibold text-foreground">
              <span className="flex items-center gap-1.5 text-sky-500">
                <ShieldCheck className="h-4 w-4" /> Verified Student ID
              </span>
              <span className="font-mono text-muted-foreground">{studentProfile.studentId}</span>
            </div>
            <p className="text-muted-foreground">
              {studentProfile.institution} · {studentProfile.course} ({studentProfile.level})
            </p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <Label htmlFor="inst-select" className="text-xs font-semibold flex items-center gap-1.5">
              <Building2 className="h-3.5 w-3.5 text-sky-500" /> University / Campus
            </Label>
            <select
              id="inst-select"
              value={institution}
              onChange={(e) => setInstitution(e.target.value)}
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
            >
              {availableCampuses.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="stu-id" className="text-xs font-semibold">
                Student ID Number
              </Label>
              <Input
                id="stu-id"
                value={studentId}
                onChange={(e) => setStudentId(e.target.value)}
                placeholder="e.g. 10984523"
                className="text-sm"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="stu-level" className="text-xs font-semibold">
                Academic Level
              </Label>
              <select
                id="stu-level"
                value={level}
                onChange={(e) => setLevel(e.target.value)}
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
              >
                <option value="Level 100">Level 100 (Freshman)</option>
                <option value="Level 200">Level 200 (Sophomore)</option>
                <option value="Level 300">Level 300 (Junior)</option>
                <option value="Level 400">Level 400 (Senior)</option>
                <option value="Postgraduate">Postgraduate / Masters</option>
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="stu-course" className="text-xs font-semibold flex items-center gap-1.5">
              <BookOpen className="h-3.5 w-3.5 text-sky-500" /> Program / Major
            </Label>
            <Input
              id="stu-course"
              value={course}
              onChange={(e) => setCourse(e.target.value)}
              placeholder="e.g. BSc. Computer Engineering, BA Economics"
              className="text-sm"
            />
          </div>

          <div className="pt-2 flex justify-end gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm" className="bg-sky-500 hover:bg-sky-600 text-white" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Sparkles className="h-4 w-4 mr-1.5 animate-spin" /> Verifying...
                </>
              ) : studentProfile.isVerified ? (
                "Update Verification"
              ) : (
                "Verify Status"
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
