import { useState, useEffect } from 'react'
import { Outlet, Link, useLocation } from 'react-router'
import { Menu, X } from 'lucide-react'
const APP_NAME = 'Haumea'
import { Wordmark } from '@haumea/ui'
import { appUrl } from '@/lib/app-url'

const NAV_LINKS = [
  { label: 'Features', path: '/features' },
  { label: 'Pricing', path: '/pricing' },
  { label: 'About', path: '/about' },
  { label: 'Contact', path: '/contact' },
]

function Navbar() {
  const [scrolled, setScrolled] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const location = useLocation()

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 bg-surface-sidebar/95 backdrop-blur-md ${
        scrolled
          ? 'shadow-lg shadow-black/20 border-b border-white/10'
          : 'border-b border-white/5'
      }`}
    >
      <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 lg:h-20">
          {/* Logo — Wordmark only, no badge. Same lockup as the dashboard sidebar. */}
          <Link to="/" className="flex items-center">
            <Wordmark size="md" className="text-white" />
          </Link>

          {/* Desktop nav */}
          <div className="hidden md:flex items-center gap-1">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.path}
                to={link.path}
                onClick={() => setMobileOpen(false)}
                className={`px-4 py-2 rounded-lg text-[14px] font-medium transition-colors ${
                  location.pathname === link.path
                    ? 'text-brand-400 bg-white/5'
                    : 'text-white/70 hover:text-white hover:bg-white/5'
                }`}
              >
                {link.label}
              </Link>
            ))}
          </div>

          {/* Desktop CTA — cross-origin into the dashboard app */}
          <div className="hidden md:flex items-center gap-3">
            <a
              href={appUrl('/login')}
              onClick={() => setMobileOpen(false)}
              className="px-4 py-2 rounded-lg text-[14px] font-medium text-white/70 hover:text-white hover:bg-white/5 transition-colors"
            >
              Sign In
            </a>
            <a
              href={appUrl('/register')}
              onClick={() => setMobileOpen(false)}
              className="px-5 py-2.5 rounded-lg text-[14px] font-semibold bg-brand-500 hover:bg-brand-600 text-white transition-colors shadow-lg shadow-brand-500/30"
            >
              Get Started Free
            </a>
          </div>

          {/* Mobile hamburger */}
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="md:hidden p-2 rounded-lg text-white/70 hover:bg-white/10 transition-colors"
            aria-label="Toggle menu"
          >
            {mobileOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </nav>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="md:hidden bg-surface-sidebar border-t border-white/10 shadow-xl">
          <div className="px-4 py-4 space-y-1">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.path}
                to={link.path}
                className={`block px-4 py-3 rounded-lg text-[15px] font-medium transition-colors ${
                  location.pathname === link.path
                    ? 'text-brand-400 bg-white/5'
                    : 'text-white/70 hover:bg-white/5'
                }`}
              >
                {link.label}
              </Link>
            ))}
            <div className="pt-3 border-t border-white/10 mt-3 space-y-2">
              <a
                href={appUrl('/login')}
                className="block px-4 py-3 rounded-lg text-[15px] font-medium text-white/70 hover:bg-white/5"
              >
                Sign In
              </a>
              <a
                href={appUrl('/register')}
                className="block px-4 py-3 rounded-lg text-[15px] font-semibold text-center bg-brand-500 hover:bg-brand-600 text-white"
              >
                Get Started Free
              </a>
            </div>
          </div>
        </div>
      )}
    </header>
  )
}

function Footer() {
  const currentYear = new Date().getFullYear()

  const footerSections = [
    {
      title: 'Product',
      links: [
        { label: 'Features', path: '/features' },
        { label: 'Pricing', path: '/pricing' },
        { label: 'Security', path: '/about' },
        { label: 'Integrations', path: '/features' },
      ],
    },
    {
      title: 'Company',
      links: [
        { label: 'About', path: '/about' },
        { label: 'Contact', path: '/contact' },
        { label: 'Careers', path: '/about' },
        { label: 'Blog', path: '/about' },
      ],
    },
    {
      title: 'Resources',
      links: [
        { label: 'Documentation', path: '/features' },
        { label: 'Help Center', path: '/contact' },
        { label: 'Status', path: '/about' },
        { label: 'API', path: '/features' },
      ],
    },
    {
      title: 'Legal',
      links: [
        { label: 'Privacy Policy', path: '/about' },
        { label: 'Terms of Service', path: '/about' },
        { label: 'Cookie Policy', path: '/about' },
        { label: 'GDPR', path: '/about' },
      ],
    },
  ]

  return (
    <footer className="bg-surface-sidebar text-white/70">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Main footer */}
        <div className="py-16 grid grid-cols-2 md:grid-cols-5 gap-8 lg:gap-12">
          {/* Brand column — Wordmark only, no badge */}
          <div className="col-span-2 md:col-span-1">
            <div className="flex items-center mb-4">
              <Wordmark size="md" className="text-white" />
            </div>
            <p className="text-[14px] leading-relaxed text-white/50 max-w-xs">
              The complete facilities management platform for compliance, maintenance, and operations.
            </p>
          </div>

          {/* Link columns */}
          {footerSections.map((section) => (
            <div key={section.title}>
              <h3 className="text-[13px] font-semibold text-white uppercase tracking-wider mb-4">
                {section.title}
              </h3>
              <ul className="space-y-3">
                {section.links.map((link) => (
                  <li key={link.label}>
                    <Link
                      to={link.path}
                      className="text-[14px] text-white/50 hover:text-white transition-colors"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom bar — social links omitted until real profiles exist (dead
            href="#" links read as broken on a trust-oriented B2B site). */}
        <div className="border-t border-white/10 py-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-[13px] text-white/40">
            &copy; {currentYear} {APP_NAME}. All rights reserved.
          </p>
          <a
            href="mailto:hello@haumea.com"
            className="text-[13px] text-white/40 hover:text-white/70 transition-colors"
          >
            hello@haumea.com
          </a>
        </div>
      </div>
    </footer>
  )
}

export default function MarketingLayout() {
  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1">
        <Outlet />
      </main>
      <Footer />
    </div>
  )
}
