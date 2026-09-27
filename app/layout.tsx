import type { Metadata, Viewport } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import './globals.css'
import PwaRegister from '@/components/PwaRegister'

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

export const metadata: Metadata = {
  title: 'VANISH',
  description: 'Talk freely. Stay private. Temporary usernames and vanishing messages.',
  applicationName: 'VANISH',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'VANISH',
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: '/logo.png',
    apple: '/logo.png',
  },
}

export const viewport: Viewport = {
  themeColor: '#000000',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-black text-white">
        <PwaRegister />
        {children}
      </body>
    </html>
  )
}