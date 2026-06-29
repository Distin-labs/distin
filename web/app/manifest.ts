import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Distin: One Solana account, every chain, no bridges",
    short_name: "Distin",
    description:
      "Distin turns Solana into a control plane for cross-chain signing. A quorum of bonded operators threshold-signs a native transaction for any chain, coordinated and slashed on-chain. No bridge, no wrapped assets.",
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
