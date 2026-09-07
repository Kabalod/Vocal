import { ReelWorkspace } from "@/components/ReelWorkspace";

export default async function ReelPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ReelWorkspace id={id} />;
}
