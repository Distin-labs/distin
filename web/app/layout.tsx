import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://distin.xyz"),
  title: "Distin — Liquidity, settled native on Solana",
  description:
    "Distin keeps liquidity native to Solana and settles every route inside a single block. No bridge, no wrapped assets, no custodial relays.",
  openGraph: {
    title: "Distin — Liquidity, settled native on Solana",
    description:
      "Native liquidity on Solana, settled in one block. The bridge, and everything that breaks with it, is gone.",
    url: "/",
    siteName: "Distin",
    images: [
      {
        url: "/og.jpg",
        width: 1200,
        height: 630,
        alt: "Distin — Liquidity, settled native on Solana",
      },
    ],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Distin — Liquidity, settled native on Solana",
    description:
      "Native liquidity on Solana, settled in one block. No bridge.",
    images: ["/og.jpg"],
  },
};

export const viewport: Viewport = {
  themeColor: "#060606",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
