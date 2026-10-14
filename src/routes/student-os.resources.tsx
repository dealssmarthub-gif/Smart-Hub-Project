import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useReturnFocus } from "@/hooks/useReturnFocus";
import {
  BookOpen,
  Search,
  Download,
  FileText,
  UploadCloud,
  Eye,
  CalendarDays,
  Ticket,
  Briefcase,
  SearchCheck,
  ChevronDown,
  CheckCircle2,
} from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  CampusHeader, NoticeDialog, campusCard, campusPrimaryBtn, campusSecondaryBtn, campusSelect,
} from "@/components/naflis/campus/CampusBlocks";
import { SectionHeader, SrcNoticeRow, Tile, type TileTone } from "@/components/naflis/home/HomeBlocks";
import {
  useNaflis,
  CAMPUSES,
  RESOURCE_TYPES,
  type CampusEvent,
  type StudentListing,
} from "@/lib/naflis/store";
import { toast } from "sonner";

export const Route = createFileRoute("/student-os/resources")({
  component: StudentResources,
});

// Friendlier chip labels; the filter values themselves are unchanged.
const TYPE_LABEL: Record<string, string> = {
  "All Types": "All",
  "Past Questions": "Past questions",
  "Lecture Notes": "Lecture notes",
  "Summary / Cheatsheet": "Cheatsheets",
  "Lab Manual": "Lab manuals",
  "Campus Guide": "Campus guide",
};

// Each resource type keeps one pastel colour for its file icon.
const TYPE_TONE: Record<string, { bg: string; ink: string }> = {
  "Past Questions": { bg: "bg-tile-peach", ink: "text-peach-ink" },
  "Lecture Notes": { bg: "bg-tile-lavender", ink: "text-accent-foreground" },
  "Summary / Cheatsheet": { bg: "bg-tile-mint", ink: "text-verified" },
  "Lab Manual": { bg: "bg-tile-sky", ink: "text-[#1d4ed8] dark:text-[#93b4ff]" },
  "Campus Guide": { bg: "bg-tile-butter", ink: "text-[#7a5200] dark:text-[#f5d27a]" },
};
const OTHER_TONE = { bg: "bg-tile-rose", ink: "text-[#9d1d4b] dark:text-[#ff9fbd]" };

const AROUND: { tone: TileTone; icon: typeof CalendarDays; title: string; hint: string; to: string }[] = [
  { tone: "lavender", icon: CalendarDays, title: "Calendar", hint: "Lectures, labs, exams and SRC events.", to: "/student-os/calendar" },
  { tone: "peach", icon: Ticket, title: "Events & tickets", hint: "Campus events with QR tickets.", to: "/student-os/events" },
  { tone: "mint", icon: Briefcase, title: "Opportunities", hint: "Jobs, internships and scholarships.", to: "/student-os/opportunities" },
  { tone: "rose", icon: SearchCheck, title: "Lost & found", hint: "Report or claim lost items.", to: "/student-os/lost-found" },
];

