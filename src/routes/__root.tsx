import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
  type ErrorComponentProps,
  redirect,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { Toaster } from "@/components/ui/sonner";
import { supabase } from "@/lib/supabase";
import { IS_LIVE, LIVE_MISCONFIGURED, hiddenInLive, liveFallback } from "@/lib/appMode";
import { siteMeta } from "@/lib/siteMeta";
import { sessionReady } from "@/lib/sessionReady";
import { takeReturnPath } from "@/lib/returnPoint";
import { useNaflis } from "@/lib/naflis/store";
import { syncCampusContent } from "@/services/campusContent";
import { syncStudentListings } from "@/services/studentListings";
import { ImpersonationBanner } from "@/components/naflis/ImpersonationBanner";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: ErrorComponentProps) {
  console.error(error);
  const router = useRouter();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  // Live: pages not connected yet redirect from one place (appMode LIVE_HIDDEN_PATHS).
  beforeLoad: ({ location }) => {
    if (hiddenInLive(location.pathname)) throw redirect({ to: liveFallback(location.pathname) });
  },
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      ...siteMeta(),
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.png", type: "image/png" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem('naflis-theme')||'system';var d=t==='dark'||(t==='system'&&matchMedia('(prefers-color-scheme:dark)').matches);document.documentElement.classList.toggle('dark',d);}catch(e){}`,
          }}
        />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

/** Live mode without Supabase settings: say so instead of quietly running the demo. */
function NotConfigured() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-2xl font-bold text-foreground">Site not configured</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This deployment runs in live mode but has no Supabase settings (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY).
        </p>
      </div>
    </div>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const syncUser = useNaflis((s) => s.syncUser);
  const router = useRouter();

  useEffect(() => {
    if (supabase) {
      // 1. Initial check: restore the stored session with its roles and grants, and
      // start in the right workspace (shared with the route guards, so it runs once).
      // Back from an email-confirmation link: go where they were before signing up.
      void sessionReady().then(() => {
        if (!useNaflis.getState().currentUserId) return;
        const to = takeReturnPath();
        // A full same-site path (it may carry ?query): hand it to history as is.
        if (to && to !== router.state.location.href) router.history.replace(to);
      });

      // 2. Auth state listener
      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange((event, session) => {
        if (event === "SIGNED_OUT") {
          syncUser(null);
        } else if (session?.user) {
          syncUser(session.user);
        }
      });

      return () => {
        subscription.unsubscribe();
      };
    }
  }, [syncUser, router]);

  // Live mode: notices, events, resources and student listings come from Supabase
  // (the store starts empty). Demo mode keeps its seeded content.
  useEffect(() => {
    if (!IS_LIVE || LIVE_MISCONFIGURED) return;
    syncCampusContent().catch((err) => console.warn("Couldn't load campus notices, events and resources:", err));
    syncStudentListings().catch((err) => console.warn("Couldn't load student listings:", err));
  }, []);

  if (LIVE_MISCONFIGURED) return <NotConfigured />;

  return (
    <QueryClientProvider client={queryClient}>
      <Outlet />
      <ImpersonationBanner />
      <Toaster position="top-right" richColors />
    </QueryClientProvider>
  );
}
