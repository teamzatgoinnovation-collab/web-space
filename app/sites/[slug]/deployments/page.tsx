import { DeploymentDashboard } from "@/components/DeploymentDashboard";

type Props = { params: Promise<{ slug: string }> };

export default async function DeploymentsPage({ params }: Props) {
  const { slug } = await params;
  return <DeploymentDashboard slug={slug} />;
}
