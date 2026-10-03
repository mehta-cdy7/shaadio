import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { AuthShell } from '../_components/auth-shell';
import { redirectIfSignedIn } from '../_lib/redirect-if-signed-in';
import { CeremonyArch } from '../_components/ceremony-arch';
import { LoginForm } from '../_components/login-form';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('auth.signIn');
  return { title: t('metaTitle'), robots: { index: false, follow: false } };
}

export default async function LoginPage() {
  await redirectIfSignedIn();

  return (
    <AuthShell aside={<CeremonyArch />}>
      <LoginForm />
    </AuthShell>
  );
}
