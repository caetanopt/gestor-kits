import { redirect } from "next/navigation";

/**
 * A área administrativa não tem página própria: o resumo é o dashboard, que
 * vive fora de /admin por ser acessível também aos distribuidores.
 */
export default function AdminIndexPage() {
  redirect("/dashboard");
}
