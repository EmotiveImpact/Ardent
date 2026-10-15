import type { ReactNode } from 'react'

interface DashboardEmptyStateProps {
  icon: ReactNode
  title: string
  subtitle?: string
}

export function DashboardEmptyState({ icon, title, subtitle }: DashboardEmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-10 text-center">
      <div className="mb-3 grid h-12 w-12 place-items-center rounded-full bg-surface-elevated">
        {icon}
      </div>
      <p className="text-label font-medium text-text-primary">{title}</p>
      {subtitle ? <p className="mt-0.5 text-caption text-text-muted">{subtitle}</p> : null}
    </div>
  )
}
