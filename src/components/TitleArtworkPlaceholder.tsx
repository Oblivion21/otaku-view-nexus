import { Film } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TitleArtworkVariant } from "@/lib/titleArtwork";

interface TitleArtworkPlaceholderProps {
  title: string;
  variant: TitleArtworkVariant;
  className?: string;
}

export default function TitleArtworkPlaceholder({
  title,
  variant,
  className,
}: TitleArtworkPlaceholderProps) {
  return (
    <div
      role="img"
      aria-label={`${title} artwork placeholder`}
      className={cn(
        "relative overflow-hidden border border-border bg-slate-950 text-white",
        className,
      )}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.22),transparent_42%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.26),transparent_40%),linear-gradient(135deg,#020617,#0f172a_45%,#111827)]" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />

      <div className="relative flex h-full w-full flex-col items-center justify-center gap-3 p-4 text-center">
        <div className="rounded-full border border-white/20 bg-white/10 p-3">
          <Film className={cn("text-white/85", variant === "banner" ? "h-8 w-8" : "h-6 w-6")} />
        </div>
        <div>
          <p className={cn(
            "mx-auto line-clamp-2 font-semibold text-white/95",
            variant === "banner" ? "max-w-2xl text-lg md:text-2xl" : "text-sm",
          )}>
            {title}
          </p>
        </div>
      </div>
    </div>
  );
}
