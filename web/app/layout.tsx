import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "@/lib/providers";
import { FloatingUploadWidget } from "@/components/video/FloatingUploadWidget";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Basketball Clipper",
  description: "Generador automático de clips de posesión para baloncesto",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className={inter.className}>
        <Providers>
          {children}
          <FloatingUploadWidget />
        </Providers>
      </body>
    </html>
  );
}
