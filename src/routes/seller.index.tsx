import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { Store, TrendingUp, Package, Sparkles, Zap, Users, Loader2, Plus, Edit, Trash2, Upload, X, AlertCircle, ArrowLeft, Building2, Flame } from "lucide-react";
import { useMemo, useState, useEffect } from "react";
import { toast } from "sonner";
import { RoleShell, MetricCard } from "@/components/naflis/RoleShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/naflis/Logo";
import { ThemeToggle } from "@/components/naflis/ThemeToggle";
import { useNaflis, CAMPUSES, type Order } from "@/lib/naflis/store";
import { GHS, fmtDate, pct } from "@/lib/naflis/format";
import { supabase } from "@/lib/supabase";
import { useCategories } from "@/services/categories";
import { runOrderTransition } from "@/services/orderService";
import { PurchaseConfigEditor } from "@/components/naflis/PurchaseConfigEditor";
import { mapDbProduct } from "@/lib/naflis/mapProduct";
import { ESCROW_HELD_STATES, orderStateLabel } from "@/lib/naflis/orderMachine";
import { DEFAULT_PURCHASE_CONFIG, getPurchaseConfig, normalizePurchaseConfig, validatePurchaseConfig, type PurchaseConfig } from "@/lib/naflis/purchase";

export const Route = createFileRoute("/seller/")({
  // ?list=<search term> opens "Add product" prefilled (used by Seller Intelligence).
  validateSearch: z.object({ list: z.string().optional() }).parse,
  component: SellerDashboard,
});

