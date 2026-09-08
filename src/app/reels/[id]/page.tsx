import { ReelStudio } from "@/components/ReelStudio";

export default async function ReelPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ReelStudio reelId={id} />;
}
