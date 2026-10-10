import type { Metadata } from 'next';
import './globals.css';
import { AppProvider } from '../store/appContext';
import Navigation from '../components/Navigation';

const title = 'TruthLens: AI Fact-Checking & Evidence Research';
const description = 'Verify claims autonomously using AI and live research across multiple trusted web sources.';

export const metadata: Metadata = {
  metadataBase: new URL('https://truthlens-zeta-lemon.vercel.app'),
  title,
  description,
  // Link previews on LinkedIn, Slack, X and others
  openGraph: {
    title,
    description,
    url: '/',
    siteName: 'TruthLens',
    images: [{ url: '/og.png', width: 1200, height: 630, alt: 'TruthLens fact-checking dashboard' }],
    type: 'website',
  },
  twitter: { card: 'summary_large_image', title, description, images: ['/og.png'] },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased min-h-screen bg-gray-50 text-gray-900 dark:bg-gray-950 dark:text-gray-100 transition-colors duration-200">
        <AppProvider>
          <Navigation />
          <main id="main-content">
            {children}
          </main>
        </AppProvider>
      </body>
    </html>
  );
}
