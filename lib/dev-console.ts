/** Server + client: enable developer activity console. */
export function isDevConsoleEnabled(): boolean {
  if (process.env.NEXT_PUBLIC_SPACE_DEV_CONSOLE === "1") return true;
  if (process.env.SPACE_DEV_CONSOLE === "1") return true;
  if (process.env.NODE_ENV === "development") return true;
  return false;
}
