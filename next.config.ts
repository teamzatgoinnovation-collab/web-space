import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow LAN access in `next dev` (e.g. http://192.168.0.231:3010)
  allowedDevOrigins: ["192.168.0.231", "localhost", "127.0.0.1", "space.zatgo.online"],
};

export default nextConfig;
