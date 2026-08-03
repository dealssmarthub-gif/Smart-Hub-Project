import { Link, useNavigate } from "@tanstack/react-router";
import { Logo } from "@/components/naflis/Logo";
import { ThemeToggle } from "@/components/naflis/ThemeToggle";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { LucideIcon } from "lucide-react";
import { ArrowLeft } from "lucide-react";
import { useNaflis } from "@/lib/naflis/store";
import { toast } from "sonner";

export function RolePreview({
  title,
  subtitle,
  icon: Icon,
  phase,
  features,
  metrics,
}: {
  title: string;
  subtitle: string;
  icon: LucideIcon;
  phase: string;
  features: string[];
  metrics: { label: string; value: string }[];
}) {
  const navigate = useNavigate();
  const signOut = useNaflis((s) => s.signOut);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4">
          <Logo />
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link to="/"><ArrowLeft className="mr-1 h-4 w-4" /> Landing</Link>
            </Button>
            <ThemeToggle />
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                signOut();
                toast.success("Signed out successfully");
                navigate({ to: "/" });
              }}
            >
              Sign Out
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-4 py-10">
        <div className="rounded-3xl border bg-card p-8 shadow-premium">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="mb-3 grid h-12 w-12 place-items-center rounded-xl gradient-hero text-white">
                <Icon className="h-6 w-6" />
              </div>
              <h1 className="text-3xl font-black tracking-tight">{title}</h1>
              <p className="mt-2 max-w-2xl text-muted-foreground">{subtitle}</p>
            </div>
            <Badge className="bg-gold text-gold-foreground">{phase}</Badge>
          </div>

          <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {metrics.map((m) => (
              <div key={m.label} className="rounded-xl border bg-background p-4">
                <p className="text-xs uppercase tracking-wider text-muted-foreground">{m.label}</p>
                <p className="mt-1 text-2xl font-black">{m.value}</p>
              </div>
            ))}
          </div>

          <div className="mt-8">
            <h2 className="mb-3 text-lg font-bold">What this role gets in the full build</h2>
            <ul className="grid gap-2 sm:grid-cols-2">
              {features.map((f) => (
                <li key={f} className="flex items-start gap-2 rounded-lg border bg-background p-3 text-sm">
                  <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-violet" />
                  {f}
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-8 flex flex-wrap gap-2">
            <Button asChild variant="outline"><Link to="/buyer">Explore Buyer experience</Link></Button>
            <Button asChild><Link to="/">Back to landing</Link></Button>
          </div>
        </div>
      </div>
    </div>
  );
}
