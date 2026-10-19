"use client";

import { Toaster as SonnerToaster } from "sonner";

export function Toaster() {
  return (
    <SonnerToaster
      theme="dark"
      position="bottom-right"
      toastOptions={{
        style: {
          background: "hsl(0 0% 9%)",
          border: "1px solid hsl(0 0% 18%)",
          color: "hsl(0 0% 95%)",
        },
      }}
    />
  );
}
