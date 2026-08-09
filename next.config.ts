import type { NextConfig } from "next";

/**
 * Built as a fully static site so GitHub Pages can serve it.
 *
 * Pages is static-file hosting with no Node runtime, so there is no server to
 * proxy Sleeper through — the live draft page calls the Sleeper API straight
 * from the browser instead. That only works because Sleeper returns
 * `access-control-allow-origin: *`; it was verified before committing to this.
 *
 * BASE_PATH is set by the deploy workflow to the repo name, since a project
 * site is served from https://<user>.github.io/<repo>/ rather than the root.
 */
const basePath = process.env.BASE_PATH ?? "";

const nextConfig: NextConfig = {
  output: "export",
  basePath,
  // Pages serves /foo/ as /foo/index.html; without this, deep links 404.
  trailingSlash: true,
  images: { unoptimized: true },
  reactStrictMode: true,
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
};

export default nextConfig;
