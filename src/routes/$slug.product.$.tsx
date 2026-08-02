import { lazy, Suspense } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Skeleton } from "@/components/ui/skeleton";

const ProductDetail = lazy(() =>
  import("./$slug.product.$id").then((m) => ({ default: m.ProductDetail })),
);

export const Route = createFileRoute("/$slug/product/$")({
  component: SplatProductDetail,
});

function ProductDetailSkeleton() {
  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 py-8 grid md:grid-cols-2 gap-8 animate-pulse">
      <Skeleton className="aspect-square rounded-xl bg-slate-200/80 dark:bg-zinc-800/80" />
      <div className="space-y-4">
        <Skeleton className="h-8 w-2/3 bg-slate-200/80 dark:bg-zinc-800/80" />
        <Skeleton className="h-6 w-1/3 bg-slate-200/80 dark:bg-zinc-800/80" />
        <Skeleton className="h-28 w-full bg-slate-200/80 dark:bg-zinc-800/80" />
        <Skeleton className="h-12 w-full rounded-lg bg-slate-200/80 dark:bg-zinc-800/80" />
      </div>
    </div>
  );
}

function SplatProductDetail() {
  const params = Route.useParams() as { _splat?: string };
  return (
    <Suspense fallback={<ProductDetailSkeleton />}>
      <ProductDetail splatId={params?._splat} />
    </Suspense>
  );
}
