"use client";

import type { ReactNode } from "react";
import { LoaderCircle } from "lucide-react";

import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n/i18n-provider";

export function SkeletonBlock({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      aria-hidden
      className={cn("ui-skeleton rounded-md bg-neutral-100", className)}
      {...props}
    />
  );
}

export function WorkspaceHydrationShell() {
  const { t } = useI18n();
  return (
    <div
      className="flex h-dvh min-h-0 flex-col overflow-hidden bg-white"
      role="status"
      aria-live="polite"
      aria-label={t("ui.loadingWorkspace")}
    >
      <div className="flex h-14 shrink-0 items-center gap-2 border-b px-3 sm:px-4">
        <SkeletonBlock className="size-8 rounded-md" />
        <div className="mr-auto space-y-1.5">
          <SkeletonBlock className="h-3.5 w-36" />
          <SkeletonBlock className="h-2.5 w-24" />
        </div>
        <SkeletonBlock className="h-8 w-24 rounded-md" />
        <SkeletonBlock className="size-8 rounded-md" />
        <SkeletonBlock className="size-8 rounded-md" />
      </div>
      <div className="flex min-h-0 flex-1">
        <div className="hidden w-64 shrink-0 border-r p-3 md:block">
          <SkeletonBlock className="mb-3 h-9 w-full" />
          <SkeletonBlock className="mb-2 h-8 w-full" />
          <div className="space-y-2 pt-2">
            {Array.from({ length: 6 }, (_, index) => (
              <SkeletonBlock key={index} className="h-10 w-full" />
            ))}
          </div>
        </div>
        <div className="flex min-w-0 flex-1 flex-col p-4 sm:p-6">
          <div className="grid flex-1 grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 8 }, (_, index) => (
              <SkeletonBlock key={index} className="aspect-square w-full" />
            ))}
          </div>
          <SkeletonBlock className="mt-4 h-28 w-full rounded-lg" />
        </div>
      </div>
      <span className="sr-only">{t("ui.restoringWorkspace")}</span>
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid min-h-[40dvh] place-items-center px-4 py-10 text-center",
        className,
      )}
    >
      <div className="max-w-sm">
        <div className="mx-auto mb-3 grid size-11 place-items-center rounded-md border bg-neutral-50 text-muted-foreground [&_svg]:size-5">
          {icon}
        </div>
        <p className="text-sm font-medium">{title}</p>
        {description ? (
          <p className="mt-1.5 text-xs leading-5 text-muted-foreground">
            {description}
          </p>
        ) : null}
        {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
      </div>
    </div>
  );
}

export function InlineError({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <p
      role="alert"
      className={cn("text-xs leading-5 text-destructive", className)}
    >
      {children}
    </p>
  );
}

export function CreditsBadgeSkeleton() {
  const { t } = useI18n();
  return (
    <span className="inline-flex items-center gap-1.5">
      <LoaderCircle className="size-3.5 animate-spin text-muted-foreground" />
      <span className="text-xs text-muted-foreground">{t("common.syncing")}</span>
    </span>
  );
}

export function ImageLoadFrame({
  loaded,
  children,
  className,
}: {
  loaded: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("relative size-full overflow-hidden bg-neutral-100", className)}>
      {!loaded ? (
        <div className="ui-skeleton absolute inset-0 bg-neutral-100" aria-hidden />
      ) : null}
      {children}
    </div>
  );
}
