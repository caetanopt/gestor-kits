import { redirect } from "next/navigation";
import { getCurrentUser, homePathFor } from "@/lib/auth/dal";

export default async function HomePage() {
  const user = await getCurrentUser();
  redirect(user ? homePathFor(user.role) : "/login");
}
