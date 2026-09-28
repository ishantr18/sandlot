// Web App Manifest — what makes "Add to Home Screen" install Diamond Drive
// like a real app: own icon, own window, no browser bars.
import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Diamond Drive",
    short_name: "Diamond Drive",
    description:
      "Pro-level baseball coaching on any phone — for every kid, not just the ones who can afford it.",
    start_url: "/",
    display: "standalone",
    background_color: "#000000",
    theme_color: "#166534",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
