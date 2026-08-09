import type { ImgHTMLAttributes } from "react";
import { cn } from "../lib/utils";

export function ZworkerLogo({ className, alt = "Zworker", ...props }: ImgHTMLAttributes<HTMLImageElement>) {
  return (
    <img
      src="/zworker-logo.png"
      alt={alt}
      className={cn("object-contain", className)}
      {...props}
    />
  );
}

export function ZworkerLoading({ className }: { className?: string }) {
  return (
    <div role="status" className={cn("flex min-h-dvh w-full items-center justify-center", className)}>
      <ZworkerLogo className="h-24 w-24 animate-pulse" alt="" aria-hidden="true" />
      <span className="sr-only">Загрузка…</span>
    </div>
  );
}
