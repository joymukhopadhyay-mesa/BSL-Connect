import { redirect } from "next/navigation";
import { connection } from "next/server";
import { isDatabaseConfigured } from "@/lib/env";
import { getViewer, homeFor } from "@/lib/data/session";

export default async function Home() {
  await connection(); // always decide per request
  if (!isDatabaseConfigured()) redirect("/setup");
  const viewer = await getViewer();
  redirect(viewer ? homeFor(viewer.status) : "/sign-in");
}
