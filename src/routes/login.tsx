import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { ArrowLeft, Mail, Lock, User, Store, Phone, Sparkles, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/naflis/Logo";
import { ThemeToggle } from "@/components/naflis/ThemeToggle";
import { supabase } from "@/lib/supabase";

const searchSchema = z.object({
  redirect: z.string().optional(),
});

export const Route = createFileRoute("/login")({
  validateSearch: (search) => searchSchema.parse(search),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const search = Route.useSearch();

  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [selectedRole, setSelectedRole] = useState<"buyer" | "seller">("buyer");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) {
      toast.error("Supabase client is not configured. Please check your environment variables.");
      return;
    }

    if (!email || !password) {
      toast.error("Please enter email and password.");
      return;
    }

    setIsLoading(true);

    try {
      if (mode === "signin") {
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) {
          toast.error(error.message);
        } else {
          toast.success("Successfully logged in!");
          const userRole = data.user?.user_metadata?.role || "buyer";
          const dest = search.redirect || `/${userRole}`;
          navigate({ to: dest });
        }
      } else {
        if (!fullName || !phone) {
          toast.error("Please fill in your name and phone number.");
          setIsLoading(false);
          return;
        }

        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              role: selectedRole,
              full_name: fullName,
              phone: phone,
            },
          },
        });

        if (error) {
          toast.error(error.message);
        } else {
          if (data.session) {
            toast.success("Account created and signed in!");
            const dest = search.redirect || `/${selectedRole}`;
            navigate({ to: dest });
          } else {
            toast.success("Signup successful! Please check your email for verification.");
            setMode("signin");
          }
        }
      }
    } catch (err: any) {
      toast.error(err.message || "An unexpected error occurred.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col justify-between">
      {/* Header */}
      <header className="border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4">
          <Logo />
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link to="/">
                <ArrowLeft className="mr-1 h-4 w-4" /> Landing
              </Link>
            </Button>
            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex items-center justify-center p-4 py-12">
        <div className="max-w-md w-full space-y-6">
          <div className="text-center space-y-2">
            <h1 className="text-3xl font-black tracking-tight">
              {mode === "signin" ? "Sign In" : "Create Account"}
            </h1>
            <p className="text-sm text-muted-foreground">
              {mode === "signin"
                ? "Access your dashboard to buy, sell or manage escrowed deals."
                : "Join NAFLIS Mall to buy smarter or build your vendor store."}
            </p>
          </div>

          {/* Form */}
          <form
            onSubmit={handleSubmit}
            className="bg-card border rounded-2xl p-6 space-y-4 shadow-premium"
          >
            {/* Mode Switcher */}
            <div className="grid grid-cols-2 gap-1 p-1 bg-muted rounded-xl text-xs font-semibold">
              <button
                type="button"
                onClick={() => setMode("signin")}
                className={`py-2 rounded-lg transition ${
                  mode === "signin"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => setMode("signup")}
                className={`py-2 rounded-lg transition ${
                  mode === "signup"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Register
              </button>
            </div>

            {mode === "signup" && (
              <>
                {/* Full Name */}
                <div className="space-y-1.5">
                  <Label htmlFor="fullName">Full Name</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="fullName"
                      type="text"
                      placeholder="Ama Owusu"
                      className="pl-9"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      required
                    />
                  </div>
                </div>

                {/* Phone */}
                <div className="space-y-1.5">
                  <Label htmlFor="phone">Phone Number</Label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="phone"
                      type="tel"
                      placeholder="+233 24 000 0000"
                      className="pl-9"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      required
                    />
                  </div>
                </div>

                {/* Role Selection */}
                <div className="space-y-2">
                  <Label>I want to join as a:</Label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setSelectedRole("buyer")}
                      className={`flex flex-col items-center justify-center p-3 rounded-xl border text-center transition hover:-translate-y-0.5 ${
                        selectedRole === "buyer"
                          ? "border-sky-500 bg-sky-500/5 text-sky-500 shadow-sm"
                          : "border-border bg-background hover:bg-muted"
                      }`}
                    >
                      <User className="h-6 w-6 mb-1" />
                      <span className="font-bold text-xs">Buyer</span>
                      <span className="text-[10px] text-muted-foreground mt-0.5">Shop & save with escrow</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setSelectedRole("seller")}
                      className={`flex flex-col items-center justify-center p-3 rounded-xl border text-center transition hover:-translate-y-0.5 ${
                        selectedRole === "seller"
                          ? "border-gold bg-gold/5 text-gold shadow-sm"
                          : "border-border bg-background hover:bg-muted"
                      }`}
                    >
                      <Store className="h-6 w-6 mb-1" />
                      <span className="font-bold text-xs">Seller</span>
                      <span className="text-[10px] text-muted-foreground mt-0.5">Publish products & campaigns</span>
                    </button>
                  </div>
                </div>
              </>
            )}

            {/* Email */}
            <div className="space-y-1.5">
              <Label htmlFor="email">Email address</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  placeholder="e.g. name@domain.com"
                  className="pl-9"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <div className="relative flex items-center">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground z-10" />
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  className="pl-9 pr-10"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 text-slate-400 hover:text-slate-200"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? (
                <>
                  <Sparkles className="animate-spin mr-2 h-4 w-4" />
                  {mode === "signin" ? "Signing In..." : "Creating Account..."}
                </>
              ) : mode === "signin" ? (
                "Sign In"
              ) : (
                "Create Account"
              )}
            </Button>
          </form>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t bg-secondary/50">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-2 px-4 py-6 text-xs text-muted-foreground sm:flex-row">
          <p>© {new Date().getFullYear()} NAFLIS Discount Mall. Real Authentication.</p>
        </div>
      </footer>
    </div>
  );
}
