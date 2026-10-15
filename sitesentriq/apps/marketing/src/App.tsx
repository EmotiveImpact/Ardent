import { lazy, Suspense } from 'react'
import { Routes, Route } from 'react-router'
import MarketingLayout from './layout'

const HomePage = lazy(() => import('./pages/home'))
const FeaturesPage = lazy(() => import('./pages/features'))
const PricingPage = lazy(() => import('./pages/pricing'))
const AboutPage = lazy(() => import('./pages/about'))
const ContactPage = lazy(() => import('./pages/contact'))

function Loading() {
  return (
    <div className="min-h-screen grid place-items-center">
      <div className="text-text-muted text-sm">Loading…</div>
    </div>
  )
}

export default function App() {
  return (
    <Suspense fallback={<Loading />}>
      <Routes>
        <Route path="/" element={<MarketingLayout />}>
          <Route index element={<HomePage />} />
          <Route path="features" element={<FeaturesPage />} />
          <Route path="pricing" element={<PricingPage />} />
          <Route path="about" element={<AboutPage />} />
          <Route path="contact" element={<ContactPage />} />
        </Route>
      </Routes>
    </Suspense>
  )
}
