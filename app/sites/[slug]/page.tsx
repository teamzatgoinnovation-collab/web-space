import { SiteManage } from "@/components/SiteManage";

type Props = { params: Promise<{ slug: string }> };

export default async function SiteManagePage({ params }: Props) {
  const { slug } = await params;
  return <SiteManage slug={slug} />;
}
