import { Badge } from "@/components/ui/badge";
import { cn, humanStatus } from "@/lib/utils";

const variants: Record<string, "default" | "secondary" | "outline" | "success" | "warning" | "destructive"> = {
  completed: "success",
  running: "default",
  queued: "secondary",
  pending: "secondary",
  paused: "warning",
  failed: "destructive",
  cancelled: "outline",
  skipped: "outline",
};

export function StatusBadge({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  const variant = variants[status] || "secondary";
  return (
    <Badge variant={variant} className={cn("capitalize", className)}>
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          status === "running" && "animate-pulse bg-primary",
          status === "completed" && "bg-success",
          status === "failed" && "bg-destructive",
          status === "paused" && "bg-warning",
          status === "cancelled" && "bg-muted-foreground",
          status === "skipped" && "bg-muted-foreground",
          status === "pending" && "bg-muted-foreground/60",
          status === "queued" && "bg-muted-foreground/60",
        )}
      />
      {humanStatus(status)}
    </Badge>
  );
}
