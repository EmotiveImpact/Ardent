import { Link } from 'react-router'
import { ChevronRight } from 'lucide-react'

interface BreadcrumbItem {
  label: string
  path?: string
}

export function Breadcrumbs({ items }: { items: BreadcrumbItem[] }) {
  return (
    <nav className="flex items-center gap-1.5 text-caption text-text-muted mb-4">
      {items.map((item, i) => (
        <span key={i} className="flex items-center gap-1.5">
          {i > 0 && <ChevronRight size={12} className="text-text-muted opacity-50" />}
          {item.path ? (
            <Link to={item.path} className="hover:text-text-primary transition-colors">
              {item.label}
            </Link>
          ) : (
            <span className="text-text-secondary font-medium">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  )
}
