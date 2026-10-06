import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Ghost Finance",
    short_name: "Ghost",
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
    ],
  };
}
