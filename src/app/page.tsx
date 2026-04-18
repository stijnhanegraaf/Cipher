/**
 * Root route — redirects to the default landing page.
 */
import { redirect } from "next/navigation";

export default function Home() {
  redirect("/browse");
}
