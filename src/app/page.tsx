import { connection } from "next/server";

import { WorkspaceApp } from "@/components/workspace/workspace-app";

export default async function Home() {
  await connection();
  return <WorkspaceApp />;
}
