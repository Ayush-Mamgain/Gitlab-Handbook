import { redirect } from "next/navigation";

// Root redirects to /chat (middleware handles auth)
export default function RootPage() {
  redirect("/chat");
}
