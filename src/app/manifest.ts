import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Mama's Cleaning Crew Training Portal",
    short_name: "MCC Training",
    description: "Employee training and onboarding portal for Mama's Cleaning Crew",
    start_url: "/",
    display: "standalone",
    background_color: "#EEF1F6",
    theme_color: "#1B2A4A",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
