export const SESSION_COOKIE = "space_customer_sid";

export function frappeBaseUrl(): string {
  return (process.env.FRAPPE_BASE_URL || process.env.SPACE_FRAPPE_URL || "https://space.zatgo.online").replace(
    /\/$/,
    "",
  );
}
