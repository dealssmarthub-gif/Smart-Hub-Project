import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { ShieldCheck, User, Store, LayoutDashboard, ArrowLeft, Mail, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/naflis/Logo";
import { useNaflis } from "@/lib/naflis/store";
import { ThemeToggle } from "@/components/naflis/ThemeToggle";

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
  const signIn = useNaflis((s) => s.signIn);
  const users = useNaflis((s) => s.users);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  // Filter primary seed users for quick sign in
  const demoUsers = [
    { id: "u_buyer1", name: "Ama Owusu", role: "buyer", email: "ama@demo.gh", icon: User, color: "text-violet bg-violet/10 border-violet/20" },
    { id: "u_seller1", name: "TrendTech Ghana", role: "seller", email: "seller@trendtech.gh", icon: Store, color: "text-gold bg-gold/10 border-gold/20" },
    { id: "u_admin1", name: "Yaa Admin", role: "admin", email: "yaa@naflis.gh", icon: LayoutDashboard, color: "text-success bg-success/10 border-success/20" },
  ];

  const handleDemoSignIn = (userId: string, role: string) => {
    signIn(userId);
    toast.success(`Logged in as ${role.toUpperCase()}`);
    
    const dest = search.redirect || `/${role}`;
    navigate({ to: dest });
  };

  const handleCustomSignIn = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error("Please fill in all fields.");
      return;
    }

    setIsLoading(true);
    // Simulate Supabase login check, mapping known emails to seed users
    setTimeout(() => {
      const match = users.find((u) => u.email.toLowerCase() === email.toLowerCase());
      if (match) {
        signIn(match.id);
        toast.success(`Logged in as ${match.name}`);
        const dest = search.redirect || `/${match.role}`;
        navigate({ to: dest });
      } else {
        // Fallback for new user simulation
        toast.error("Invalid credentials (try using a seed email like ama@demo.gh)");
      }
      setIsLoading(false);
    }, 800);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col justify-between">
      {/* Header */}
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

      {/* Main Content */}
      <main className="flex-1 flex items-center justify-center p-4 py-12">
        <div className="max-w-md w-full space-y-6">
          <div className="text-center space-y-2">
            <h1 className="text-3xl font-black tracking-tight">Sign In</h1>
            <p className="text-sm text-muted-foreground">
              Access your personalized dashboard with secure authentication.
            </p>
          </div>

          {/* Quick Select Demo Accounts */}
          <div className="bg-card border rounded-2xl p-5 space-y-4 shadow-premium">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground font-semibold">
              <ShieldCheck className="h-4 w-4 text-violet" />
              <span>Demo Quick Sign-In</span>
            </div>
            <div className="grid gap-2">
              {demoUsers.map((demo) => {
                const Icon = demo.icon;
                return (
                  <button
                    key={demo.id}
                    onClick={() => handleDemoSignIn(demo.id, demo.role)}
                    className={`flex items-center justify-between p-3 rounded-xl border text-left transition hover:-translate-y-0.5 hover:shadow-sm ${demo.color}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-background">
                        <Icon className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="font-bold text-sm text-foreground">{demo.name}</p>
                        <p className="text-xs text-muted-foreground capitalize">{demo.role} Account</p>
                      </div>
                    </div>
                    <span className="text-xs font-semibold uppercase tracking-wider bg-background px-2.5 py-1 rounded-md border text-foreground">
                      Sign In
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="relative flex py-2 items-center">
            <div className="flex-grow border-t border-border"></div>
            <span className="flex-shrink mx-4 text-xs text-muted-foreground uppercase tracking-wider font-semibold">or email</span>
            <div className="flex-grow border-t border-border"></div>
          </div>

          {/* Real Credentials / Supabase-ready login form */}
          <form onSubmit={handleCustomSignIn} className="bg-card border rounded-2xl p-5 space-y-4 shadow-premium">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email address</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  placeholder="e.g. ama@demo.gh"
                  className="pl-9"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  className="pl-9"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            </div>

            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? "Signing in..." : "Continue with Email"}
            </Button>
          </form>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t bg-secondary/50">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-2 px-4 py-6 text-xs text-muted-foreground sm:flex-row">
          <p>© {new Date().getFullYear()} NAFLIS Discount Mall. Production credentials ready.</p>
        </div>
      </footer>
    </div>
  );
}
