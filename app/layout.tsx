import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
  ),
  title: 'Salita — Learn Tagalog every day',
  description:
    'Daily Tagalog lessons in pronunciation, grammar, listening, reading, speaking, and real conversation.',
  icons: { icon: '/favicon.svg' },
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Salita',
  },
  openGraph: {
    title: 'salita. — Learn Tagalog every day',
    description: 'Tagalog, one real conversation at a time.',
    type: 'website',
    images: [
      {
        url: '/og.png',
        width: 1200,
        height: 630,
        alt: 'salita. — Tagalog, one real conversation at a time.',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'salita. — Learn Tagalog every day',
    description: 'Tagalog, one real conversation at a time.',
    images: ['/og.png'],
  },
};

export const viewport: Viewport = {
  themeColor: '#ff2773',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
