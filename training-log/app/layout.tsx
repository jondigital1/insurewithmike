import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Training Log',
  description: 'Log every set, see the last session, know what to do next.',
}

export const viewport: Viewport = {
  themeColor: '#0c0e12',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-ink text-bright antialiased">{children}</body>
    </html>
  )
}
