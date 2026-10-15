import { Link } from 'react-router'
import { ShieldX } from 'lucide-react'

export function AccessDenied() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-4 text-center">
      <div className="w-16 h-16 rounded-2xl bg-surface-elevated border border-border-subtle flex items-center justify-center mb-5">
        <ShieldX size={32} className="text-status-overdue" />
      </div>
      <h1 className="text-2xl font-semibold text-text-primary mb-2">
        Access Denied
      </h1>
      <p className="text-text-muted max-w-md mb-6">
        You do not have permission to view this page. Contact your administrator
        if you believe this is an error.
      </p>
      <Link
        to="/dashboard"
        className="inline-flex items-center justify-center bg-foreground text-background hover:bg-foreground/90 h-10 px-6 rounded-lg text-sm font-medium transition-colors"
      >
        Back to Dashboard
      </Link>
    </div>
  )
}
