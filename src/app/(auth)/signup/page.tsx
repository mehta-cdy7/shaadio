import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { ComingSoon } from '../_components/coming-soon';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('comingSoon.signUp');
  return { title: t('title'), robots: { index: false, follow: false } };
}

export default function SignupPage() {
  return <ComingSoon page="signUp" />;
}
