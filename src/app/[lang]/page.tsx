import { connection } from "next/server";
import { notFound } from "next/navigation";

import { WorkspaceApp } from "@/components/workspace/workspace-app";
import { isLocale } from "@/i18n/config";

export default async function Home({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  await connection();
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  return <WorkspaceApp />;
}
