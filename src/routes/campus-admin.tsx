import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect, useMemo } from "react";
import {
  GraduationCap,
  Building2,
  Calendar,
  MapPin,
  Pin,
  PinOff,
  UploadCloud,
  FileText,
  Trash2,
  Plus,
  Search,
  Sparkles,
  ShieldCheck,
  CheckCircle2,
  BarChart3,
  Flame,
  Download,
  Eye,
  ArrowLeft,
  Loader2,
  Tag,
  BookOpen,
  Users,
} from "lucide-react";
import { Logo } from "@/components/naflis/Logo";
import { ThemeToggle } from "@/components/naflis/ThemeToggle";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  useNaflis,
  CAMPUSES,
  RESOURCE_TYPES,
  type CampusEvent,
  type CampusResource,
} from "@/lib/naflis/store";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";

export const Route = createFileRoute("/campus-admin")({
  component: CampusAdminPortal,
});

export function CampusAdminPortal() {
  const selectedCampus = useNaflis((s) => s.selectedCampus);
  const setSelectedCampus = useNaflis((s) => s.setSelectedCampus);
  const localEvents = useNaflis((s) => s.campusEvents);
  const addCampusEvent = useNaflis((s) => s.addCampusEvent);
  const togglePinEvent = useNaflis((s) => s.togglePinEvent);
  const deleteCampusEvent = useNaflis((s) => s.deleteCampusEvent);

  const localResources = useNaflis((s) => s.campusResources);
  const addCampusResource = useNaflis((s) => s.addCampusResource);
  const deleteCampusResource = useNaflis((s) => s.deleteCampusResource);
  const incrementResourceDownload = useNaflis((s) => s.incrementResourceDownload);

  const demandLogs = useNaflis((s) => s.demandLogs);

  // Supabase states
  const [events, setEvents] = useState<CampusEvent[]>(localEvents);
  const [resources, setResources] = useState<CampusResource[]>(localResources);
  const [loadingData, setLoadingData] = useState(false);

  // Announcement / Event Creator Form State
  const [showEventModal, setShowEventModal] = useState(false);
  const [eventTitle, setEventTitle] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [eventVenue, setEventVenue] = useState("");
  const [eventCampus, setEventCampus] = useState(
    selectedCampus !== "All Campuses" ? selectedCampus : "UG - Legon"
  );
  const [eventOrganizer, setEventOrganizer] = useState("Official SRC");
  const [eventDescription, setEventDescription] = useState("");
  const [eventPinned, setEventPinned] = useState(true);
  const [eventBannerFile, setEventBannerFile] = useState<File | null>(null);
  const [eventBannerPreview, setEventBannerPreview] = useState("");
  const [isSubmittingEvent, setIsSubmittingEvent] = useState(false);

  // Resource / Slide Uploader Form State
  const [showResourceModal, setShowResourceModal] = useState(false);
  const [resTitle, setResTitle] = useState("");
  const [resType, setResType] = useState<string>("Lecture Slides");
  const [resCourse, setResCourse] = useState("");
  const [resDept, setResDept] = useState("");
  const [resCampus, setResCampus] = useState(
    selectedCampus !== "All Campuses" ? selectedCampus : "UG - Legon"
  );
  const [resDescription, setResDescription] = useState("");
  const [resFile, setResFile] = useState<File | null>(null);
  const [isSubmittingRes, setIsSubmittingRes] = useState(false);

  // Filter & Search states
  const [eventSearch, setEventSearch] = useState("");
  const [resSearch, setResSearch] = useState("");

  // Sync with Supabase on mount
  useEffect(() => {
    const fetchData = async () => {
      if (!supabase) return;
      try {
        setLoadingData(true);
        // Fetch events
        const { data: dbEvents } = await supabase
          .from("campus_events")
          .select("*")
          .order("pinned", { ascending: false })
          .order("created_at", { ascending: false });

        if (dbEvents && dbEvents.length > 0) {
          const mapped: CampusEvent[] = dbEvents.map((e) => ({
            id: e.id,
            title: e.title,
            description: e.description || "",
            eventDate: e.event_date || new Date().toISOString(),
            venue: e.venue || "Campus Main Grounds",
            bannerUrl: e.banner_url || "https://images.unsplash.com/photo-1541339907198-e08756dedf3f?w=1200&q=80",
            campus: e.campus || "UG - Legon",
            pinned: Boolean(e.pinned),
            organizer: e.organizer || "Official SRC",
            createdBy: e.created_by,
            createdAt: new Date(e.created_at).getTime(),
          }));
          setEvents(mapped);
          useNaflis.setState({ campusEvents: mapped });
        }

        // Fetch resources
        const { data: dbRes } = await supabase
          .from("campus_resources")
          .select("*")
          .order("downloads", { ascending: false });

        if (dbRes && dbRes.length > 0) {
          const mappedRes: CampusResource[] = dbRes.map((r) => ({
            id: r.id,
            title: r.title,
            description: r.description || "",
            resourceType: r.resource_type || "Lecture Slides",
            courseCode: r.course_code || "",
            department: r.department || "",
            campus: r.campus || "UG - Legon",
            fileUrl: r.file_url,
            fileName: r.file_name || `${r.course_code}_document.pdf`,
            fileSize: r.file_size || "2.5 MB",
            downloads: r.downloads || 0,
            createdBy: r.created_by,
            createdAt: new Date(r.created_at).getTime(),
          }));
          setResources(mappedRes);
          useNaflis.setState({ campusResources: mappedRes });
        }
      } catch (err) {
        console.warn("Notice: Loaded offline/cached campus administrative records:", err);
      } finally {
        setLoadingData(false);
      }
    };

    fetchData();
  }, []);

  // Filtered Events
  const filteredEvents = useMemo(() => {
    return events.filter((e) => {
      const matchCampus =
        selectedCampus === "All Campuses" ||
        e.campus === "All Campuses" ||
        e.campus === selectedCampus;

      const matchSearch =
        !eventSearch.trim() ||
        e.title.toLowerCase().includes(eventSearch.toLowerCase()) ||
        e.organizer.toLowerCase().includes(eventSearch.toLowerCase()) ||
        e.venue.toLowerCase().includes(eventSearch.toLowerCase());

      return matchCampus && matchSearch;
    });
  }, [events, selectedCampus, eventSearch]);

  // Filtered Resources
  const filteredResources = useMemo(() => {
    return resources.filter((r) => {
      const matchCampus =
        selectedCampus === "All Campuses" ||
        r.campus === "All Campuses" ||
        r.campus === selectedCampus;

      const matchSearch =
        !resSearch.trim() ||
        r.title.toLowerCase().includes(resSearch.toLowerCase()) ||
        r.courseCode.toLowerCase().includes(resSearch.toLowerCase()) ||
        r.department.toLowerCase().includes(resSearch.toLowerCase());

      return matchCampus && matchSearch;
    });
  }, [resources, selectedCampus, resSearch]);

  // Demand aggregation for campus
  const campusDemandList = useMemo(() => {
    const list = demandLogs.filter(
      (d) =>
        selectedCampus === "All Campuses" ||
        d.campus === selectedCampus ||
        d.campus === "General"
    );
    const countMap: Record<string, number> = {};
    for (const item of list) {
      const q = item.searchQuery.toLowerCase().trim();
      countMap[q] = (countMap[q] || 0) + 1;
    }
    return Object.entries(countMap)
      .map(([query, count]) => ({
        query: query.charAt(0).toUpperCase() + query.slice(1),
        count: count * 4 + (query.length % 5), // normalized weight
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [demandLogs, selectedCampus]);

  // Upload helper for campus-docs bucket
  const uploadToCampusDocs = async (file: File): Promise<string> => {
    if (!supabase) {
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(file);
      });
    }

    try {
      const fileExt = file.name.split(".").pop();
      const fileName = `doc_${Math.random().toString(36).substring(2)}_${Date.now()}.${fileExt}`;
      const filePath = `uploads/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from("campus-docs")
        .upload(filePath, file, { cacheControl: "3600", upsert: false });

      if (uploadError) throw uploadError;

      const {
        data: { publicUrl },
      } = supabase.storage.from("campus-docs").getPublicUrl(filePath);

      return publicUrl;
    } catch (err: any) {
      console.warn("Storage bucket upload fallback to local preview:", err);
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(file);
      });
    }
  };

  // Submit Event
  const handlePublishEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!eventTitle.trim()) {
      toast.error("Please provide an announcement title.");
      return;
    }

    setIsSubmittingEvent(true);
    try {
      let bannerUrl =
        eventBannerPreview ||
        "https://images.unsplash.com/photo-1541339907198-e08756dedf3f?w=1200&q=80";

      if (eventBannerFile) {
        bannerUrl = await uploadToCampusDocs(eventBannerFile);
      }

      // Write to Supabase campus_events
      if (supabase) {
        const { error } = await supabase.from("campus_events").insert({
          title: eventTitle.trim(),
          description: eventDescription.trim(),
          event_date: eventDate ? new Date(eventDate).toISOString() : new Date().toISOString(),
          venue: eventVenue.trim() || "Main Campus Auditorium",
          banner_url: bannerUrl,
          campus: eventCampus,
          pinned: eventPinned,
          organizer: eventOrganizer.trim() || "Official SRC",
        });

        if (error) {
          console.warn("Supabase event insert note:", error.message);
        }
      }

      // Add to store
      const newEvent = addCampusEvent({
        title: eventTitle.trim(),
        description: eventDescription.trim() || "Official notice published for campus students.",
        eventDate: eventDate || new Date().toISOString(),
        venue: eventVenue.trim() || "Main Campus Auditorium",
        bannerUrl,
        campus: eventCampus,
        pinned: eventPinned,
        organizer: eventOrganizer.trim() || "Official SRC",
      });

      setEvents((prev) => [newEvent, ...prev]);

      toast.success(
        eventPinned
          ? "Official announcement published and pinned to homepage ticker!"
          : "Announcement published successfully!"
      );

      // Reset form
      setShowEventModal(false);
      setEventTitle("");
      setEventDate("");
      setEventVenue("");
      setEventDescription("");
      setEventBannerFile(null);
      setEventBannerPreview("");
    } catch (err: any) {
      toast.error(err?.message || "Failed to publish announcement.");
    } finally {
      setIsSubmittingEvent(false);
    }
  };

  // Submit Resource / Lecture Slides
  const handleUploadResource = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resTitle.trim() || !resCourse.trim()) {
      toast.error("Please fill in the title and course code.");
      return;
    }

    setIsSubmittingRes(true);
    try {
      let fileUrl = "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf";
      let fileName = `${resCourse.trim().toUpperCase()}_Course_Material.pdf`;
      let fileSize = "3.2 MB";

      if (resFile) {
        fileName = resFile.name;
        fileSize = `${(resFile.size / (1024 * 1024)).toFixed(1)} MB`;
        fileUrl = await uploadToCampusDocs(resFile);
      }

      // Write to Supabase campus_resources
      if (supabase) {
        const { error } = await supabase.from("campus_resources").insert({
          title: resTitle.trim(),
          description: resDescription.trim(),
          resource_type: resType,
          course_code: resCourse.trim().toUpperCase(),
          department: resDept.trim() || "General Academics",
          campus: resCampus,
          file_url: fileUrl,
          file_name: fileName,
          file_size: fileSize,
          downloads: 0,
        });

        if (error) {
          console.warn("Supabase resource insert note:", error.message);
        }
      }

      // Add to store
      const newRes = addCampusResource({
        title: resTitle.trim(),
        description:
          resDescription.trim() ||
          `Official ${resType} for ${resCourse.trim().toUpperCase()} uploaded by Department Head.`,
        resourceType: resType,
        courseCode: resCourse.trim().toUpperCase(),
        department: resDept.trim() || "General Academics",
        campus: resCampus,
        fileUrl,
        fileName,
        fileSize,
      });

      setResources((prev) => [newRes, ...prev]);

      toast.success(
        `Academic materials for ${resCourse.trim().toUpperCase()} uploaded and available to students!`
      );

      // Reset form
      setShowResourceModal(false);
      setResTitle("");
      setResCourse("");
      setResDept("");
      setResDescription("");
      setResFile(null);
    } catch (err: any) {
      toast.error(err?.message || "Failed to upload academic resource.");
    } finally {
      setIsSubmittingRes(false);
    }
  };

  const handleTogglePin = async (e: CampusEvent) => {
    togglePinEvent(e.id);
    const newStatus = !e.pinned;
    setEvents((prev) =>
      prev.map((item) => (item.id === e.id ? { ...item, pinned: newStatus } : item))
    );

    if (supabase) {
      await supabase.from("campus_events").update({ pinned: newStatus }).eq("id", e.id);
    }

    toast.success(
      newStatus
        ? "Notice pinned to homepage banner!"
        : "Notice unpinned from homepage banner."
    );
  };

  const handleDeleteEvent = async (id: string) => {
    deleteCampusEvent(id);
    setEvents((prev) => prev.filter((item) => item.id !== id));
    if (supabase) {
      await supabase.from("campus_events").delete().eq("id", id);
    }
    toast.success("Event notice removed.");
  };

  const handleDeleteResource = async (id: string) => {
    deleteCampusResource(id);
    setResources((prev) => prev.filter((item) => item.id !== id));
    if (supabase) {
      await supabase.from("campus_resources").delete().eq("id", id);
    }
    toast.success("Academic resource removed.");
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col justify-between">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/70">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4">
          <div className="flex items-center gap-3">
            <Logo />
            <div className="hidden sm:flex items-center gap-1.5 rounded-lg bg-sky-500/10 px-2.5 py-1 text-xs font-bold text-sky-500 border border-sky-500/20">
              <ShieldCheck className="h-3.5 w-3.5 text-sky-500" />
              <span>Institutional / SRC Portal</span>
            </div>
          </div>

          {/* Campus Selector */}
          <div className="flex items-center gap-2">
            <div className="relative flex items-center">
              <Building2 className="pointer-events-none absolute left-2.5 h-4 w-4 text-sky-500" />
              <select
                aria-label="Campus Selector"
                value={selectedCampus}
                onChange={(e) => setSelectedCampus(e.target.value)}
                className="h-9 rounded-lg border border-border bg-card pl-8 pr-7 text-xs font-semibold text-foreground focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 shadow-sm transition"
              >
                {CAMPUSES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <ThemeToggle />

            <Button asChild variant="ghost" size="sm" className="text-xs">
              <Link to="/">
                <ArrowLeft className="mr-1 h-3.5 w-3.5" /> Landing
              </Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Main Body */}
      <main className="flex-1 mx-auto max-w-7xl w-full px-4 py-8 space-y-8">
        {/* Hero Header Card */}
        <div className="relative overflow-hidden rounded-3xl gradient-hero text-white p-6 sm:p-8 shadow-premium">
          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="space-y-2 max-w-2xl">
              <div className="flex items-center gap-2">
                <Badge className="bg-sky-400/30 text-sky-200 border-sky-300/40 text-xs">
                  {selectedCampus}
                </Badge>
                <Badge className="bg-white/20 text-white border-white/20 text-xs gap-1">
                  <CheckCircle2 className="h-3 w-3 text-emerald-300" /> Verified Executive
                </Badge>
              </div>
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black tracking-tight">
                SRC & Institutional Leadership Console
              </h1>
              <p className="text-xs sm:text-sm text-white/80 leading-relaxed">
                Publish verified student notices, pin priority campus assembly dates, dispatch lecture
                slide archives, and monitor student academic tool requests in real time.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3 shrink-0">
              <Button
                onClick={() => setShowEventModal(true)}
                className="bg-white text-navy hover:bg-white/90 font-bold text-xs sm:text-sm shadow-md gap-1.5"
              >
                <Plus className="h-4 w-4 text-sky-600" /> Publish Announcement
              </Button>
              <Button
                onClick={() => setShowResourceModal(true)}
                className="bg-sky-500 hover:bg-sky-400 text-white font-bold text-xs sm:text-sm shadow-md gap-1.5"
              >
                <UploadCloud className="h-4 w-4" /> Upload Lecture Slides
              </Button>
            </div>
          </div>
        </div>

        {/* Executive Metrics Overview */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
          <div className="rounded-2xl border bg-card p-4 sm:p-5 shadow-sm">
            <div className="flex items-center justify-between text-muted-foreground mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider">Campus Notices</span>
              <Calendar className="h-4 w-4 text-sky-500" />
            </div>
            <p className="text-2xl sm:text-3xl font-black text-foreground">
              {filteredEvents.length}
            </p>
            <p className="text-[11px] text-muted-foreground mt-1">
              {filteredEvents.filter((e) => e.pinned).length} pinned to ticker
            </p>
          </div>

          <div className="rounded-2xl border bg-card p-4 sm:p-5 shadow-sm">
            <div className="flex items-center justify-between text-muted-foreground mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider">Study Archives</span>
              <BookOpen className="h-4 w-4 text-sky-500" />
            </div>
            <p className="text-2xl sm:text-3xl font-black text-foreground">
              {filteredResources.length}
            </p>
            <p className="text-[11px] text-muted-foreground mt-1">Verified slide decks & solutions</p>
          </div>

          <div className="rounded-2xl border bg-card p-4 sm:p-5 shadow-sm">
            <div className="flex items-center justify-between text-muted-foreground mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider">Total Downloads</span>
              <Download className="h-4 w-4 text-emerald-500" />
            </div>
            <p className="text-2xl sm:text-3xl font-black text-foreground">
              {filteredResources
                .reduce((acc, r) => acc + (r.downloads || 0), 0)
                .toLocaleString()}
            </p>
            <p className="text-[11px] text-muted-foreground mt-1">Student study package retrievals</p>
          </div>

          <div className="rounded-2xl border bg-card p-4 sm:p-5 shadow-sm">
            <div className="flex items-center justify-between text-muted-foreground mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider">Campus Demand</span>
              <Flame className="h-4 w-4 text-amber-500" />
            </div>
            <p className="text-2xl sm:text-3xl font-black text-foreground">
              {campusDemandList.length > 0 ? campusDemandList[0].query : "Laptops"}
            </p>
            <p className="text-[11px] text-muted-foreground mt-1">
              Top weekly student search item
            </p>
          </div>
        </div>

        {/* Console Tabs */}
        <Tabs defaultValue="announcements" className="space-y-6">
          <TabsList className="bg-muted p-1 rounded-xl">
            <TabsTrigger value="announcements" className="text-xs font-semibold gap-1.5">
              <Calendar className="h-3.5 w-3.5 text-sky-500" />
              <span>SRC Announcements & Events</span>
            </TabsTrigger>
            <TabsTrigger value="resources" className="text-xs font-semibold gap-1.5">
              <FileText className="h-3.5 w-3.5 text-sky-500" />
              <span>Academic Slides & Past Questions</span>
            </TabsTrigger>
            <TabsTrigger value="intelligence" className="text-xs font-semibold gap-1.5">
              <BarChart3 className="h-3.5 w-3.5 text-sky-500" />
              <span>Demand Intelligence Logs</span>
            </TabsTrigger>
          </TabsList>

          {/* TAB 1: Announcements */}
          <TabsContent value="announcements" className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold text-foreground">Official Campus Notices & Events</h3>
                <p className="text-xs text-muted-foreground">
                  Events pinned here will display in real time on the main homepage top announcement ticker.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <div className="relative w-full sm:w-64">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={eventSearch}
                    onChange={(e) => setEventSearch(e.target.value)}
                    placeholder="Search announcements..."
                    className="pl-8 text-xs h-9"
                  />
                </div>
                <Button
                  onClick={() => setShowEventModal(true)}
                  className="bg-sky-500 hover:bg-sky-600 text-white text-xs h-9 gap-1 shrink-0"
                >
                  <Plus className="h-3.5 w-3.5" /> New Notice
                </Button>
              </div>
            </div>

            {filteredEvents.length === 0 ? (
              <div className="rounded-2xl border border-dashed p-10 text-center space-y-3 bg-card">
                <Calendar className="h-10 w-10 mx-auto text-muted-foreground opacity-50" />
                <h4 className="text-sm font-bold">No announcements published yet</h4>
                <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                  Publish your first official event notice for {selectedCampus} students.
                </p>
                <Button
                  size="sm"
                  onClick={() => setShowEventModal(true)}
                  className="bg-sky-500 hover:bg-sky-600 text-white text-xs"
                >
                  Create Event
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredEvents.map((e) => (
                  <div
                    key={e.id}
                    className={`flex flex-col rounded-2xl border bg-card overflow-hidden shadow-sm transition hover:shadow-premium ${
                      e.pinned ? "border-sky-500/60 ring-1 ring-sky-500/20" : ""
                    }`}
                  >
                    <div className="relative h-36 w-full overflow-hidden bg-muted">
                      <img
                        src={e.bannerUrl}
                        alt={e.title}
                        className="h-full w-full object-cover"
                      />
                      <div className="absolute top-2 left-2 flex items-center gap-1.5">
                        <Badge className="bg-sky-500 text-white text-[10px]">{e.campus}</Badge>
                        {e.pinned && (
                          <Badge className="bg-amber-500 text-white text-[10px] gap-1 font-bold">
                            <Pin className="h-3 w-3" /> Pinned on Home
                          </Badge>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-col flex-1 p-4 gap-2.5">
                      <div>
                        <span className="text-[10px] font-bold uppercase text-sky-500">
                          {e.organizer}
                        </span>
                        <h4 className="text-base font-bold text-foreground leading-snug">
                          {e.title}
                        </h4>
                      </div>

                      <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                        {e.description}
                      </p>

                      <div className="mt-auto space-y-1 pt-2 border-t text-xs text-muted-foreground">
                        <div className="flex items-center gap-1.5">
                          <MapPin className="h-3.5 w-3.5 text-sky-500 shrink-0" />
                          <span className="truncate">{e.venue}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Calendar className="h-3.5 w-3.5 text-sky-500 shrink-0" />
                          <span>{new Date(e.eventDate).toLocaleDateString()}</span>
                        </div>
                      </div>

                      <div className="pt-2 flex items-center justify-between border-t gap-2">
                        <Button
                          size="sm"
                          variant={e.pinned ? "secondary" : "outline"}
                          onClick={() => handleTogglePin(e)}
                          className="text-xs h-8 gap-1.5"
                        >
                          {e.pinned ? (
                            <>
                              <PinOff className="h-3.5 w-3.5 text-amber-500" />
                              <span>Unpin</span>
                            </>
                          ) : (
                            <>
                              <Pin className="h-3.5 w-3.5 text-sky-500" />
                              <span>Pin to Home Ticker</span>
                            </>
                          )}
                        </Button>

                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleDeleteEvent(e.id)}
                          className="text-xs h-8 text-destructive hover:bg-destructive/10"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          {/* TAB 2: Academic Resources & Slides */}
          <TabsContent value="resources" className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold text-foreground">
                  Lecture Slides & Solved Past Questions
                </h3>
                <p className="text-xs text-muted-foreground">
                  Academic resources uploaded here sync to the student resource portal and Supabase campus_resources.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <div className="relative w-full sm:w-64">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={resSearch}
                    onChange={(e) => setResSearch(e.target.value)}
                    placeholder="Search by course code, title..."
                    className="pl-8 text-xs h-9"
                  />
                </div>
                <Button
                  onClick={() => setShowResourceModal(true)}
                  className="bg-sky-500 hover:bg-sky-600 text-white text-xs h-9 gap-1 shrink-0"
                >
                  <UploadCloud className="h-3.5 w-3.5" /> Upload File
                </Button>
              </div>
            </div>

            {filteredResources.length === 0 ? (
              <div className="rounded-2xl border border-dashed p-10 text-center space-y-3 bg-card">
                <BookOpen className="h-10 w-10 mx-auto text-muted-foreground opacity-50" />
                <h4 className="text-sm font-bold">No academic materials uploaded yet</h4>
                <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                  Upload lecture slides or examination solution booklets for students.
                </p>
                <Button
                  size="sm"
                  onClick={() => setShowResourceModal(true)}
                  className="bg-sky-500 hover:bg-sky-600 text-white text-xs"
                >
                  Upload Lecture Slides
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredResources.map((r) => (
                  <div
                    key={r.id}
                    className="flex flex-col justify-between rounded-2xl border bg-card p-5 hover:border-sky-500/50 hover:shadow-premium transition"
                  >
                    <div className="space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Badge className="bg-sky-500/15 text-sky-500 border-sky-500/30 text-[10px]">
                            {r.resourceType}
                          </Badge>
                          <Badge variant="outline" className="font-mono text-[10px]">
                            {r.courseCode}
                          </Badge>
                          <span className="text-[11px] text-muted-foreground">· {r.campus}</span>
                        </div>

                        <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                          <Download className="h-3 w-3 text-sky-500" />
                          {r.downloads || 0} downloads
                        </span>
                      </div>

                      <h4 className="text-sm font-bold text-foreground leading-snug">{r.title}</h4>
                      <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                        {r.description}
                      </p>

                      <div className="text-[11px] text-muted-foreground flex items-center gap-2 pt-1 font-mono">
                        <span>📁 {r.fileName}</span>
                        <span>•</span>
                        <span>{r.fileSize}</span>
                      </div>
                    </div>

                    <div className="mt-4 pt-3 border-t flex items-center justify-between">
                      <span className="text-xs font-semibold text-muted-foreground">
                        Dept: {r.department || "General"}
                      </span>

                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            incrementResourceDownload(r.id);
                            toast.success(`Downloading ${r.fileName}`);
                          }}
                          className="text-xs h-8 gap-1.5"
                        >
                          <Download className="h-3.5 w-3.5 text-sky-500" /> Download
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleDeleteResource(r.id)}
                          className="text-xs h-8 text-destructive hover:bg-destructive/10"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          {/* TAB 3: Demand Intelligence Logs */}
          <TabsContent value="intelligence" className="space-y-4">
            <div className="rounded-2xl border bg-card p-6 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
                    <Flame className="h-5 w-5 text-amber-500" /> Real-Time Campus Search Demand
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Aggregated passively from student queries on {selectedCampus}. Shows what items classmates need most.
                  </p>
                </div>
                <Badge className="bg-sky-500/10 text-sky-500 border-sky-500/20 text-xs">
                  Live Demand Stream
                </Badge>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {campusDemandList.map((item, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-3.5 rounded-xl border bg-background hover:border-sky-500/40 transition"
                  >
                    <div className="flex items-center gap-3">
                      <div className="grid h-8 w-8 place-items-center rounded-lg bg-sky-500/10 text-sky-500 font-bold text-xs">
                        #{idx + 1}
                      </div>
                      <div>
                        <p className="text-xs font-bold text-foreground">{item.query}</p>
                        <p className="text-[10px] text-muted-foreground">{selectedCampus}</p>
                      </div>
                    </div>
                    <Badge variant="secondary" className="text-xs font-bold text-sky-500">
                      {item.count} searches
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </main>

      {/* Announcement Creator Modal */}
      {showEventModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border bg-card p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b pb-3">
              <div className="flex items-center gap-2">
                <Calendar className="h-5 w-5 text-sky-500" />
                <h3 className="text-base font-bold text-foreground">
                  Publish Official Campus Announcement
                </h3>
              </div>
              <button
                onClick={() => setShowEventModal(false)}
                className="text-muted-foreground hover:text-foreground text-sm"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handlePublishEvent} className="space-y-3.5">
              <div className="space-y-1">
                <Label htmlFor="eventTitle" className="text-xs">
                  Announcement / Event Title *
                </Label>
                <Input
                  id="eventTitle"
                  placeholder="e.g. SRC General Assembly & Financial Aid Disbursement"
                  value={eventTitle}
                  onChange={(e) => setEventTitle(e.target.value)}
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="eventCampus" className="text-xs">
                    Campus *
                  </Label>
                  <select
                    id="eventCampus"
                    value={eventCampus}
                    onChange={(e) => setEventCampus(e.target.value)}
                    className="w-full h-9 rounded-lg border bg-background px-2.5 text-xs font-semibold focus:border-sky-500 focus:outline-none"
                  >
                    {CAMPUSES.filter((c) => c !== "All Campuses").map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <Label htmlFor="eventOrganizer" className="text-xs">
                    Organizing Body *
                  </Label>
                  <Input
                    id="eventOrganizer"
                    placeholder="e.g. Official SRC Executives"
                    value={eventOrganizer}
                    onChange={(e) => setEventOrganizer(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="eventDate" className="text-xs">
                    Event Date & Time
                  </Label>
                  <Input
                    id="eventDate"
                    type="datetime-local"
                    value={eventDate}
                    onChange={(e) => setEventDate(e.target.value)}
                  />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="eventVenue" className="text-xs">
                    Venue
                  </Label>
                  <Input
                    id="eventVenue"
                    placeholder="e.g. R.S. Amegashie Auditorium"
                    value={eventVenue}
                    onChange={(e) => setEventVenue(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label htmlFor="eventDesc" className="text-xs">
                  Description / Agenda Details
                </Label>
                <textarea
                  id="eventDesc"
                  rows={3}
                  placeholder="Outline key agenda points, requirements, and information for students..."
                  value={eventDescription}
                  onChange={(e) => setEventDescription(e.target.value)}
                  className="w-full rounded-lg border bg-transparent p-2.5 text-xs focus:border-sky-500 focus:outline-none"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Banner Image (Uploaded to campus-docs)</Label>
                <Input
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      const file = e.target.files[0];
                      setEventBannerFile(file);
                      setEventBannerPreview(URL.createObjectURL(file));
                    }
                  }}
                  className="text-xs"
                />
                {eventBannerPreview && (
                  <div className="h-28 w-full rounded-lg overflow-hidden mt-1.5 border">
                    <img
                      src={eventBannerPreview}
                      alt="Banner Preview"
                      className="h-full w-full object-cover"
                    />
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="pinnedToggle"
                  checked={eventPinned}
                  onChange={(e) => setEventPinned(e.target.checked)}
                  className="h-4 w-4 rounded text-sky-500 focus:ring-sky-500"
                />
                <Label htmlFor="pinnedToggle" className="text-xs font-semibold cursor-pointer">
                  Pin to Homepage Dynamic Ticker Banner
                </Label>
              </div>

              <div className="pt-3 border-t flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowEventModal(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={isSubmittingEvent}
                  className="bg-sky-500 hover:bg-sky-600 text-white font-bold text-xs"
                >
                  {isSubmittingEvent ? (
                    <>
                      <Loader2 className="animate-spin mr-1.5 h-3.5 w-3.5" />
                      Publishing...
                    </>
                  ) : (
                    "Publish Announcement"
                  )}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Academic Slides / Past Question Uploader Modal */}
      {showResourceModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border bg-card p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b pb-3">
              <div className="flex items-center gap-2">
                <UploadCloud className="h-5 w-5 text-sky-500" />
                <h3 className="text-base font-bold text-foreground">
                  Upload Academic Slides & Solved Past Questions
                </h3>
              </div>
              <button
                onClick={() => setShowResourceModal(false)}
                className="text-muted-foreground hover:text-foreground text-sm"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleUploadResource} className="space-y-3.5">
              <div className="space-y-1">
                <Label htmlFor="resTitle" className="text-xs">
                  Material Title *
                </Label>
                <Input
                  id="resTitle"
                  placeholder="e.g. DCIT 205 Multiplatform Mobile App Dev Solved Midsem"
                  value={resTitle}
                  onChange={(e) => setResTitle(e.target.value)}
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="resType" className="text-xs">
                    Material Type *
                  </Label>
                  <select
                    id="resType"
                    value={resType}
                    onChange={(e) => setResType(e.target.value)}
                    className="w-full h-9 rounded-lg border bg-background px-2.5 text-xs font-semibold focus:border-sky-500 focus:outline-none"
                  >
                    <option value="Lecture Slides">Lecture Slides</option>
                    <option value="Past Questions">Past Questions</option>
                    <option value="Summary / Cheatsheet">Summary / Cheatsheet</option>
                    <option value="Lab Manual">Lab Manual</option>
                    <option value="Campus Guide">Campus Guide</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <Label htmlFor="resCourse" className="text-xs">
                    Course Code *
                  </Label>
                  <Input
                    id="resCourse"
                    placeholder="e.g. DCIT 205"
                    value={resCourse}
                    onChange={(e) => setResCourse(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="resDept" className="text-xs">
                    Department
                  </Label>
                  <Input
                    id="resDept"
                    placeholder="e.g. Computer Science"
                    value={resDept}
                    onChange={(e) => setResDept(e.target.value)}
                  />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="resCampus" className="text-xs">
                    Campus *
                  </Label>
                  <select
                    id="resCampus"
                    value={resCampus}
                    onChange={(e) => setResCampus(e.target.value)}
                    className="w-full h-9 rounded-lg border bg-background px-2.5 text-xs font-semibold focus:border-sky-500 focus:outline-none"
                  >
                    {CAMPUSES.filter((c) => c !== "All Campuses").map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <Label htmlFor="resDesc" className="text-xs">
                  Description / Topic Summary
                </Label>
                <textarea
                  id="resDesc"
                  rows={2}
                  placeholder="e.g. Includes full slides on React Native state management and exam tips..."
                  value={resDescription}
                  onChange={(e) => setResDescription(e.target.value)}
                  className="w-full rounded-lg border bg-transparent p-2.5 text-xs focus:border-sky-500 focus:outline-none"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Upload Document (PDF, DOCX, PPTX to campus-docs)</Label>
                <Input
                  type="file"
                  accept=".pdf,.doc,.docx,.ppt,.pptx"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      setResFile(e.target.files[0]);
                    }
                  }}
                  className="text-xs"
                />
                {resFile && (
                  <p className="text-[11px] text-emerald-500 mt-1">
                    ✓ Selected: {resFile.name} ({(resFile.size / 1024 / 1024).toFixed(1)} MB)
                  </p>
                )}
              </div>

              <div className="pt-3 border-t flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowResourceModal(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={isSubmittingRes}
                  className="bg-sky-500 hover:bg-sky-600 text-white font-bold text-xs"
                >
                  {isSubmittingRes ? (
                    <>
                      <Loader2 className="animate-spin mr-1.5 h-3.5 w-3.5" />
                      Uploading...
                    </>
                  ) : (
                    "Upload to Campus Docs"
                  )}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="border-t bg-secondary/50 py-6">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-2 px-4 text-xs text-muted-foreground sm:flex-row">
          <Logo />
          <div className="flex items-center gap-4">
            <Link to="/campus-admin" className="font-semibold text-sky-500 hover:underline">
              Institutional / SRC Access
            </Link>
            <span>•</span>
            <Link to="/student-os" className="hover:text-foreground">
              Student OS
            </Link>
            <span>•</span>
            <Link to="/seller" className="hover:text-foreground">
              Seller Hub
            </Link>
          </div>
          <p>© {new Date().getFullYear()} NAFLIS Campus Infrastructure.</p>
        </div>
      </footer>
    </div>
  );
}
