import { notFound } from "next/navigation";
import { getKB, listFiles } from "@/lib/db";
import KbWorkspace from "./KbWorkspace";

export const dynamic = "force-dynamic";

export default async function KbPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const kb = await getKB(id);
  if (!kb) notFound();
  const files = await listFiles(id);

  return <KbWorkspace kb={kb} initialFiles={files} />;
}
