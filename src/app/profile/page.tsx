import { ProfileScreen } from "@/components/ProfileScreen";
import { resolveRequestUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const user = await resolveRequestUser().catch(() => null);
  return <ProfileScreen email={user?.email ?? null} />;
}
