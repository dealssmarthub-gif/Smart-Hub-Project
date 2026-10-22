import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { ArrowLeft, Mail, Lock, User, Phone, Sparkles, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/naflis/Logo";
import { ThemeToggle } from "@/components/naflis/ThemeToggle";
import { supabase } from "@/lib/supabase";
import { IS_LIVE } from "@/lib/appMode";
import { useNaflis } from "@/lib/naflis/store";
import { ROLE_META, postSignInPath, type Role } from "@/lib/naflis/roles";

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
  const [isLoading, setIsLoading] = useState(false);

  // Opening /login never signs anyone in or navigates away. If a session already
  // exists we just say so and let the user continue or sign out.
  const signedInUser = useNaflis((s) => s.users.find((u) => u.id === s.currentUserId));
  const activeRole = useNaflis((s) => s.role);
  const [hasServerSession, setHasServerSession] = useState(false);
  useEffect(() => {
    if (!supabase) return;
    supabase.auth
      .getSession()
      .then(({ data: { session } }) => setHasServerSession(Boolean(session)))
      .catch(() => setHasServerSession(false));
  }, []);

  const signOutEverywhere = async () => {
    if (supabase) await supabase.auth.signOut().catch(() => undefined);
    useNaflis.getState().signOut();
    setHasServerSession(false);
    toast.success("Signed out");
  };

  const handleDemoLogin = async (role: Extract<Role, "buyer" | "student" | "admin" | "src_head" | "super_admin">) => {
    if (IS_LIVE) return;
    // A real Supabase session would re-sync on its next token refresh and replace the demo account.
    if (supabase) await supabase.auth.signOut().catch(() => undefined);
    useNaflis.getState().setRole(role);
    toast.success(`Signed in as demo ${ROLE_META[role].label}`);
    // Demo buttons are explicit persona choices ("Demo Admin" means the admin workspace).
    const dest = postSignInPath(role, search.redirect);
    navigate({ to: dest });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) {
      // No backend: don't pretend to check credentials — point to the explicit demo accounts.
      toast.info("Email sign-in isn't available in demo mode. Use one of the demo accounts below.");
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
          if (error.message.toLowerCase().includes("email not confirmed")) {
            toast.error("Email not confirmed. Please check your inbox for the verification link.");
          } else if (error.message.toLowerCase().includes("invalid login credentials")) {
            toast.error("Invalid email or password. Please check your credentials and try again.");
          } else {
            toast.error(error.message);
          }
        } else if (data.user) {
          toast.success("Successfully logged in!");
          const role = await useNaflis.getState().completeSignIn(data.user);
          navigate({ to: postSignInPath(role, search.redirect) });
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
              role: "buyer",
              full_name: fullName,
              phone: phone,
              phone_number: phone,
            },
          },
        });

        if (error) {
          if (error.message.toLowerCase().includes("user already registered")) {
            toast.error("An account with this email already exists. Switching to Sign In.");
            setMode("signin");
          } else if (error.message.toLowerCase().includes("signups not allowed")) {
            toast.error("New sign-ups are closed right now. Please check back soon.");
          } else {
            toast.error(error.message);
          }
        } else {
          if (data.session && data.user) {
            toast.success("Account created and signed in!");
            // New accounts start in Buyer; Student OS is one switch away once verified.
            const role = await useNaflis.getState().completeSignIn(data.user);
            navigate({ to: postSignInPath(role, search.redirect) });
          } else {
            toast.success("Signup successful! Please check your email for verification.");
            setMode("signin");
          }
        }
      }
    } catch (err: any) {
      toast.error(err?.message || "An unexpected error occurred during authentication.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col justify-between">
      {/* Header */}
      <header className="border-b border-border-soft bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-2 px-4 sm:px-6 md:h-[72px]">
          <Logo compact />
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link to="/">
                <ArrowLeft className="h-4 w-4" strokeWidth={1.8} /> Landing
              </Link>
            </Button>
            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex items-center justify-center px-4 py-10 sm:py-14">
        <div className="max-w-md w-full space-y-6">
          <div className="text-center space-y-2">
            <h1 className="text-3xl font-extrabold tracking-tight">
              {mode === "signin" ? "Sign In" : "Create Account"}
            </h1>
            <p className="text-sm text-muted-foreground">
              {mode === "signin"
                ? IS_LIVE
                  ? "Access your dashboard to shop and use Student OS."
                  : "Access your dashboard to shop, track escrowed orders and use Student OS."
                : "Join NAFLIS Mall to buy smarter and unlock Student OS."}
            </p>
          </div>

          {signedInUser && (
            <div className="flex flex-wrap items-center gap-3 rounded-3xl border border-border bg-primary-soft p-4 text-sm">
              <img src={signedInUser.avatar} alt="" className="h-9 w-9 rounded-full" />
              <div className="min-w-0 flex-1">
                <p className="font-semibold">Signed in as {signedInUser.name}</p>
                <p className="text-xs text-muted-foreground">
                  {ROLE_META[activeRole].label} workspace{hasServerSession ? "" : " · demo account"}
                </p>
              </div>
              <Button size="sm" onClick={() => navigate({ to: postSignInPath(activeRole, search.redirect) })}>Continue</Button>
              <Button size="sm" variant="ghost" onClick={signOutEverywhere}>Sign out</Button>
            </div>
          )}

          {/* Form */}
          <form
            onSubmit={handleSubmit}
            className="bg-card border border-border-soft rounded-[28px] p-6 sm:p-7 space-y-4 shadow-soft"
          >
            {/* Mode Switcher */}
            <div className="grid grid-cols-2 gap-1 p-1 bg-muted rounded-full text-sm font-semibold">
              <button
                type="button"
                onClick={() => setMode("signin")}
                className={`min-h-10 rounded-full transition ${
                  mode === "signin"
                    ? "bg-card text-foreground shadow-soft"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => setMode("signup")}
                className={`min-h-10 rounded-full transition ${
                  mode === "signup"
                    ? "bg-card text-foreground shadow-soft"
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
                      placeholder="e.g. 024 123 4567"
                      className="pl-9"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      required
                    />
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
                  className="absolute right-0 grid h-11 w-11 place-items-center rounded-xl text-muted-foreground hover:text-foreground"
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

            <Button type="submit" size="lg" className="w-full font-bold" disabled={isLoading}>
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

          {/* Quick Demo Role Navigation (demo mode only) */}
          {!IS_LIVE && (
          <div className="rounded-3xl border border-border-soft bg-card p-4 text-center shadow-soft space-y-3">
            <p className="text-xs font-semibold text-muted-foreground">Demo accounts — click to sign in</p>
            <div className="flex flex-wrap justify-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="text-xs"
                onClick={() => handleDemoLogin("buyer")}
              >
                Demo Buyer
              </Button>
              <Button variant="outline" size="sm" className="text-xs" onClick={() => handleDemoLogin("student")}>
                Demo Student
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-xs"
                onClick={() => handleDemoLogin("admin")}
              >
                Demo Admin
              </Button>
              <Button variant="outline" size="sm" className="text-xs" onClick={() => handleDemoLogin("src_head")}>
                Demo SRC (UG)
              </Button>
              <Button variant="outline" size="sm" className="text-xs" onClick={() => handleDemoLogin("super_admin")}>
                Demo Super Admin
              </Button>
            </div>
          </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border-soft">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-2 px-4 py-6 text-xs text-muted-foreground sm:flex-row">
          <p>© {new Date().getFullYear()} NAFLIS Mall</p>
        </div>
      </footer>
    </div>
  );
}
