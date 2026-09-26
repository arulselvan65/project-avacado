import { redirect } from "next/navigation";

/**
 * Root page — redirects to the registration form.
 * There's no standalone home page for this internal tool.
 */
export default function Home() {
  redirect("/register");
}
