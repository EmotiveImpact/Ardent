import { Building2, HardHat, Package, ShieldCheck, Users, FileText, Wrench } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { ENTITY_LIST, SCHEMAS, type ImportEntity } from '@/lib/import/schemas'

const ICONS: Record<string, LucideIcon> = {
  Users,
  Building2,
  Package,
  HardHat,
  ShieldCheck,
  FileText,
  Wrench,
}

interface EntityPickerProps {
  onPick: (entity: ImportEntity) => void
  /** Lifetime imported counts per entity (entity → total). */
  lifetime?: Partial<Record<ImportEntity, number>>
}

export function EntityPicker({ onPick, lifetime = {} }: EntityPickerProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {ENTITY_LIST.map((entity) => {
        const schema = SCHEMAS[entity]
        const Icon = ICONS[schema.icon] ?? Package
        const total = lifetime[entity] ?? 0
        return (
          <button
            key={entity}
            type="button"
            onClick={() => onPick(entity)}
            className="text-left bg-surface-card border border-border-default rounded-xl p-5 hover:border-brand-500 hover:shadow-sm transition-all"
          >
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg bg-brand-500/10 flex items-center justify-center flex-shrink-0">
                <Icon size={20} className="text-brand-500" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-body font-semibold text-text-primary">{schema.label}</h3>
                <p className="text-caption text-text-muted mt-0.5">{schema.description}</p>
                <p className="text-micro text-text-muted mt-2">
                  {total > 0 ? `${total.toLocaleString()} imported lifetime` : 'No imports yet'}
                </p>
              </div>
            </div>
          </button>
        )
      })}
    </div>
  )
}
