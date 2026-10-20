import HelpGuideArticle from "@/components/HelpGuideArticle";

export async function generateMetadata({ params }) {
  const { slug } = await params;
  return {
    title: `${slug.replaceAll("-", " ")} | Ratewell Help Center`,
    robots: { index: false, follow: true },
  };
}

export default async function HelpGuidePage({ params }) {
  const { slug } = await params;
  return <HelpGuideArticle slug={slug} />;
}
