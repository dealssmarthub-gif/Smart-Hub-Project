import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import {
  BookOpen,
  Search,
  Download,
  FileText,
  Building2,
  CheckCircle2,
  UploadCloud,
  Share2,
  Eye,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  useNaflis,
  CAMPUSES,
  RESOURCE_TYPES,
  type StudentListing,
} from "@/lib/naflis/store";
import { toast } from "sonner";

export const Route = createFileRoute("/student-os/resources")({
  component: StudentResources,
});

function StudentResources() {
  const selectedCampus = useNaflis((s) => s.selectedCampus);
  const setSelectedCampus = useNaflis((s) => s.setSelectedCampus);
  const studentListings = useNaflis((s) => s.studentListings);
  const incrementResourceDownload = useNaflis((s) => s.incrementResourceDownload);

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedType, setSelectedType] = useState<string>("All Types");
  const [previewResource, setPreviewResource] = useState<StudentListing | null>(null);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);

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
      resourceType: uploadType as any,
      courseCode: uploadCourse.trim(),
      downloads: 1,
    });

    setUploadModalOpen(false);
    setUploadTitle("");
    setUploadCourse("");
    setUploadDesc("");
    toast.success("Study material shared successfully with your campus!");
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-5">
        <div>
          <div className="flex items-center gap-2">
            <BookOpen className="h-6 w-6 text-sky-500" />
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight">
              Study Toolkits & Resource Hub
            </h1>
          </div>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
            Free access to verified lecture notes, solved past exam questions, formula sheets, and campus survival guides.
          </p>
        </div>

        <Button
          onClick={() => setUploadModalOpen(true)}
          className="bg-sky-500 hover:bg-sky-600 text-white font-medium text-xs sm:text-sm self-start sm:self-auto gap-1.5"
        >
          <UploadCloud className="h-4 w-4" /> Upload Material
        </Button>
      </div>

      {/* Search and Campus Filter */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by course code (e.g. DCIT 101, MATH 121), subject, or title..."
            className="pl-9 text-xs sm:text-sm"
          />
        </div>

        <div className="flex items-center gap-2">
          <select
            value={selectedCampus}
            onChange={(e) => setSelectedCampus(e.target.value)}
            className="h-9 rounded-lg border bg-card px-2.5 text-xs font-semibold text-foreground focus:border-sky-500 focus:outline-none"
          >
            {CAMPUSES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Resource Type Pills */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar">
        {RESOURCE_TYPES.map((type) => (
          <button
            key={type}
            onClick={() => setSelectedType(type)}
            className={`whitespace-nowrap rounded-full px-3 py-1 text-xs font-semibold transition ${
              selectedType === type
                ? "bg-sky-500 text-white shadow-sm"
                : "bg-muted text-muted-foreground hover:bg-accent hover:text-foreground"
            }`}
          >
            {type}
          </button>
        ))}
      </div>

      {/* Resource Grid */}
      {resourceItems.length === 0 ? (
        <div className="rounded-2xl border border-dashed p-12 text-center space-y-3">
          <BookOpen className="h-12 w-12 mx-auto text-muted-foreground opacity-40" />
          <h3 className="text-base font-bold text-foreground">No resources found</h3>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto">
            No study guides or past questions match this search for {selectedCampus}. Share yours with classmates!
          </p>
          <Button
            size="sm"
            onClick={() => setUploadModalOpen(true)}
            className="bg-sky-500 hover:bg-sky-600 text-white text-xs"
          >
            Upload Material
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {resourceItems.map((item) => (
            <div
              key={item.id}
              className="flex flex-col justify-between rounded-2xl border bg-card p-5 hover:border-sky-500/50 hover:shadow-premium transition"
            >
              <div className="space-y-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge className="bg-sky-500/15 text-sky-500 border-sky-500/30 text-[10px]">
                      {item.resourceType}
                    </Badge>
                    {item.courseCode && (
                      <Badge variant="outline" className="font-mono text-[10px]">
                        {item.courseCode}
                      </Badge>
                    )}
                    <span className="text-[11px] text-muted-foreground">· {item.campus}</span>
                  </div>

                  <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                    <Download className="h-3 w-3 text-sky-500" />
                    {item.downloads || 0} downloads
                  </span>
                </div>

                <div>
                  <h3 className="text-sm sm:text-base font-bold text-foreground leading-snug">
                    {item.title}
                  </h3>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                    {item.description}
                  </p>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <FileText className="h-4 w-4 text-sky-500" />
                  <span>Verified Exam Pack</span>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setPreviewResource(item)}
                    className="text-xs h-8 text-muted-foreground hover:text-foreground"
                  >
                    <Eye className="h-3.5 w-3.5 mr-1" /> Preview
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => handleDownload(item)}
                    className="bg-sky-500 hover:bg-sky-600 text-white text-xs h-8 gap-1 shadow-sm"
                  >
                    <Download className="h-3.5 w-3.5" /> Download PDF
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Preview Dialog */}
      {previewResource && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border bg-card p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <Badge className="bg-sky-500 text-white text-xs">
                {previewResource.resourceType}
              </Badge>
              <button
                onClick={() => setPreviewResource(null)}
                className="text-muted-foreground hover:text-foreground text-sm"
              >
                ✕
              </button>
            </div>

            <div className="space-y-1">
              <h3 className="text-base font-bold text-foreground">{previewResource.title}</h3>
              <p className="text-xs text-muted-foreground">
                {previewResource.campus} · Course: {previewResource.courseCode || "General"}
              </p>
            </div>

            <div className="rounded-xl border bg-muted/40 p-4 text-xs text-foreground/80 leading-relaxed max-h-48 overflow-y-auto font-mono">
              <p className="font-bold mb-2">--- PREVIEW DOCUMENT SUMMARY ---</p>
              <p>{previewResource.description}</p>
              <p className="mt-3 text-muted-foreground">
                ✓ Full questions & marking scheme verified by peer study group.
              </p>
              <p className="text-muted-foreground">
                ✓ Step-by-step calculation breakdowns included.
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button size="sm" variant="outline" onClick={() => setPreviewResource(null)}>
                Close
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  handleDownload(previewResource);
                  setPreviewResource(null);
                }}
                className="bg-sky-500 hover:bg-sky-600 text-white text-xs gap-1"
              >
                <Download className="h-3.5 w-3.5" /> Download Full Document
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Upload Modal */}
      {uploadModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border bg-card p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <UploadCloud className="h-5 w-5 text-sky-500" />
                <h3 className="text-base font-bold text-foreground">Upload Study Material</h3>
              </div>
              <button
                onClick={() => setUploadModalOpen(false)}
                className="text-muted-foreground hover:text-foreground text-sm"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleUploadSubmit} className="space-y-3 pt-1">
              <div className="space-y-1">
                <label className="text-xs font-semibold">Title</label>
                <Input
                  value={uploadTitle}
                  onChange={(e) => setUploadTitle(e.target.value)}
                  placeholder="e.g. DCIT 201 Midsem Solved Questions"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-xs font-semibold">Resource Type</label>
                  <select
                    value={uploadType}
                    onChange={(e) => setUploadType(e.target.value)}
                    className="w-full rounded-lg border bg-background px-2.5 py-1.5 text-xs focus:border-sky-500 focus:outline-none"
                  >
                    <option value="Past Questions">Past Questions</option>
                    <option value="Lecture Notes">Lecture Notes</option>
                    <option value="Summary / Cheatsheet">Summary / Cheatsheet</option>
                    <option value="Lab Manual">Lab Manual</option>
                    <option value="Campus Guide">Campus Guide</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold">Course Code</label>
                  <Input
                    value={uploadCourse}
                    onChange={(e) => setUploadCourse(e.target.value)}
                    placeholder="e.g. DCIT 201"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold">Campus</label>
                <select
                  value={uploadCampus}
                  onChange={(e) => setUploadCampus(e.target.value)}
                  className="w-full rounded-lg border bg-background px-2.5 py-1.5 text-xs focus:border-sky-500 focus:outline-none"
                >
                  {CAMPUSES.filter((c) => c !== "All Campuses").map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold">Description / Topics Covered</label>
                <Input
                  value={uploadDesc}
                  onChange={(e) => setUploadDesc(e.target.value)}
                  placeholder="e.g. Covers Trees, Graphs, Sorting algorithms with exam solutions"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setUploadModalOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" size="sm" className="bg-sky-500 hover:bg-sky-600 text-white">
                  Publish Resource
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
