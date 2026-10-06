import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Noctrum Finance",
    short_name: "Noctrum",
    description:
      "Private peer-to-peer lending with sealed-bid rate discovery on Chainlink CRE.",
    start_url: "/",
    display: "standalone",
    background_color: "#101010",
    theme_color: "#a855f7",
    icons: [
      {
        src: "/favicon.ico",
        sizes: "any",
        type: "image/x-icon",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}
