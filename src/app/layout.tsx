import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { Navbar } from "@/components/layout/Navbar";
import { Toaster } from "sonner";

const geist = Geist({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "WanderWise — Campervan Trip Planner",
  description: "Plan your perfect campervan road trip",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" style={{ colorScheme: "light" }}>
      <body className={`${geist.className} bg-gray-50 min-h-screen`}>
        <Providers>
          <Navbar />
          <main className="mx-auto max-w-6xl px-4 sm:px-6 py-8">
            {children}
          </main>
          <Toaster position="bottom-right" />
        </Providers>
      </body>
    </html>
  );
}
