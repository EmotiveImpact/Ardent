import type { PriceItem } from '@/data/model'
import { useQuery } from '@/data/ardent'

/*
 * The price list as the screens use it: Settings keeps it, a quote adds from it,
 * Crew counts what's on the vans from it.
 */

export const kindWord: Record<PriceItem['kind'], string> = { labour: 'Labour', material: 'Material', callout: 'Call-out', other: 'Other' }
export const unitWord: Record<PriceItem['unit'], string> = { each: 'each', hour: 'an hour', metre: 'a metre', job: 'a job' }
export const kinds: PriceItem['kind'][] = ['material', 'labour', 'callout', 'other']
export const units: PriceItem['unit'][] = ['each', 'hour', 'metre', 'job']

/** Every item on the list, archived ones too, A to Z. */
export function usePriceList() {
  return useQuery((c) => c.priceList.list({ archived: true }))
}

/** Items whose name, code or trade has what was typed, on the list for new work. */
export function matchItems(items: PriceItem[] | undefined, typed: string, limit = 6) {
  const t = typed.trim().toLowerCase()
  if (t.length < 2) return []
  return (items ?? []).filter((i) => !i.archived && `${i.name} ${i.code ?? ''} ${i.trade ?? ''}`.toLowerCase().includes(t)).slice(0, limit)
}

/** "12.50" -> 1250; anything that isn't money -> undefined. */
export function penceOf(typed: string) {
  const t = typed.trim().replace(/^£/, '')
  if (!/^\d+(\.\d{0,2})?$/.test(t)) return undefined
  return Math.round(Number(t) * 100)
}

/** 1250 -> "12.50", for a money box. */
export const poundsBox = (pence?: number) => (pence === undefined ? '' : (pence / 100).toFixed(2))

/** What the firm keeps of the price, as a whole percentage. Undefined without a cost or a price. */
export const marginOf = (i: Pick<PriceItem, 'price' | 'cost'>) => (i.cost === undefined || i.price <= 0 ? undefined : Math.round(((i.price - i.cost) / i.price) * 100))
