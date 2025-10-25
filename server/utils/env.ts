const stripTrailingSlash = (url: string) => url.replace(/\/$/, "");

export function getPublicAppUrl() {
  const configured = process.env.PUBLIC_APP_URL;
  if (configured && configured.trim().length > 0) {
    return stripTrailingSlash(configured.trim());
  }

  const host = process.env.APP_PUBLIC_HOST || "localhost";
  const port = process.env.APP_PUBLIC_PORT || process.env.PORT || "5000";
  const isProduction = process.env.NODE_ENV === "production";
  const protocol = process.env.APP_PUBLIC_PROTOCOL || (isProduction ? "https" : "http");

  if ((protocol === "http" && port === "80") || (protocol === "https" && port === "443")) {
    return `${protocol}://${host}`;
  }

  return `${protocol}://${host}:${port}`;
}
