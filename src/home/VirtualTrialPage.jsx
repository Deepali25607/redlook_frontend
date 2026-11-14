import { VirtualTrialApp } from '../virtualtrial/VirtualTrialApp';
import { useSeo } from '../seo/useSeo';
import { SEO } from '../seo/seoConfig';

// Route page for /virtual-trial. The premium maroon/gold shell + nav/footer
// come from App.jsx; this renders the working try-on app.
export function VirtualTrialPage({ onNavigate }) {
  useSeo({ ...SEO.virtualTrial, canonicalPath: '/virtual-trial' });
  return <VirtualTrialApp onNavigate={onNavigate} />;
}
