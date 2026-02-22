declare module "next-pwa" {
  import type { NextConfig } from "next";

  type PWAOptions = {
    dest: string;
    disable?: boolean;
  };

  function withPWA(options: PWAOptions): (config: NextConfig) => NextConfig;
  export default withPWA;
}
