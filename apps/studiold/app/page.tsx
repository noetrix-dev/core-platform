import { redirect } from "next/navigation";
import { requireUser } from "@/lib/supabase/auth";

export default async function Home() {
  await requireUser();
  redirect("/agenda");
}
