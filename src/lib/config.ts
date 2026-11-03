import "server-only";

export const BASE_PATH = "/seasons";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Environment variable ${name} is not set. See .env.example.`);
  return value;
}

export const config = {
  get databaseUrl() {
    return required("DATABASE_URL");
  },
  get siteUrl() {
    return new URL(required("SITE_URL"));
  },
  get setupToken() {
    return process.env.SETUP_TOKEN || null;
  },
  get sourceUrl() {
    return process.env.SOURCE_URL || "https://github.com/helenvholmes/seasons";
  },
  get storageDriver(): "r2" | "local" {
    const driver = process.env.STORAGE_DRIVER || "local";
    if (driver !== "r2" && driver !== "local") throw new Error(`Unknown STORAGE_DRIVER "${driver}".`);
    if (driver === "local" && process.env.NODE_ENV === "production" && process.env.VERCEL) {
      throw new Error("STORAGE_DRIVER=local only works in development. Set STORAGE_DRIVER=r2.");
    }
    return driver;
  },
  /** Only the public URL: enough to show pages, without the R2 keys. */
  r2PublicUrl() {
    return required("R2_PUBLIC_URL").replace(/\/+$/, "");
  },
  r2() {
    return {
      accountId: required("R2_ACCOUNT_ID"),
      accessKeyId: required("R2_ACCESS_KEY_ID"),
      secretAccessKey: required("R2_SECRET_ACCESS_KEY"),
      privateBucket: required("R2_PRIVATE_BUCKET"),
      publicBucket: required("R2_PUBLIC_BUCKET"),
      publicUrl: required("R2_PUBLIC_URL").replace(/\/+$/, ""),
    };
  },
};
