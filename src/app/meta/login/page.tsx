import { redirect } from "next/navigation";

export default function MetaLoginPage() {
  redirect("/auth/login");
}
