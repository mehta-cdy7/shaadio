import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { AuthShell } from '../_components/auth-shell';
import { redirectIfSignedIn } from '../_lib/redirect-if-signed-in';
import { FamilyBenefits } from '../_components/family-benefits';
import { SignupForm } from '../_components/signup-form';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('auth.signUp');
  return { title: t('metaTitle'), robots: { index: false, follow: false } };
}

export default async function SignupPage() {
  await redirectIfSignedIn();

  return (
    <AuthShell aside={<FamilyBenefits />}>
      <SignupForm />
    </AuthShell>
  );
}
