import { AuthScreen } from "@/components/AuthScreen";
import { safeReturnTo } from "@/lib/auth/return-to";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  return <AuthScreen mode="login" next={safeReturnTo(next)} />;
}