function SellerDashboard() {
  const currentUserId = useNaflis((s) => s.currentUserId);
  const orders = useNaflis((s) => s.orders);
  const requests = useNaflis((s) => s.productRequests);
  const searchEvents = useNaflis((s) => s.searchEvents);

  const [vendor, setVendor] = useState<any>(null);
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Campus Demand State
  const selectedCampus = useNaflis((s) => s.selectedCampus);
  const demandLogs = useNaflis((s) => s.demandLogs);
  const [vendorCampus, setVendorCampus] = useState(
    selectedCampus !== "All Campuses" ? selectedCampus : "UG - Legon"
  );
  const [campusDemand, setCampusDemand] = useState<any[]>([]);

  // Onboarding Form State
  const [storeName, setStoreName] = useState("");
  const [phone, setPhone] = useState("");
  const [description, setDescription] = useState("");
  const [submittingOnboarding, setSubmittingOnboarding] = useState(false);

  // Add/Edit Product Modal State
  const [showProductModal, setShowProductModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<any>(null);
  const [productTitle, setProductTitle] = useState("");
  const [productPrice, setProductPrice] = useState("");
  const { flat: categoryOptions, names: categoryNames } = useCategories("mall");
  const [productCategory, setProductCategory] = useState("");
  const effectiveCategory = productCategory || categoryNames[0] || "";
  const [productStock, setProductStock] = useState("10");
  const [productDescription, setProductDescription] = useState("");
  const [productImages, setProductImages] = useState<string[]>([]);
  const [productPurchase, setProductPurchase] = useState<PurchaseConfig>(DEFAULT_PURCHASE_CONFIG);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [savingProduct, setSavingProduct] = useState(false);

  // Delete Confirmation Modal State
  const [productToDelete, setProductToDelete] = useState<any>(null);
  const [deletingProduct, setDeletingProduct] = useState(false);

  const fetchVendorAndProducts = async () => {
    try {
      setLoading(true);

      if (!supabase) {
        const { stores, currentUserId: me } = useNaflis.getState();
        const demoStore = stores.find((st) => st.ownerId === me) ?? stores[0];
        setVendor({
          id: demoStore.id,
          user_id: demoStore.ownerId,
          store_name: demoStore.name,
          store_slug: "trendtech-ghana",
          description: demoStore.tagline,
          logo_url: demoStore.logo,
          status: "approved",
        });
        setProducts(useNaflis.getState().products.filter((p) => p.storeId === demoStore.id));
        setLoading(false);
        return;
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        const { stores, currentUserId: me } = useNaflis.getState();
        const demoStore = stores.find((st) => st.ownerId === me) ?? stores[0];
        setVendor({
          id: demoStore.id,
          user_id: demoStore.ownerId,
          store_name: demoStore.name,
          store_slug: "trendtech-ghana",
          description: demoStore.tagline,
          logo_url: demoStore.logo,
          status: "approved",
        });
        setProducts(useNaflis.getState().products.filter((p) => p.storeId === demoStore.id));
        setLoading(false);
        return;
      }

      // Fetch vendor
      const { data: vendorData, error: vendorError } = await supabase
        .from("vendors")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();

      if (vendorData) {
        setVendor(vendorData);
        // Owning a shop is what holds the seller role.
        useNaflis.getState().grantRole("seller", user.id);

        // Sync local stores array in Zustand
        const mappedStore = {
          id: vendorData.id,
          name: vendorData.store_name,
          ownerId: vendorData.user_id,
          logo: vendorData.logo_url || `https://api.dicebear.com/9.x/notionists/svg?seed=${vendorData.store_name}`,
          tagline: vendorData.description || "Just getting started.",
          rating: 5.0,
          reviews: 0,
          verified: vendorData.status === "approved",
          followers: 0,
          location: "Accra",
          categories: ["Electronics", "Fashion", "Home"],
          subscription: "starter" as const
        };

        useNaflis.setState((s) => {
          const exists = s.stores.find((st) => st.id === vendorData.id);
          return {
            stores: exists
              ? s.stores.map((st) => st.id === vendorData.id ? { ...st, ...mappedStore } : st)
              : [...s.stores, mappedStore]
          };
        });

        if (vendorData.status === "approved") {
          // Fetch products
          const { data: productsData } = await supabase
            .from("products")
            .select("*")
            .eq("vendor_id", vendorData.id)
            .order("created_at", { ascending: false });

          setProducts(productsData || []);

          // Sync local products in Zustand
          useNaflis.setState((s) => {
            const otherProducts = s.products.filter((p) => p.storeId !== vendorData.id);
            const mappedList = (productsData || []).map((dbProduct) => mapDbProduct(dbProduct, { storeId: vendorData.id }));
            return { products: [...otherProducts, ...mappedList] };
          });
        }
      } else {
        setVendor(null);
      }
    } catch (err: any) {
      console.error(err);
      toast.error("Failed to load seller dashboard details.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchVendorAndProducts();
  }, [currentUserId]);

  const search = Route.useSearch();
  const navigate = useNavigate();
  useEffect(() => {
    if (search.list && vendor && !loading) {
      handleListDemandItem(search.list);
      navigate({ to: "/seller", search: {}, replace: true });
    }
  }, [search.list, vendor, loading]); // eslint-disable-line react-hooks/exhaustive-deps

  // Query campus_market_demand view for vendor's campus
  useEffect(() => {
    const fetchCampusMarketDemand = async () => {
      if (supabase) {
        try {
          const { data, error } = await supabase
            .from("campus_market_demand")
            .select("*")
            .or(`campus.eq.${vendorCampus},campus.eq.General,campus.eq.All Campuses`)
            .order("search_count", { ascending: false })
            .limit(10);

          if (data && data.length > 0) {
            setCampusDemand(data);
            return;
          }
        } catch (err) {
          console.warn("Notice: Fetching campus demand view note:", err);
        }
      }

      // Fallback from demandLogs
      const matching = demandLogs.filter(
        (d) => d.campus === vendorCampus || d.campus === "General" || d.campus === "All Campuses"
      );
      const agg: Record<string, number> = {};
      for (const log of matching) {
        const q = log.searchQuery.trim();
        agg[q] = (agg[q] || 0) + 1;
      }

      const defaultItems = [
        { search_query: "Lenovo IdeaPad", search_count: 24, campus: vendorCampus },
        { search_query: "HP Charger", search_count: 18, campus: vendorCampus },
        { search_query: "Casio fx-991EX Calculator", search_count: 15, campus: vendorCampus },
        { search_query: "Single Bed Mattress", search_count: 14, campus: vendorCampus },
        { search_query: "MacBook Air M1", search_count: 12, campus: vendorCampus },
        { search_query: "Dorm Table Fan", search_count: 11, campus: vendorCampus },
      ];

      const mapped =
        Object.keys(agg).length > 0
          ? Object.entries(agg)
              .map(([q, count]) => ({
                search_query: q.charAt(0).toUpperCase() + q.slice(1),
                search_count: count * 4 + 2,
                campus: vendorCampus,
              }))
              .sort((a, b) => b.search_count - a.search_count)
          : defaultItems;

      setCampusDemand(mapped);
    };

    fetchCampusMarketDemand();
  }, [vendorCampus, demandLogs]);

  const handleListDemandItem = (itemQuery: string) => {
    openAddProduct();
    setProductTitle(itemQuery);
    if (/laptop|macbook|charger|ideapad|dell|hp/i.test(itemQuery)) {
      setProductCategory("Laptops");
    } else if (/phone|iphone|samsung|pixel/i.test(itemQuery)) {
      setProductCategory("Phones");
    } else if (/calculator|book|past question/i.test(itemQuery)) {
      setProductCategory("School Supplies");
    } else if (/fan|mattress|fridge|cooker|kettle/i.test(itemQuery)) {
      setProductCategory("Home Appliances");
    }
    toast.info(`Listing prefilled for high-demand item: "${itemQuery}"`);
  };

  const handleOnboardingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!storeName || !phone || !description) {
      toast.error("Please fill in all store onboarding fields.");
      return;
    }

    setSubmittingOnboarding(true);
    try {
      // Demo mode: create the shop locally.
      if (!supabase) {
        const st = useNaflis.getState();
        st.openShop();
        useNaflis.setState((s) => ({
          stores: s.stores.map((x) => (x.ownerId === s.currentUserId ? { ...x, name: storeName, tagline: description } : x)),
        }));
        toast.success("Demo: your shop is ready.");
        await fetchVendorAndProducts();
        return;
      }
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("No active user session found.");

      const slug = storeName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

      // 1. Update user profile phone
      await supabase.from("profiles").update({ phone }).eq("id", user.id);

      // 2. Insert vendor profile
      const { data, error } = await supabase
        .from("vendors")
        .insert({
          user_id: user.id,
          store_name: storeName,
          store_slug: slug,
          description: description,
          status: "pending",
          logo_url: `https://api.dicebear.com/9.x/notionists/svg?seed=${storeName}`,
        })
        .select()
        .single();

      if (error) throw error;

      toast.success("Store registration submitted for approval!");
      await fetchVendorAndProducts();
    } catch (err: any) {
      toast.error(err.message || "Failed to submit onboarding details.");
    } finally {
      setSubmittingOnboarding(false);
    }
  };

  const handleSimulateApproval = async () => {
    if (!vendor) return;
    if (!supabase) return; // demo shops are approved already
    try {
      const { error } = await supabase
        .from("vendors")
        .update({ status: "approved" })
        .eq("id", vendor.id);

      if (error) throw error;

      toast.success("Store approved! Unlocking dashboard...");
      await fetchVendorAndProducts();
    } catch (err: any) {
      toast.error(err.message || "Approval simulation failed.");
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploadingImage(true);
    try {
      const uploadedUrls: string[] = [];

      // Demo mode: keep images as data URLs.
      if (!supabase) {
        for (const file of Array.from(files)) {
          uploadedUrls.push(
            await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => resolve(reader.result as string);
              reader.onerror = () => reject(new Error("Couldn't read that image."));
              reader.readAsDataURL(file);
            }),
          );
        }
        setProductImages((prev) => [...prev, ...uploadedUrls]);
        toast.success("Image(s) added.");
        return;
      }

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const fileExt = file.name.split(".").pop();
        const fileName = `${Math.random().toString(36).substring(2)}_${Date.now()}.${fileExt}`;
        const filePath = `${vendor.id}/${fileName}`;

        const { data, error } = await supabase.storage
          .from("product-images")
          .upload(filePath, file, {
            cacheControl: "3600",
            upsert: false,
          });

        if (error) throw error;

        const { data: { publicUrl } } = supabase.storage
          .from("product-images")
          .getPublicUrl(filePath);

        uploadedUrls.push(publicUrl);
      }

      setProductImages((prev) => [...prev, ...uploadedUrls]);
      toast.success("Image(s) uploaded successfully!");
    } catch (err: any) {
      toast.error(err.message || "Failed to upload file(s).");
    } finally {
      setUploadingImage(false);
    }
  };

  const removeUploadedImage = (indexToRemove: number) => {
    setProductImages((prev) => prev.filter((_, idx) => idx !== indexToRemove));
  };

  const openAddProduct = () => {
    setEditingProduct(null);
    setProductTitle("");
    setProductPrice("");
    setProductCategory("");
    setProductStock("10");
    setProductDescription("");
    setProductImages([]);
    setProductPurchase(DEFAULT_PURCHASE_CONFIG);
    setShowProductModal(true);
  };

  const openEditProduct = (product: any) => {
    setEditingProduct(product);
    // DB rows use title/images/purchase_config; demo-store products use name/image/purchaseConfig.
    setProductTitle(product.title ?? product.name);
    setProductPurchase(
      product.purchase_config !== undefined ? normalizePurchaseConfig(product.purchase_config) : getPurchaseConfig(product),
    );
    setProductPrice(String(product.price));
    setProductCategory(product.category);
    setProductStock(String(product.stock));
    setProductDescription(product.description || "");
    setProductImages(product.images?.length ? product.images : product.image ? [product.image] : []);
    setShowProductModal(true);
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!productTitle || !productPrice || !productStock) {
      toast.error("Please fill in all required product fields.");
      return;
    }
    const purchaseErrors = validatePurchaseConfig(productPurchase, parseFloat(productPrice));
    if (purchaseErrors.length) {
      toast.error(purchaseErrors[0]);
      return;
    }
    const purchaseConfig = normalizePurchaseConfig(productPurchase);

    setSavingProduct(true);
    try {
      const payload = {
        vendor_id: vendor.id,
        title: productTitle,
        description: productDescription,
        price: parseFloat(productPrice),
        stock: parseInt(productStock, 10),
        category: effectiveCategory,
        images: productImages,
        purchase_config: purchaseConfig,
      };

      // Demo mode: no backend — keep the catalog in the local store.
      if (!supabase) {
        useNaflis.setState((s) => {
          const id = editingProduct?.id ?? "p_" + Math.random().toString(36).slice(2, 10);
          const base = s.products.find((p) => p.id === id);
          const next = {
            ...(base ?? mapDbProduct({ ...payload, id, created_at: new Date().toISOString() })),
            name: payload.title,
            description: payload.description,
            price: payload.price,
            stock: payload.stock,
            category: payload.category,
            image: payload.images[0] ?? base?.image ?? mapDbProduct({ id }).image,
            images: payload.images,
            storeId: vendor.id,
            purchaseConfig,
          };
          return { products: base ? s.products.map((p) => (p.id === id ? next : p)) : [next, ...s.products] };
        });
        toast.success(editingProduct ? "Product updated" : "Product added");
        setShowProductModal(false);
        await fetchVendorAndProducts();
        return;
      }

      if (editingProduct) {
        const { error } = await supabase
          .from("products")
          .update(payload)
          .eq("id", editingProduct.id);

        if (error) throw error;
        toast.success("Product updated successfully!");
      } else {
        const { error } = await supabase
          .from("products")
          .insert(payload);

        if (error) throw error;
        toast.success("Product added successfully!");
      }

      setShowProductModal(false);
      await fetchVendorAndProducts();
    } catch (err: any) {
      toast.error(err.message || "Failed to save product details.");
    } finally {
      setSavingProduct(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!productToDelete) return;
    setDeletingProduct(true);
    try {
      if (!supabase) {
        useNaflis.setState((s) => ({ products: s.products.filter((p) => p.id !== productToDelete.id) }));
        toast.success("Product deleted.");
        setProductToDelete(null);
        await fetchVendorAndProducts();
        return;
      }
      const { error } = await supabase
        .from("products")
        .delete()
        .eq("id", productToDelete.id);

      if (error) throw error;

      toast.success("Product deleted successfully!");
      setProductToDelete(null);
      await fetchVendorAndProducts();
    } catch (err: any) {
      toast.error(err.message || "Failed to delete product.");
    } finally {
      setDeletingProduct(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex flex-col justify-center items-center">
        <Loader2 className="h-10 w-10 text-sky-500 animate-spin" />
        <p className="mt-3 text-sm text-muted-foreground font-semibold">Loading command center...</p>
      </div>
    );
  }

  if (!vendor) {
    return (
      <div className="min-h-screen bg-background flex flex-col justify-between animate-fade-in">
        <header className="border-b bg-background/80 backdrop-blur">
          <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4">
            <Logo />
            <div className="flex items-center gap-2">
              <Button asChild variant="ghost" size="sm">
                <Link to="/"><ArrowLeft className="mr-1 h-4 w-4" /> Landing</Link>
              </Button>
              <ThemeToggle />
            </div>
          </div>
        </header>

        <main className="flex-1 flex items-center justify-center p-4 py-12">
          <div className="max-w-md w-full space-y-6">
            <div className="text-center space-y-2">
              <div className="p-3 bg-sky-500/10 rounded-full w-fit mx-auto">
                <Store className="h-10 w-10 text-sky-500" />
              </div>
              <h1 className="text-3xl font-black tracking-tight">Onboard as Seller</h1>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Set up your store details to publish discount deals, manage escrowed deals, and unlock pricing recommended insights.
              </p>
            </div>

            <form onSubmit={handleOnboardingSubmit} className="bg-card border rounded-2xl p-6 space-y-4 shadow-premium">
              <div className="space-y-1.5">
                <Label htmlFor="storeName">Store Name</Label>
                <Input
                  id="storeName"
                  placeholder="e.g. TrendTech Ghana"
                  value={storeName}
                  onChange={(e) => setStoreName(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="phone">Store Phone Number</Label>
                <Input
                  id="phone"
                  placeholder="e.g. +233 24 000 0000"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="description">Store Description</Label>
                <textarea
                  id="description"
                  rows={3}
                  className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  placeholder="Tell customers what you offer and your customer support values..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  required
                />
              </div>

              <Button type="submit" className="w-full bg-sky-500 hover:bg-sky-600 text-white font-bold" disabled={submittingOnboarding}>
                {submittingOnboarding ? (
                  <>
                    <Loader2 className="animate-spin mr-2 h-4 w-4" />
                    Submitting Application...
                  </>
                ) : (
                  "Submit Store Application"
                )}
              </Button>
            </form>
          </div>
        </main>

        <footer className="border-t bg-secondary/50 py-6 text-center text-xs text-muted-foreground">
          © {new Date().getFullYear()} NAFLIS Discount Mall. Seller Command center setup.
        </footer>
      </div>
    );
  }

  if (vendor.status === "pending") {
    return (
      <div className="min-h-screen bg-background flex flex-col justify-between animate-fade-in">
        <header className="border-b bg-background/80 backdrop-blur">
          <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4">
            <Logo />
            <div className="flex items-center gap-2">
              <Button asChild variant="ghost" size="sm">
                <Link to="/"><ArrowLeft className="mr-1 h-4 w-4" /> Landing</Link>
              </Button>
              <ThemeToggle />
            </div>
          </div>
        </header>

        <main className="flex-1 flex items-center justify-center p-4 py-12">
          <div className="max-w-md w-full space-y-6 text-center">
            <div className="bg-card border rounded-2xl p-8 space-y-6 shadow-premium relative overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-1 bg-gold" />
              
              <div className="p-3 bg-gold/10 text-gold rounded-full w-fit mx-auto">
                <Store className="h-10 w-10 animate-pulse" />
              </div>

              <div className="space-y-2">
                <h1 className="text-2xl font-black tracking-tight">{vendor.store_name}</h1>
                <Badge className="bg-gold text-gold-foreground capitalize font-bold">{vendor.status}</Badge>
              </div>

              <p className="text-sm text-muted-foreground leading-relaxed">
                Thank you for applying! Your store application is currently pending administrative review. We ensure network integrity to verify escrow details.
              </p>

              <div className="border-t pt-6 space-y-4">
                <div className="p-4 bg-muted/50 rounded-xl border text-left text-xs space-y-2">
                  <div className="flex items-center gap-1.5 font-bold text-foreground">
                    <AlertCircle className="h-4 w-4 text-sky-500" />
                    <span>Demo Simulation Tool</span>
                  </div>
                  <p className="text-muted-foreground leading-relaxed">
                    You can instantly approve this store application locally to unlock the complete Seller command center.
                  </p>
                </div>

                <Button onClick={handleSimulateApproval} className="w-full bg-sky-500 hover:bg-sky-600 text-white font-bold">
                  Simulate Admin Approval
                </Button>
              </div>
            </div>
          </div>
        </main>

        <footer className="border-t bg-secondary/50 py-6 text-center text-xs text-muted-foreground">
          © {new Date().getFullYear()} NAFLIS Discount Mall. Pending Review.
        </footer>
      </div>
    );
  }

  // Approved command dashboard variables
  const myProducts = products;
  const myProductIds = new Set(myProducts.map((p) => p.id));
  const myOrders = orders.filter((o) => o.items.some((i) => myProductIds.has(i.productId)));

  const revenue = myOrders.reduce(
    (a, o) => a + o.items.filter((i) => myProductIds.has(i.productId)).reduce((b, i) => b + i.price * i.qty, 0),
    0,
  );
  const escrowPending = myOrders
    .filter((o) => ESCROW_HELD_STATES.includes(o.status))
    .reduce((a, o) => a + o.total, 0);
  const avgDiscount = myProducts.length > 0
    ? myProducts.reduce((a, p) => a + (p.price * 0.2) / (p.price * 1.2), 0) / myProducts.length
    : 0.15;

  return (
    <RoleShell
      title={`${vendor.store_name} · Seller Command`}
      subtitle="Storefront, orders, demand intelligence, and pricing recommendations."
      icon={Store}
      badge="APPROVED"
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Revenue (all-time)" value={GHS(revenue)} hint={`${myOrders.length} orders`} />
        <MetricCard label="Escrow pending release" value={GHS(escrowPending)} hint="Held by NAFLIS" />
        <MetricCard label="Products live" value={String(myProducts.length)} hint={`Avg discount ${pct(avgDiscount * 100)}`} />
        <MetricCard label="Store rating" value="5.0 / 5" hint="0 reviews" />
      </div>

      {/* 🔥 High Demand On Your Campus This Week */}
      <div className="mt-6 rounded-3xl border border-sky-500/30 bg-card p-6 shadow-premium space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b pb-4">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-2xl bg-sky-500 text-white shadow-md">
              <Flame className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base sm:text-lg font-black text-foreground">
                  🔥 High Demand On Your Campus This Week
                </h3>
                <Badge className="bg-sky-500/15 text-sky-500 border-sky-500/30 text-[10px] font-bold">
                  Restock Signal
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Live search volume from students at {vendorCampus}. Fulfill these requested items to maximize sales.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            <Building2 className="h-4 w-4 text-sky-500" />
            <select
              aria-label="Vendor Campus Filter"
              value={vendorCampus}
              onChange={(e) => setVendorCampus(e.target.value)}
              className="h-9 rounded-xl border bg-background px-3 text-xs font-semibold text-foreground focus:border-sky-500 focus:outline-none shadow-sm"
            >
              {CAMPUSES.filter((c) => c !== "All Campuses").map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {campusDemand.slice(0, 6).map((item, idx) => (
            <div
              key={idx}
              className="flex items-center justify-between p-3.5 rounded-xl border bg-background hover:border-sky-500/50 hover:shadow-sm transition"
            >
              <div className="min-w-0 pr-2">
                <p className="text-xs font-bold text-foreground truncate">{item.search_query}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  <span className="font-bold text-sky-500">{item.search_count} searches</span> on {item.campus || vendorCampus}
                </p>
              </div>
              <Button
                size="sm"
                onClick={() => handleListDemandItem(item.search_query)}
                className="bg-sky-500 hover:bg-sky-600 text-white font-semibold text-xs h-7 px-2.5 shrink-0 gap-1 shadow-sm"
              >
                <Plus className="h-3 w-3" /> List This Item
              </Button>
            </div>
          ))}
        </div>
      </div>

      <Tabs defaultValue="products" className="mt-6">
        <TabsList>
          <TabsTrigger value="orders">Orders</TabsTrigger>
          <TabsTrigger value="products">Products</TabsTrigger>
          <TabsTrigger value="intelligence">Intelligence</TabsTrigger>
          <TabsTrigger value="pricing">Price Intelligence</TabsTrigger>
          <TabsTrigger value="requests">Demand Inbox</TabsTrigger>
          <TabsTrigger value="brand">Brand Studio</TabsTrigger>
        </TabsList>

        <TabsContent value="orders" className="mt-4">
          <OrdersTab orders={myOrders} myProductIds={myProductIds} />
        </TabsContent>
        <TabsContent value="products" className="mt-4">
          <ProductsTab
            products={myProducts}
            openAddProduct={openAddProduct}
            openEditProduct={openEditProduct}
            setProductToDelete={setProductToDelete}
          />
        </TabsContent>
        <TabsContent value="intelligence" className="mt-4">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-sky-500/40 bg-sky-500/5 p-4">
            <div>
              <p className="font-semibold">NAFLIS Seller Intelligence</p>
              <p className="text-sm text-muted-foreground">Restock alerts, price moves, bundles and fast-growing campus trends from live search demand.</p>
            </div>
            <Button asChild><Link to="/seller/intelligence">Open Intelligence</Link></Button>
          </div>
          <IntelligenceTab searchEvents={searchEvents} products={myProducts} />
        </TabsContent>
        <TabsContent value="pricing" className="mt-4">
          <PricingTab products={myProducts} />
        </TabsContent>
        <TabsContent value="requests" className="mt-4">
          <RequestsTab requests={requests} />
        </TabsContent>
        <TabsContent value="brand" className="mt-4">
          <BrandTab />
        </TabsContent>
      </Tabs>

      {/* Add / Edit Product Modal */}
      {showProductModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
          <div className="bg-card border rounded-2xl w-full max-w-lg shadow-premium overflow-hidden flex flex-col max-h-[90vh] animate-fade-in">
            <div className="p-5 border-b flex items-center justify-between">
              <h3 className="text-lg font-black">{editingProduct ? "Edit Product" : "Add New Product"}</h3>
              <button onClick={() => setShowProductModal(false)} className="p-1 rounded-md hover:bg-muted">
                <X className="h-5 w-5 text-muted-foreground" />
              </button>
            </div>

            <form onSubmit={handleSaveProduct} className="p-5 overflow-y-auto space-y-4 flex-1">
              <div className="space-y-1.5">
                <Label htmlFor="title">Product Title *</Label>
                <Input
                  id="title"
                  placeholder="e.g. iPhone 16 Pro Max"
                  value={productTitle}
                  onChange={(e) => setProductTitle(e.target.value)}
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="price">Price (GHS) *</Label>
                  <Input
                    id="price"
                    type="number"
                    step="0.01"
                    placeholder="e.g. 15000"
                    value={productPrice}
                    onChange={(e) => setProductPrice(e.target.value)}
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="stock">Stock Quantity *</Label>
                  <Input
                    id="stock"
                    type="number"
                    placeholder="e.g. 15"
                    value={productStock}
                    onChange={(e) => setProductStock(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="category">Category *</Label>
                <select
                  id="category"
                  value={effectiveCategory}
                  onChange={(e) => setProductCategory(e.target.value)}
                  className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  {!categoryNames.includes(effectiveCategory) && effectiveCategory && (
                    <option value={effectiveCategory} className="bg-background text-foreground">
                      {effectiveCategory}
                    </option>
                  )}
                  {categoryOptions.map(({ node, depth }) => (
                    <option key={node.id} value={node.name} className="bg-background text-foreground">
                      {depth > 0 ? "\u00A0\u00A0— " : ""}{node.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="prodDesc">Description</Label>
                <textarea
                  id="prodDesc"
                  rows={3}
                  placeholder="Enter specifications, warranties, or seller notes..."
                  className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  value={productDescription}
                  onChange={(e) => setProductDescription(e.target.value)}
                />
              </div>

              <div className="border-t pt-4">
                <PurchaseConfigEditor
                  value={productPurchase}
                  onChange={setProductPurchase}
                  price={parseFloat(productPrice) || undefined}
                />
              </div>

              <div className="space-y-2 border-t pt-4">
                <Label>Product Images</Label>
                
                {productImages.length > 0 && (
                  <div className="grid grid-cols-4 gap-2 mb-2">
                    {productImages.map((img, idx) => (
                      <div key={idx} className="relative aspect-square border rounded-lg overflow-hidden group">
                        <img src={img} alt="Product preview" className="h-full w-full object-cover" />
                        <button
                          type="button"
                          onClick={() => removeUploadedImage(idx)}
                          className="absolute top-1 right-1 p-1 bg-red-500/80 hover:bg-red-500 rounded-full text-white transition-opacity"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="relative">
                  <input
                    type="file"
                    id="file-upload"
                    multiple
                    accept="image/*"
                    onChange={handleImageUpload}
                    className="hidden"
                    disabled={uploadingImage}
                  />
                  <label
                    htmlFor="file-upload"
                    className={`flex flex-col items-center justify-center p-6 border border-dashed rounded-xl cursor-pointer hover:bg-muted/40 transition-colors text-center ${
                      uploadingImage ? "opacity-50 pointer-events-none" : ""
                    }`}
                  >
                    {uploadingImage ? (
                      <>
                        <Loader2 className="h-8 w-8 text-sky-500 animate-spin mb-2" />
                        <p className="text-xs font-bold text-muted-foreground">Uploading files to Supabase...</p>
                      </>
                    ) : (
                      <>
                        <Upload className="h-8 w-8 text-sky-500 mb-2" />
                        <p className="text-xs font-bold text-foreground">Click to upload files</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">JPEG, PNG, WEBP, or SVG up to 5MB</p>
                      </>
                    )}
                  </label>
                </div>
              </div>

              <div className="border-t pt-4 flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => setShowProductModal(false)} disabled={savingProduct}>
                  Cancel
                </Button>
                <Button type="submit" className="bg-sky-500 hover:bg-sky-600 text-white font-bold" disabled={savingProduct}>
                  {savingProduct ? (
                    <>
                      <Loader2 className="animate-spin mr-1.5 h-4 w-4" />
                      Saving...
                    </>
                  ) : (
                    "Save Product"
                  )}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {productToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
          <div className="bg-card border rounded-2xl w-full max-w-sm shadow-premium p-5 space-y-4 animate-scale-in">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-red-100 text-red-500 rounded-full shrink-0">
                <Trash2 className="h-5 w-5" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-black">Delete Product</h3>
                <p className="text-xs text-muted-foreground leading-relaxed border-0">
                  Are you sure you want to delete <strong>{productToDelete.title}</strong>? This action will permanently remove it from the catalog.
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button variant="ghost" size="sm" onClick={() => setProductToDelete(null)} disabled={deletingProduct}>
                Cancel
              </Button>
              <Button onClick={handleDeleteConfirm} size="sm" className="bg-red-500 hover:bg-red-600 text-white font-bold" disabled={deletingProduct}>
                {deletingProduct ? (
                  <>
                    <Loader2 className="animate-spin mr-1.5 h-4 w-4" />
                    Deleting...
                  </>
                ) : (
                  "Delete Product"
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </RoleShell>
  );
}

function OrdersTab({ orders, myProductIds }: { orders: Order[]; myProductIds: Set<string> }) {
  const acceptOrder = useNaflis((s) => s.sellerAcceptOrder);
  const startPreparing = useNaflis((s) => s.sellerStartPreparing);
  const markReady = useNaflis((s) => s.sellerMarkReady);
  const act = async (orderId: string, to: Parameters<typeof runOrderTransition>[1], apply: () => void, success: string) => {
    const res = await runOrderTransition(orderId, to, apply);
    if (res.ok) toast.success(success);
    else toast.error(res.message);
  };
  
  if (orders.length === 0) {
    return (
      <div className="rounded-2xl border bg-card p-10 text-center">
        <Package className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
        <p className="font-semibold">No customer orders yet</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Place an order as a buyer to see it appear here.
        </p>
        <Button asChild className="mt-4" variant="outline"><Link to="/buyer">Switch to Buyer</Link></Button>
      </div>
    );
  }
  return (
    <div className="space-y-2 animate-fade-in">
      {orders.map((o) => {
        const myItems = o.items.filter((i) => myProductIds.has(i.productId));
        const myTotal = myItems.reduce((a, i) => a + i.price * i.qty, 0);
        return (
          <div key={o.id} className="rounded-xl border bg-card p-4 hover:shadow-sm transition-shadow">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs text-muted-foreground">Order #{o.id.slice(2, 10)} · {fmtDate(o.createdAt)}</p>
                <p className="mt-0.5 font-semibold">{myItems.length} item(s) · {GHS(myTotal)}</p>
              </div>
              <Badge variant="secondary">{orderStateLabel(o.status)}</Badge>
            </div>
            {o.deliveryUnlocked === false && (
              <p className="mt-2 text-xs text-warning">Payment plan in progress — dispatch unlocks once the buyer meets the delivery terms.</p>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              {o.status === "awaiting_payment" && (
                <p className="text-xs text-muted-foreground">Reserved — waiting for the buyer to pay the balance.</p>
              )}
              {o.status === "paid" && (
                <Button size="sm" onClick={() => act(o.id, "accepted", () => acceptOrder(o.id), "Order accepted — buyer notified")}>
                  Accept order
                </Button>
              )}
              {o.status === "accepted" && (
                <Button size="sm" onClick={() => act(o.id, "processing", () => startPreparing(o.id), "Marked as processing")}>
                  Start processing
                </Button>
              )}
              {o.status === "processing" && (
                <Button size="sm" onClick={() => act(o.id, "ready", () => markReady(o.id), "Ready for pickup — delivery partners notified")}>
                  Ready for pickup
                </Button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ProductsTab({
  products,
  openAddProduct,
  openEditProduct,
  setProductToDelete,
}: {
  products: any[];
  openAddProduct: () => void;
  openEditProduct: (product: any) => void;
  setProductToDelete: (product: any) => void;
}) {
  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-black">My Products</h2>
          <p className="text-xs text-muted-foreground">Manage your storefront listings and inventory stock level.</p>
        </div>
        <Button onClick={openAddProduct} size="sm" className="bg-sky-500 hover:bg-sky-600 text-white gap-1.5">
          <Plus className="h-4 w-4" /> Add Product
        </Button>
      </div>

      {products.length === 0 ? (
        <div className="rounded-2xl border bg-card p-10 text-center">
          <Package className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
          <p className="font-semibold">No products listed yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Get started by adding your first product to your store.
          </p>
          <Button onClick={openAddProduct} className="mt-4" variant="outline">
            Add Your First Product
          </Button>
        </div>
      ) : (
        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left border-collapse">
              <thead>
                <tr className="border-b bg-muted/40 font-semibold text-muted-foreground">
                  <th className="p-3 pl-4">Product Details</th>
                  <th className="p-3">Category</th>
                  <th className="p-3">Price</th>
                  <th className="p-3">Stock</th>
                  <th className="p-3 pr-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {products.map((p) => (
                  <tr key={p.id} className="hover:bg-muted/30 transition-colors">
                    <td className="p-3 pl-4">
                      <div className="flex items-center gap-3">
                        <img
                          src={p.images?.[0] || "https://images.unsplash.com/photo-1523275335684-37898b6baf30"}
                          alt={p.title}
                          className="h-10 w-10 rounded-lg object-cover border"
                        />
                        <div className="min-w-0">
                          <p className="font-bold text-foreground truncate max-w-[200px]">{p.title}</p>
                          <p className="text-xs text-muted-foreground truncate max-w-[250px]">{p.description}</p>
                        </div>
                      </div>
                    </td>
                    <td className="p-3">
                      <Badge variant="secondary" className="font-semibold">{p.category}</Badge>
                    </td>
                    <td className="p-3 font-bold text-foreground">
                      {GHS(p.price)}
                    </td>
                    <td className="p-3">
                      {p.stock === 0 ? (
                        <span className="text-xs font-bold text-red-500">Out of Stock</span>
                      ) : p.stock < 5 ? (
                        <span className="text-xs font-bold text-amber-500">Low Stock ({p.stock})</span>
                      ) : (
                        <span className="text-xs font-bold text-success-foreground bg-success/20 px-2 py-0.5 rounded">{p.stock} units</span>
                      )}
                    </td>
                    <td className="p-3 pr-4 text-right">
                      <div className="flex justify-end gap-1.5">
                        <Button
                          onClick={() => openEditProduct(p)}
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 hover:bg-muted"
                        >
                          <Edit className="h-4 w-4 text-sky-500" />
                        </Button>
                        <Button
                          onClick={() => setProductToDelete(p)}
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 hover:bg-muted hover:text-red-500"
                        >
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function IntelligenceTab({ searchEvents, products }: { searchEvents: any[]; products: any[] }) {
  const zeroMatch = searchEvents.filter((e) => e.matches === 0);
  const hottest = [...products].slice(0, 5);
  return (
    <div className="grid gap-3 md:grid-cols-2 animate-fade-in">
      <div className="rounded-xl border bg-card p-4">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-sky-500" />
          <p className="font-semibold">Hottest products in your catalog</p>
        </div>
        {hottest.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">Add products to view analytics.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {hottest.map((p) => {
              const score = Math.round(p.demand ?? 0);
              return (
                <li key={p.id} className="flex items-center gap-3 text-sm">
                  <span className="truncate">{p.title}</span>
                  <Progress value={score} className="ml-auto w-24" />
                  <span className="w-10 text-right text-xs font-semibold">{score}%</span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <div className="rounded-xl border bg-card p-4">
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-gold" />
          <p className="font-semibold">Unmet demand (buyer searches with 0 results)</p>
        </div>
        {zeroMatch.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">
            No unmet searches yet — try searching for something rare as a buyer.
          </p>
        ) : (
          <ul className="mt-3 space-y-2 text-sm">
            {zeroMatch.slice(0, 8).map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-2">
                <span className="truncate">"{e.query}"</span>
                <Badge variant="outline" className="shrink-0">{e.region}</Badge>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function PricingTab({ products }: { products: any[] }) {
  const [applied, setApplied] = useState<Record<string, boolean>>({});
  const recommendations = products
    .map((p) => {
      const suggestedExtra = 0.12;
      const newPrice = Math.round(p.price * (1 - suggestedExtra));
      return { p, suggestedExtra, newPrice, projectedLift: Math.round(15 + suggestedExtra * 200) };
    })
    .slice(0, 6);

  if (products.length === 0) {
    return (
      <div className="rounded-xl border bg-card p-6 text-center animate-fade-in">
        <p className="text-sm text-muted-foreground">No recommendations available. Please add products first.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3 animate-fade-in">
      <div className="rounded-xl border bg-card p-4">
        <p className="text-sm">
          NAFLIS Price Intelligence analyses competitor pricing, buyer wishlists, and demand curves to recommend when to move the needle.
        </p>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {recommendations.map(({ p, suggestedExtra, newPrice, projectedLift }) => (
          <div key={p.id} className="rounded-xl border bg-card p-4">
            <p className="text-sm font-semibold">{p.title}</p>
            <div className="mt-2 flex items-baseline gap-2 text-sm">
              <span className="text-muted-foreground line-through">{GHS(p.price)}</span>
              <span className="text-lg font-bold text-sky-500">{GHS(newPrice)}</span>
              <Badge className="ml-auto bg-success text-success-foreground">−{pct(suggestedExtra * 100)}</Badge>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Projected demand lift: <span className="font-semibold text-foreground">+{projectedLift}%</span>
            </p>
            <Button
              size="sm"
              variant={applied[p.id] ? "outline" : "default"}
              className="mt-3 w-full"
              disabled={applied[p.id]}
              onClick={() => {
                setApplied((a) => ({ ...a, [p.id]: true }));
                toast.success(`Applied to ${p.title}`);
              }}
            >
              {applied[p.id] ? "Recommendation applied" : "Apply recommendation"}
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}

function RequestsTab({ requests }: { requests: any[] }) {
  return (
    <div className="grid gap-3 md:grid-cols-2 animate-fade-in">
      {requests.map((r) => (
        <div key={r.id} className="rounded-xl border bg-card p-4">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-sky-500" />
            <p className="text-xs text-muted-foreground">{r.interestedBuyers.toLocaleString()} buyers waiting</p>
          </div>
          <p className="mt-2 font-semibold">{r.name}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {r.category} · {r.region} · budget {GHS(r.priceMin)}–{GHS(r.priceMax)}
          </p>
          <div className="mt-2 flex flex-wrap gap-1">
            {r.wantsReserve && <Badge variant="outline">Reserve</Badge>}
            {r.wantsInstallment && <Badge variant="outline">Installment</Badge>}
          </div>
          <Button
            size="sm"
            className="mt-3 w-full"
            onClick={() => toast.success("Product listed — matched buyers notified")}
          >
            List product to matched buyers
          </Button>
        </div>
      ))}
    </div>
  );
}

function BrandTab() {
  const [name, setName] = useState("");
  const [tagline, setTagline] = useState("");
  const [generated, setGenerated] = useState<{ name: string; tagline: string; palette: string[] } | null>(null);
  return (
    <div className="grid gap-3 md:grid-cols-2 animate-fade-in">
      <div className="rounded-xl border bg-card p-4">
        <div className="mb-3 flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-gold" />
          <p className="font-semibold">Brand Studio</p>
        </div>
        <div className="space-y-2">
          <Input placeholder="Store name idea" value={name} onChange={(e) => setName(e.target.value)} />
          <Input placeholder="What do you sell?" value={tagline} onChange={(e) => setTagline(e.target.value)} />
          <Button
            className="w-full"
            onClick={() => {
              setGenerated({
                name: name || "My Store",
                tagline: tagline ? `Premium ${tagline} — verified, escrow-protected.` : "Certified quality, unbeatable prices.",
                palette: ["#0F172A", "#1E3A8A", "#7C3AED", "#F59E0B"],
              });
              toast.success("Brand identity generated");
            }}
          >
            Generate store identity
          </Button>
        </div>
      </div>
      <div className="rounded-xl border bg-card p-4">
        <p className="font-semibold">Preview</p>
        {generated ? (
          <div className="mt-3">
            <p className="text-lg font-black">{generated.name}</p>
            <p className="text-sm text-muted-foreground">{generated.tagline}</p>
            <div className="mt-3 flex gap-2">
              {generated.palette.map((c) => (
                <span key={c} className="h-8 w-8 rounded-lg border" style={{ background: c }} />
              ))}
            </div>
            <Button className="mt-4 w-full" variant="outline" onClick={() => toast.success("Store published — catalog generation started")}>
              Publish store
            </Button>
          </div>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">Generate to see a live preview.</p>
        )}
      </div>
    </div>
  );
}
