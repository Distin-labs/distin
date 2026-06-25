import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Distin — Liquidity, settled native on Solana",
    short_name: "Distin",
    description:
      "Distin keeps liquidity native to Solana and settles every route inside a single block. No bridge, no wrapped assets, no custodial relays.",
    start_url: "/",
    display: "standalone",
    background_color: "#060606",
    theme_color: "#060606",
    icons: [
      { src: "/icon.png", sizes: "512x512", type: "image/png" },
      { src: "/apple-icon.png", sizes: "180x180", type: "image/png" },
    ],
  };
}
