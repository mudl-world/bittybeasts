import type { Metadata, Viewport } from "next";
import { Pixelify_Sans, Silkscreen } from "next/font/google";
import "./globals.css";
import "./ui-kit.css";

// Pixel-RPG type: Silkscreen for titles and name tabs, Pixelify Sans for everything else.
const title = Silkscreen({ variable: "--font-title-face", weight: ["400", "700"], subsets: ["latin"] });
const display = Pixelify_Sans({ variable: "--font-display-face", weight: ["400", "500", "600", "700"], subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "Bitty Beasts", template: "%s · Bitty Beasts" },
  description: "A cat with a mind of its own and nine lives to spend. An AI pet on NEAR that thinks with verifiable NEAR AI, pays its own way in YARN, and prowls the rooftops of Lantern Lane.",
};

export const viewport: Viewport = {
  themeColor: "#0c0a26",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${title.variable} ${display.variable} antialiased`}>
      <body className="min-h-dvh bg-night-950">{children}</body>
    </html>
  );
}
