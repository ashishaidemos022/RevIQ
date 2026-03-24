import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";

export default async function RootPage() {
  const session = await getSession();

  // `other` role users have no data pages — land on AE Leaderboards
  if (session?.role === "other") {
    redirect("/leaderboard");
  }

  redirect("/home");
}
