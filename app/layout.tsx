import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AppShell } from "@/components/app-shell";
import { Toaster } from "@/components/toaster";
import { listProjects } from "@/lib/db/repo";
import { resolveAiConfig } from "@/lib/ai/providers";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: {
    default: "Replica Studio",
    template: "%s · Replica Studio",
  },
  description:
    "An AI workspace for running the Replica skill pack: recon, architecture, design, build, test, brand, launch, and deploy.",
  applicationName: "Replica Studio",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0b0b0c",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  let projects: { id: string; name: string }[] = [];
  let providerLabel = "Not configured";
  try {
    projects = listProjects(6).map((project) => ({ id: project.id, name: project.name }));
  } catch {
    providerLabel = "Storage error";
  }
  try {
    const config = resolveAiConfig();
    providerLabel = config.demo ? "Demo mode" : config.provider;
  } catch {
    if (providerLabel !== "Storage error") providerLabel = "Not configured";
  }

  return (
    <html lang="en" className="dark">
      <body>
        <AppShell recentProjects={projects} providerLabel={providerLabel}>
          {children}
        </AppShell>
        <Toaster />
      </body>
    </html>
  );
}
