import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

const gbp = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' })
export const formatGBP = (pence: number) => gbp.format(pence / 100)
