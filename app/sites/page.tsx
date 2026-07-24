import { redirect } from "next/navigation";

/** Sites list lives at `/` — keep `/sites` as an alias. */
export default function SitesAliasPage() {
  redirect("/");
}
