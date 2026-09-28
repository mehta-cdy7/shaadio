import { Chapters } from './_components/chapters';
import { Faq } from './_components/faq';
import { FinalCta } from './_components/final-cta';
import { GuestsNoApp } from './_components/guests-no-app';
import { Hero } from './_components/hero';
import { HowItWorks } from './_components/how-it-works';
import { IndianWeddings } from './_components/indian-weddings';
import { Privacy } from './_components/privacy';
import { Problem } from './_components/problem';
import { SiteFooter } from './_components/site-footer';
import { SiteHeader } from './_components/site-header';
import { WorkspacePreview } from './_components/workspace-preview';

/** Public landing page. Static: no session, no database. */
export default function HomePage() {
  return (
    <>
      <SiteHeader />
      <main>
        <Hero />
        <WorkspacePreview />
        <Problem />
        <Chapters />
        <GuestsNoApp />
        <IndianWeddings />
        <HowItWorks />
        <Privacy />
        <Faq />
        <FinalCta />
      </main>
      <SiteFooter />
    </>
  );
}
