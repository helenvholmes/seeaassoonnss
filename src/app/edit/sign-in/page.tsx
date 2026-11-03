import { redirect } from "next/navigation";
import { SignIn } from "@/components/owner/SignIn";
import { passkeyCount } from "@/lib/auth/passkeys";
import { isOwner } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function SignInPage() {
  if (await isOwner()) redirect("/edit");
  const count = await passkeyCount();
  return (
    <main className="owner">
      <h1>// seasons</h1>
      <SignIn hasPasskeys={count > 0} />
    </main>
  );
}