function StudentResources() {
  const selectedCampus = useNaflis((s) => s.selectedCampus);
  const requestCampusSwitch = useNaflis((s) => s.requestCampusSwitch);
  const studentListings = useNaflis((s) => s.studentListings);
  const incrementResourceDownload = useNaflis((s) => s.incrementResourceDownload);
  const campusEvents = useNaflis((s) => s.campusEvents);

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedType, setSelectedType] = useState<string>("All Types");
  const [previewResource, setPreviewResource] = useState<StudentListing | null>(null);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const previewFocus = useReturnFocus(!!previewResource);
  const uploadFocus = useReturnFocus(uploadModalOpen);
  const [openNotice, setOpenNotice] = useState<CampusEvent | null>(null);

  // New resource upload state
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadType, setUploadType] = useState<string>("Past Questions");
  const [uploadCourse, setUploadCourse] = useState("");
  const [uploadCampus, setUploadCampus] = useState(
    selectedCampus !== "All Campuses" ? selectedCampus : "UG - Legon"
  );
  const [uploadDesc, setUploadDesc] = useState("");

  const addStudentListing = useNaflis((s) => s.addStudentListing);

  const resourceItems = useMemo(() => {
    return studentListings
      .filter((item) => !!item.resourceType)
      .filter((item) => {
        const matchCampus =
          selectedCampus === "All Campuses" ||
          item.campus === "All Campuses" ||
          item.campus === selectedCampus;

        const matchType =
          selectedType === "All Types" || item.resourceType === selectedType;

        const matchSearch =
          !searchQuery.trim() ||
          item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          item.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (item.courseCode &&
            item.courseCode.toLowerCase().includes(searchQuery.toLowerCase()));

        return matchCampus && matchType && matchSearch;
      })
      .sort((a, b) => (b.downloads || 0) - (a.downloads || 0));
  }, [studentListings, selectedCampus, selectedType, searchQuery]);

  // Pinned SRC notices for the active campus (the same notices the landing page ticker shows).
  const notices = useMemo(
    () =>
      campusEvents
        .filter((e) => e.pinned && (selectedCampus === "All Campuses" || e.campus === selectedCampus || e.campus === "All Campuses"))
        .slice(0, 3),
    [campusEvents, selectedCampus]
  );

  const handleDownload = (item: StudentListing) => {
    incrementResourceDownload(item.id);
    toast.success(`Download started: ${item.title}. File saved to your downloads.`);
  };

  const handleUploadSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadTitle.trim()) {
      toast.error("Please enter a title for the study material.");
      return;
    }

    addStudentListing({
      title: uploadTitle.trim(),
      category: "Textbooks & Course Notes",
      price: 0,
      campus: uploadCampus,
      condition: "Brand New",
      sellerName: "Campus Contributor",
      sellerId: "u_student",
      image: "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=800&q=80",
      description: uploadDesc.trim() || "Uploaded by student contributor.",
      hostelLocation: "Digital Resource · Instant Download",
      isVerifiedStudent: true,
      resourceType: uploadType as StudentListing["resourceType"],
      courseCode: uploadCourse.trim(),
      downloads: 1,
    });

    setUploadModalOpen(false);
    setUploadTitle("");
    setUploadCourse("");
    setUploadDesc("");
    toast.success("Study material shared successfully with your campus!");
  };

  const formSelect = `${campusSelect} w-full`;

  return (
    <div className="space-y-6">
      <CampusHeader
        icon={BookOpen}
        title="Study Toolkits & Resource Hub"
        subtitle="Free access to verified lecture notes, solved past exam questions, formula sheets, and campus survival guides."
        actions={
          <button type="button" onClick={() => setUploadModalOpen(true)} className={campusPrimaryBtn}>
            <UploadCloud className="h-4 w-4" strokeWidth={1.8} /> Upload Material
          </button>
        }
      />

      {/* Search and Campus Filter */}
      <div className="flex flex-col gap-2 sm:flex-row">
        <label className="relative flex-1">
          <span className="sr-only">Search study materials</span>
          <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" strokeWidth={1.8} />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by course code (e.g. DCIT 101, MATH 121), subject, or title..."
            className="h-12 w-full rounded-2xl border border-border-soft bg-card pl-12 pr-4 text-sm text-foreground shadow-soft placeholder:text-muted-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>
        <label className="relative">
          <span className="sr-only">Campus</span>
          <select
            value={selectedCampus}
            onChange={(e) => requestCampusSwitch(e.target.value, "manual")}
            className={`${campusSelect} h-12 w-full sm:w-56`}
          >
            {CAMPUSES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" strokeWidth={1.8} aria-hidden />
        </label>
      </div>

      {/* Resource Type Pills */}
      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:-mx-6 sm:px-6 md:mx-0 md:px-0" role="group" aria-label="Resource type">
        {RESOURCE_TYPES.map((type) => (
          <button
            key={type}
            type="button"
            onClick={() => setSelectedType(type)}
            aria-pressed={selectedType === type}
            title={type}
            className={`min-h-11 shrink-0 whitespace-nowrap rounded-full px-4 text-xs font-bold transition ${
              selectedType === type
                ? "bg-primary text-primary-foreground"
                : "bg-card text-subtle-foreground shadow-soft hover:bg-accent hover:text-accent-foreground"
            }`}
          >
            {TYPE_LABEL[type] ?? type}
          </button>
        ))}
      </div>

      {/* Resources */}
      {resourceItems.length === 0 ? (
        <div className={`${campusCard} space-y-3 border-dashed p-10 text-center`}>
          <BookOpen className="mx-auto h-12 w-12 text-muted-foreground" strokeWidth={1.8} />
          <h2 className="text-base font-bold text-foreground">No resources found</h2>
          <p className="mx-auto max-w-sm text-sm text-muted-foreground">
            No study guides or past questions match this search for {selectedCampus}. Share yours with classmates!
          </p>
          <button type="button" onClick={() => setUploadModalOpen(true)} className={campusPrimaryBtn}>Upload Material</button>
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {resourceItems.map((item) => {
            const tone = TYPE_TONE[item.resourceType ?? ""] ?? OTHER_TONE;
            return (
              <li key={item.id} className={`${campusCard} flex flex-col gap-3 p-4`}>
                <div className="flex items-start gap-3">
                  <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl ${tone.bg} ${tone.ink}`} aria-hidden>
                    <FileText className="h-6 w-6" strokeWidth={1.8} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <h2 className="text-sm font-bold leading-snug text-foreground sm:text-base">{item.title}</h2>
                    <p className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-subtle-foreground">
                      {item.courseCode && <span className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[11px] font-bold text-foreground">{item.courseCode}</span>}
                      <span className={`font-bold ${tone.ink}`}>{item.resourceType}</span>
                      <span aria-hidden>·</span>
                      <span>{item.campus}</span>
                      <span aria-hidden>·</span>
                      <span className="inline-flex items-center gap-1">
                        <Download className="h-3 w-3" strokeWidth={1.8} /> {item.downloads || 0} downloads
                      </span>
                    </p>
                  </div>
                </div>
                <p className="text-xs leading-relaxed text-subtle-foreground">{item.description}</p>
                <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-border-soft pt-3">
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-verified">
                    <CheckCircle2 className="h-4 w-4" strokeWidth={1.8} /> Verified Exam Pack
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setPreviewResource(item)}
                      className="inline-flex min-h-11 items-center gap-1.5 rounded-xl px-3 text-xs font-bold text-subtle-foreground transition hover:bg-accent hover:text-accent-foreground"
                    >
                      <Eye className="h-4 w-4" strokeWidth={1.8} /> Preview
                    </button>
                    <button type="button" onClick={() => handleDownload(item)} className={`${campusPrimaryBtn} px-3 text-xs`}>
                      <Download className="h-4 w-4" strokeWidth={1.8} /> Download PDF
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* Around campus */}
      <section>
        <SectionHeader title="Around campus" />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
          {AROUND.map((t) => <Tile key={t.to} {...t} />)}
        </div>
      </section>

      {/* SRC notices */}
      <section className={`${campusCard} p-4 sm:p-5`}>
        <SectionHeader title="SRC notices" hint={`Pinned announcements for ${selectedCampus}. They also appear in your Calendar.`} />
        {notices.length === 0 ? (
          <p className="rounded-2xl bg-muted p-4 text-sm text-muted-foreground">No pinned SRC notices for this campus right now.</p>
        ) : (
          <div className="space-y-2">
            {notices.map((n) => <SrcNoticeRow key={n.id} title={n.title} campus={n.campus} onOpen={() => setOpenNotice(n)} />)}
          </div>
        )}
      </section>
      <NoticeDialog notice={openNotice} onClose={() => setOpenNotice(null)} />

      {/* Preview Dialog */}
      <Dialog open={!!previewResource} onOpenChange={(open) => !open && setPreviewResource(null)}>
        <DialogContent className="max-w-lg rounded-[28px]" onCloseAutoFocus={previewFocus}>
          {previewResource && (
            <>
              <DialogHeader>
                <span className="w-fit rounded-full bg-primary px-2.5 py-0.5 text-xs font-bold text-primary-foreground">{previewResource.resourceType}</span>
                <DialogTitle className="pt-2 text-base font-extrabold">{previewResource.title}</DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground">
                  {previewResource.campus} · Course: {previewResource.courseCode || "General"}
                </DialogDescription>
              </DialogHeader>
              <div className="max-h-48 overflow-y-auto rounded-2xl bg-muted p-4 font-mono text-xs leading-relaxed text-foreground/90">
                <p className="mb-2 font-bold">--- PREVIEW DOCUMENT SUMMARY ---</p>
                <p>{previewResource.description}</p>
                <p className="mt-3 text-subtle-foreground">✓ Full questions & marking scheme verified by peer study group.</p>
                <p className="text-subtle-foreground">✓ Step-by-step calculation breakdowns included.</p>
              </div>
              <div className="flex flex-wrap justify-end gap-2 pt-2">
                <button type="button" onClick={() => setPreviewResource(null)} className={campusSecondaryBtn}>Close</button>
                <button
                  type="button"
                  onClick={() => {
                    handleDownload(previewResource);
                    setPreviewResource(null);
                  }}
                  className={campusPrimaryBtn}
                >
                  <Download className="h-4 w-4" strokeWidth={1.8} /> Download Full Document
                </button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Upload Modal */}
      <Dialog open={uploadModalOpen} onOpenChange={setUploadModalOpen}>
        <DialogContent className="max-w-md rounded-[28px]" onCloseAutoFocus={uploadFocus}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-extrabold">
              <UploadCloud className="h-5 w-5 text-link" strokeWidth={1.8} /> Upload Study Material
            </DialogTitle>
            <DialogDescription className="sr-only">Share study material with your campus.</DialogDescription>
          </DialogHeader>

          <form onSubmit={handleUploadSubmit} className="space-y-3 pt-1">
            <div className="space-y-1">
              <label htmlFor="up-title" className="text-xs font-bold">Title</label>
              <Input
                id="up-title"
                value={uploadTitle}
                onChange={(e) => setUploadTitle(e.target.value)}
                placeholder="e.g. DCIT 201 Midsem Solved Questions"
                className="h-11 rounded-xl"
                required
              />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="relative space-y-1">
                <label htmlFor="up-type" className="text-xs font-bold">Resource Type</label>
                <select id="up-type" value={uploadType} onChange={(e) => setUploadType(e.target.value)} className={formSelect}>
                  <option value="Past Questions">Past Questions</option>
                  <option value="Lecture Notes">Lecture Notes</option>
                  <option value="Summary / Cheatsheet">Summary / Cheatsheet</option>
                  <option value="Lab Manual">Lab Manual</option>
                  <option value="Campus Guide">Campus Guide</option>
                </select>
                <ChevronDown className="pointer-events-none absolute bottom-3.5 right-3 h-4 w-4 text-muted-foreground" strokeWidth={1.8} aria-hidden />
              </div>

              <div className="space-y-1">
                <label htmlFor="up-course" className="text-xs font-bold">Course Code</label>
                <Input id="up-course" value={uploadCourse} onChange={(e) => setUploadCourse(e.target.value)} placeholder="e.g. DCIT 201" className="h-11 rounded-xl" />
              </div>
            </div>

            <div className="relative space-y-1">
              <label htmlFor="up-campus" className="text-xs font-bold">Campus</label>
              <select id="up-campus" value={uploadCampus} onChange={(e) => setUploadCampus(e.target.value)} className={formSelect}>
                {CAMPUSES.filter((c) => c !== "All Campuses").map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute bottom-3.5 right-3 h-4 w-4 text-muted-foreground" strokeWidth={1.8} aria-hidden />
            </div>

            <div className="space-y-1">
              <label htmlFor="up-desc" className="text-xs font-bold">Description / Topics Covered</label>
              <Input
                id="up-desc"
                value={uploadDesc}
                onChange={(e) => setUploadDesc(e.target.value)}
                placeholder="e.g. Covers Trees, Graphs, Sorting algorithms with exam solutions"
                className="h-11 rounded-xl"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setUploadModalOpen(false)} className={campusSecondaryBtn}>Cancel</button>
              <button type="submit" className={campusPrimaryBtn}>Publish Resource</button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
