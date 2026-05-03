import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "@/lib/providers";
import { FloatingUploadWidget } from "@/components/video/FloatingUploadWidget";
import { CommandPalette } from "@/components/layout/CommandPalette";
import { BottomNav } from "@/components/layout/BottomNav";
import { OnboardingWizard } from "@/components/layout/OnboardingWizard";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Basketball Clipper",
  description: "Generador automático de clips de posesión para baloncesto",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body className={`${inter.className} pb-16 md:pb-0`}>
        {/* #14 — Skip to main content (WCAG 2.1 SC 2.1.1) */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[500]
                     focus:rounded-md focus:bg-background focus:px-4 focus:py-2 focus:text-sm
                     focus:font-medium focus:shadow-lg focus:ring-2 focus:ring-ring"
        >
          Saltar al contenido principal
        </a>
        <Providers>
          {children}
          <FloatingUploadWidget />
          <CommandPalette />
          <BottomNav />
          {/* #41 — Onboarding first-run wizard */}
          <OnboardingWizard />
        </Providers>
      </body>
    </html>
  );
}
