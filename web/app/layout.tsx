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
  title: "Distin — One Solana account, every chain, no bridges",
  description:
    "Distin turns Solana into a control plane for cross-chain signing. A quorum of bonded operators threshold-signs a native transaction for any chain, coordinated and slashed on-chain. No bridge, no wrapped assets.",
  openGraph: {
    title: "Distin — One Solana account, every chain, no bridges",
    description:
      "A quorum of bonded operators threshold-signs a native transaction for any chain, coordinated by a Solana program. The group secret is never reconstructed.",
    url: "/",
    siteName: "Distin",
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: "Distin — One Solana account, every chain, no bridges",
      },
    ],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Distin — One Solana account, every chain, no bridges",
    description:
      "Cross-chain threshold signing coordinated on Solana. No bridge, no wrapped assets.",
    images: ["/og.png"],
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
