import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";

export default async function HomePage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role === "ADMIN" || session.role === "SERVICE_MANAGER") redirect("/hr");
  if (session.role === "TRAINER") redirect("/trainer/employees");
  redirect("/modules");
}
