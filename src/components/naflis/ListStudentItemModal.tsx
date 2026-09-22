import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  useNaflis,
  CAMPUSES,
  STUDENT_CATEGORIES,
  type StudentItemCondition,
} from "@/lib/naflis/store";
import { supabase } from "@/lib/supabase";
import { Upload, X, Camera, Plus, Sparkles, MapPin, Tag } from "lucide-react";
import { toast } from "sonner";

export function ListStudentItemModal() {
  const open = useNaflis((s) => s.studentModalOpen);
  const setOpen = useNaflis((s) => s.setStudentModalOpen);
  const selectedCampus = useNaflis((s) => s.selectedCampus);
  const addStudentListing = useNaflis((s) => s.addStudentListing);
  const user = useCurrentUserSafe();

  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<string>(STUDENT_CATEGORIES[1]);
  const [price, setPrice] = useState("");
  const [originalPrice, setOriginalPrice] = useState("");
  const [campus, setCampus] = useState(
    selectedCampus !== "All Campuses" ? selectedCampus : "UG - Legon"
  );
  const [condition, setCondition] = useState<StudentItemCondition>("Like New");
  const [hostelLocation, setHostelLocation] = useState("");
  const [description, setDescription] = useState("");
  const [phone, setPhone] = useState(user?.phone || "");
  const [images, setImages] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const availableCampuses = CAMPUSES.filter((c) => c !== "All Campuses");
  const availableCategories = STUDENT_CATEGORIES.filter((c) => c !== "All");

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    const newUploadedUrls: string[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const fileExt = file.name.split(".").pop();
      const fileName = `student_${Math.random().toString(36).substring(2)}_${Date.now()}.${fileExt}`;
      const filePath = `student-items/${fileName}`;

      let uploadedUrl = "";
      if (supabase) {
        try {
          const { error: uploadError } = await supabase.storage
            .from("product-images")
            .upload(filePath, file, { cacheControl: "3600", upsert: false });

          if (!uploadError) {
            const {
              data: { publicUrl },
            } = supabase.storage.from("product-images").getPublicUrl(filePath);
            uploadedUrl = publicUrl;
          }
        } catch (err) {
          console.warn("Supabase storage upload fallback to local preview:", err);
        }
      }

      // Fallback to data URL if offline or Supabase bucket unavailable
      if (!uploadedUrl) {
        uploadedUrl = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.readAsDataURL(file);
        });
      }

      if (uploadedUrl) {
        newUploadedUrls.push(uploadedUrl);
      }
    }

    setImages((prev) => [...prev, ...newUploadedUrls]);
    setUploading(false);
    toast.success(`${newUploadedUrls.length} image(s) attached.`);
  };

  const removeImage = (idxToRemove: number) => {
    setImages((prev) => prev.filter((_, idx) => idx !== idxToRemove));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      toast.error("Please enter a title for your item.");
      return;
    }
    const numPrice = parseFloat(price);
    if (isNaN(numPrice) || numPrice < 0) {
      toast.error("Please enter a valid price (GHS).");
      return;
    }

    setSubmitting(true);

    const defaultCover =
      images[0] ||
      "https://images.unsplash.com/photo-1544947950-fa07a98d237f?w=800&q=80";

    const newListing = addStudentListing({
      title: title.trim(),
      category,
      price: numPrice,
      originalPrice: originalPrice ? parseFloat(originalPrice) : Math.round(numPrice * 1.25),
      campus,
      condition,
      sellerName: user?.name || "Verified Student",
      sellerId: user?.id || "u_student",
      sellerPhone: phone || "+233 24 000 0000",
      sellerAvatar: user?.avatar || "https://api.dicebear.com/9.x/notionists/svg?seed=Student",
      image: defaultCover,
      images: images.length > 0 ? images : [defaultCover],
      description: description.trim() || "Campus item in great condition. Pick up in hostel or campus center.",
      hostelLocation: hostelLocation.trim() || "Campus Center / Meetup Spot",
      isVerifiedStudent: true,
    });

    // Optional sync to Supabase products table if connected
    if (supabase && user?.id) {
      try {
        await supabase.from("products").insert({
          title: newListing.title,
          description: newListing.description,
          price: newListing.price,
          category: "student_os",
          images: newListing.images,
          stock: 1,
        });
      } catch (err) {
        console.warn("Supabase products table optional insert skipped:", err);
      }
    }

    setSubmitting(false);
    setOpen(false);

    // Reset form
    setTitle("");
    setPrice("");
    setOriginalPrice("");
    setDescription("");
    setHostelLocation("");
    setImages([]);

    toast.success("Listing posted successfully to Campus Marketplace!");
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto border bg-card p-6 shadow-premium rounded-2xl">
        <DialogHeader className="space-y-1">
          <DialogTitle className="text-xl font-bold flex items-center gap-2">
            <Tag className="h-5 w-5 text-sky-500" /> List a Campus Item
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Sell used textbooks, hostel appliances, tech gear, or dorm essentials to students on your campus.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          {/* Images Picker */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold flex items-center justify-between">
              <span>Item Photos</span>
              <span className="text-[10px] text-muted-foreground">Direct Supabase storage upload</span>
            </Label>
            <div className="flex flex-wrap gap-2">
              {images.map((img, idx) => (
                <div key={idx} className="relative h-18 w-18 rounded-lg overflow-hidden border bg-muted">
                  <img src={img} alt="Uploaded item" className="h-full w-full object-cover" />
                  <button
                    type="button"
                    onClick={() => removeImage(idx)}
                    className="absolute top-1 right-1 rounded-full bg-black/60 p-0.5 text-white hover:bg-black/80"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
              <label className="flex h-18 w-18 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-sky-500/40 bg-sky-500/5 hover:bg-sky-500/10 transition">
                <Camera className="h-5 w-5 text-sky-500" />
                <span className="text-[10px] font-medium text-sky-500 mt-1">
                  {uploading ? "Uploading..." : "+ Add"}
                </span>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleFileUpload}
                  className="hidden"
                  disabled={uploading}
                />
              </label>
            </div>
          </div>

          {/* Title */}
          <div className="space-y-1.5">
            <Label htmlFor="item-title" className="text-xs font-semibold">
              Item Title
            </Label>
            <Input
              id="item-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Halliday & Resnick Physics 10th Ed or 90L Bedside Fridge"
              required
            />
          </div>

          {/* Category & Campus */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="item-cat" className="text-xs font-semibold">
                Category
              </Label>
              <select
                id="item-cat"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
              >
                {availableCategories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="item-campus" className="text-xs font-semibold">
                Campus Location
              </Label>
              <select
                id="item-campus"
                value={campus}
                onChange={(e) => setCampus(e.target.value)}
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
              >
                {availableCampuses.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Pricing & Condition */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="item-price" className="text-xs font-semibold">
                Price (GHS)
              </Label>
              <Input
                id="item-price"
                type="number"
                min="0"
                step="any"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="150"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="item-orig-price" className="text-xs font-semibold">
                Original Price (optional)
              </Label>
              <Input
                id="item-orig-price"
                type="number"
                min="0"
                step="any"
                value={originalPrice}
                onChange={(e) => setOriginalPrice(e.target.value)}
                placeholder="250"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="item-condition" className="text-xs font-semibold">
                Condition
              </Label>
              <select
                id="item-condition"
                value={condition}
                onChange={(e) => setCondition(e.target.value as StudentItemCondition)}
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
              >
                <option value="Brand New">Brand New</option>
                <option value="Like New">Like New</option>
                <option value="Used - Good">Used - Good</option>
                <option value="Used - Fair">Used - Fair</option>
              </select>
            </div>
          </div>

          {/* Hostel / Pickup Location & Contact */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="item-loc" className="text-xs font-semibold flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5 text-sky-500" /> Hostel / Meetup Spot
              </Label>
              <Input
                id="item-loc"
                value={hostelLocation}
                onChange={(e) => setHostelLocation(e.target.value)}
                placeholder="e.g. Commonwealth Hall, Pent Block C"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="item-phone" className="text-xs font-semibold">
                WhatsApp / Phone Contact
              </Label>
              <Input
                id="item-phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+233 24 000 0000"
              />
            </div>
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label htmlFor="item-desc" className="text-xs font-semibold">
              Description & Notes
            </Label>
            <Textarea
              id="item-desc"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="State warranty, accessories included, reason for selling..."
            />
          </div>

          <div className="pt-2 flex justify-end gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              className="bg-sky-500 hover:bg-sky-600 text-white"
              disabled={submitting || uploading}
            >
              {submitting ? (
                <>
                  <Sparkles className="h-4 w-4 mr-1.5 animate-spin" /> Publishing...
                </>
              ) : (
                "Post Listing"
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function useCurrentUserSafe() {
  const currentUserId = useNaflis((s) => s.currentUserId);
  const users = useNaflis((s) => s.users);
  return users.find((u) => u.id === currentUserId);
}
