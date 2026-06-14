import Workspace from "./Workspace";

export const dynamic = "force-dynamic";

export default async function BuildPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <Workspace token={token} />;
}
