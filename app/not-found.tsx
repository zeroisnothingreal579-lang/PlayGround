import Link from "next/link";
import { Compass } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
      <div className="mb-5 grid h-12 w-12 place-items-center rounded-xl border border-border bg-secondary">
        <Compass className="h-5 w-5 text-primary" />
      </div>
      <p className="font-mono text-xs text-primary">404</p>
      <h1 className="mt-2 text-2xl font-semibold">This page does not exist</h1>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">
        The project, skill, or run may have been deleted, or the URL may be incorrect.
      </p>
      <div className="mt-6 flex gap-2">
        <Button asChild variant="outline">
          <Link href="/projects">Projects</Link>
        </Button>
        <Button asChild>
          <Link href="/">Dashboard</Link>
        </Button>
      </div>
    </div>
  );
}
