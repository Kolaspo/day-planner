import { redirect } from "next/navigation";
import { getServerSupabase } from "@/lib/supabase/server";
import PlannerApp from "@/components/PlannerApp";

export const dynamic = "force-dynamic";

export default async function Home() {
  const supabase = getServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return <PlannerApp userId={user.id} email={user.email ?? ""} />;
}
