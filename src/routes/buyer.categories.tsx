import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { ChevronRight, Package } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useNaflis } from "@/lib/naflis/store";
import { categoryFamily, useCategories } from "@/services/categories";

export const Route = createFileRoute("/buyer/categories")({
  component: CategoriesPage,
});

function CategoriesPage() {
  const products = useNaflis((s) => s.products);
  const { tree } = useCategories("mall");

  const counts = useMemo(() => {
    const byName: Record<string, number> = {};
    for (const p of products) byName[p.category] = (byName[p.category] ?? 0) + 1;
    return byName;
  }, [products]);

  const countFor = (name: string) => categoryFamily(tree, name).reduce((a, n) => a + (counts[n] ?? 0), 0);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Categories</h1>
        <p className="text-sm text-muted-foreground">Browse everything on the mall by department.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {tree.map((c) => (
          <div key={c.id} className="rounded-2xl border bg-card p-4">
            <Link
              to="/buyer/search"
              search={{ cat: c.name }}
              className="flex items-center gap-3 font-semibold hover:text-sky-500"
            >
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-accent text-sky-500">
                <Package className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1 truncate">{c.name}</span>
              <Badge variant="secondary">{countFor(c.name)}</Badge>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </Link>
            {c.children.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {c.children.map((child) => (
                  <Link
                    key={child.id}
                    to="/buyer/search"
                    search={{ cat: child.name }}
                    className="rounded-full border px-2.5 py-1 text-xs text-muted-foreground transition hover:border-sky-500 hover:text-foreground"
                  >
                    {child.name}
                  </Link>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
