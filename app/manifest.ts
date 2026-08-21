import type { MetadataRoute } from "next";

export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Math Map",
    short_name: "Math Map",
    start_url: ".",
    display: "standalone",
    background_color: "#f7f9fb",
    theme_color: "#2E9EFF",
    icons: [
      { src: "android-chrome-192x192.png", sizes: "192x192", type: "image/png" },
      { src: "android-chrome-512x512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
