import { useState, type FormEvent } from 'react'
import { Button } from '@haumea/ui'
import { FormSelect } from '@haumea/ui'
import { ImagePlus } from 'lucide-react'
import { uploadFile } from '@/lib/storage'
import { STOCK_CATEGORIES, STOCK_UNITS, type StockCategory, type StockUnit, type StockItemDraft } from '@/lib/stock'

const inputClass =
  'w-full bg-surface-card border border-border-default rounded-lg text-label px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent/40'

export interface StockItemFormProps {
  initial?: Partial<StockItemDraft>
  organisationId: string
  submitting?: boolean
  onSubmit: (draft: StockItemDraft) => void | Promise<void>
  submitLabel?: string
}

export function StockItemForm({
  initial,
  organisationId,
  submitting,
  onSubmit,
  submitLabel = 'Save',
}: StockItemFormProps) {
  const [name, setName] = useState(initial?.name ?? '')
  const [sku, setSku] = useState(initial?.sku ?? '')
  const [category, setCategory] = useState<StockCategory>((initial?.category as StockCategory) ?? 'other')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [unit, setUnit] = useState<StockUnit>((initial?.unit as StockUnit) ?? 'each')
  const [unitCost, setUnitCost] = useState<number>(initial?.unit_cost ?? 0)
  const [supplierName, setSupplierName] = useState(initial?.supplier_name ?? '')
  const [supplierPart, setSupplierPart] = useState(initial?.supplier_part_number ?? '')
  const [reorderPoint, setReorderPoint] = useState<number>(initial?.reorder_point ?? 5)
  const [reorderQty, setReorderQty] = useState<number>(initial?.reorder_qty ?? 10)
  const [location, setLocation] = useState(initial?.location ?? '')
  const [notes, setNotes] = useState(initial?.notes ?? '')
  const [imageUrl, setImageUrl] = useState<string | null>(initial?.image_url ?? null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)

  const handleFile = async (file: File | null) => {
    if (!file) return
    setUploadError(null)
    if (file.size > 10 * 1024 * 1024) {
      setUploadError('Image must be smaller than 10MB.')
      return
    }
    try {
      setUploading(true)
      const ext = file.name.split('.').pop() || 'jpg'
      const path = `${organisationId}/${Date.now()}.${ext}`
      const url = await uploadFile('stock-images', path, file)
      setImageUrl(url)
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    void onSubmit({
      name: name.trim(),
      sku: sku.trim() || null,
      category,
      description: description.trim() || null,
      unit,
      unit_cost: Number(unitCost) || 0,
      supplier_name: supplierName.trim() || null,
      supplier_part_number: supplierPart.trim() || null,
      reorder_point: Math.max(0, Math.floor(reorderPoint)),
      reorder_qty: Math.max(0, Math.floor(reorderQty)),
      location: location.trim() || null,
      notes: notes.trim() || null,
      image_url: imageUrl,
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <label className="block md:col-span-2">
          <span className="block text-caption font-medium text-text-muted mb-1">Name *</span>
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputClass}
          />
        </label>

        <label className="block">
          <span className="block text-caption font-medium text-text-muted mb-1">SKU</span>
          <input
            type="text"
            value={sku ?? ''}
            onChange={(e) => setSku(e.target.value)}
            className={`${inputClass} font-mono`}
            placeholder="e.g. CU-EL-12"
          />
        </label>

        <label className="block">
          <span className="block text-caption font-medium text-text-muted mb-1">Category</span>
          <FormSelect<StockCategory>
            value={category}
            onChange={setCategory}
            ariaLabel="Category"
            options={Object.entries(STOCK_CATEGORIES).map(([k, label]) => ({ value: k as StockCategory, label }))}
          />
        </label>

        <label className="block md:col-span-2">
          <span className="block text-caption font-medium text-text-muted mb-1">Description</span>
          <textarea
            rows={2}
            value={description ?? ''}
            onChange={(e) => setDescription(e.target.value)}
            className={inputClass}
          />
        </label>

        <label className="block">
          <span className="block text-caption font-medium text-text-muted mb-1">Unit</span>
          <FormSelect<StockUnit>
            value={unit}
            onChange={setUnit}
            ariaLabel="Unit"
            options={Object.entries(STOCK_UNITS).map(([k, label]) => ({ value: k as StockUnit, label }))}
          />
        </label>

        <label className="block">
          <span className="block text-caption font-medium text-text-muted mb-1">Unit cost (£)</span>
          <input
            type="number"
            min={0}
            step="0.01"
            value={unitCost}
            onChange={(e) => setUnitCost(parseFloat(e.target.value) || 0)}
            className={inputClass}
          />
        </label>

        <label className="block">
          <span className="block text-caption font-medium text-text-muted mb-1">Supplier name</span>
          <input
            type="text"
            value={supplierName ?? ''}
            onChange={(e) => setSupplierName(e.target.value)}
            className={inputClass}
          />
        </label>

        <label className="block">
          <span className="block text-caption font-medium text-text-muted mb-1">Supplier part #</span>
          <input
            type="text"
            value={supplierPart ?? ''}
            onChange={(e) => setSupplierPart(e.target.value)}
            className={inputClass}
          />
        </label>

        <label className="block">
          <span className="block text-caption font-medium text-text-muted mb-1">Reorder point</span>
          <input
            type="number"
            min={0}
            step={1}
            value={reorderPoint}
            onChange={(e) => setReorderPoint(parseInt(e.target.value || '0', 10))}
            className={inputClass}
          />
        </label>

        <label className="block">
          <span className="block text-caption font-medium text-text-muted mb-1">Reorder qty</span>
          <input
            type="number"
            min={0}
            step={1}
            value={reorderQty}
            onChange={(e) => setReorderQty(parseInt(e.target.value || '0', 10))}
            className={inputClass}
          />
        </label>

        <label className="block md:col-span-2">
          <span className="block text-caption font-medium text-text-muted mb-1">Location</span>
          <input
            type="text"
            value={location ?? ''}
            onChange={(e) => setLocation(e.target.value)}
            className={inputClass}
            placeholder='e.g. "Main warehouse — Shelf B3"'
          />
        </label>

        <label className="block md:col-span-2">
          <span className="block text-caption font-medium text-text-muted mb-1">Notes</span>
          <textarea
            rows={3}
            value={notes ?? ''}
            onChange={(e) => setNotes(e.target.value)}
            className={inputClass}
          />
        </label>

        {/* Image upload */}
        <div className="md:col-span-2">
          <span className="block text-caption font-medium text-text-muted mb-1">Image</span>
          <div className="flex items-center gap-3">
            {imageUrl ? (
              <img
                src={imageUrl}
                alt=""
                className="h-16 w-16 rounded-lg object-cover border border-border-default"
              />
            ) : (
              <span className="grid h-16 w-16 place-items-center rounded-lg bg-brand-500/10 text-brand-500 border border-border-default">
                <ImagePlus size={20} />
              </span>
            )}
            <label className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-border-default text-caption text-text-secondary hover:bg-surface-page cursor-pointer">
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
                disabled={uploading}
              />
              {uploading ? 'Uploading…' : imageUrl ? 'Replace image' : 'Upload image'}
            </label>
            {imageUrl && (
              <button
                type="button"
                onClick={() => setImageUrl(null)}
                className="text-caption text-text-muted hover:text-status-overdue"
              >
                Remove
              </button>
            )}
          </div>
          {uploadError && <p className="text-caption text-status-overdue mt-1">{uploadError}</p>}
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <Button type="submit" variant="primary" size="sm" isDisabled={submitting || uploading}>
          {submitting ? 'Saving…' : submitLabel}
        </Button>
      </div>
    </form>
  )
}
