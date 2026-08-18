import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Training Log',
  description: 'Log every set, see the last session, know what to do next.',
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#0c0e12' },
    { media: '(prefers-color-scheme: light)', color: '#f1f2f5' },
  ],
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
}

// Applies a hand-picked theme before first paint. System preference needs no
// script at all: the stylesheet handles it.
const themeInit = `try{var t=localStorage.getItem('training-log-theme');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch(e){}`

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-ink text-bright antialiased">
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
        {children}
      </body>
    </html>
  )
}
