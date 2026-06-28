import type { Metadata } from 'next';
import './globals.css';
import { AppProvider } from '../store/appContext';
import Navigation from '../components/Navigation';

export const metadata: Metadata = {
  title: 'TruthLens — Smart Autonomous Fact-Checking & Evidence Research',
  description: 'Verify claims autonomously using AI and live research across multiple trusted web sources.',
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
