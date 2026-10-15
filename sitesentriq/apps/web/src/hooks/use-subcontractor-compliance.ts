// Hooks for the subcontractor compliance model (00116, trust wave W2-T5):
// insurance / accreditations / RAMS CRUD, the SQL status evaluator, and the
// org-wide expiry radar.

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/use-auth'
import { DEFAULT_REQUIREMENTS, type ComplianceRequirements } from '@/lib/subcontractor-compliance'
import type {
  SubcontractorAccreditation,
  SubcontractorComplianceStatus,
  SubcontractorInsurancePolicy,
  SubcontractorRams,
} from '@haumea/types'

const KEY = 'subcontractor-compliance'

function invalidateAll(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: [KEY] })
}

// ── Per-org requirement matrix (00116) ───────────────────────────────

/** The org's compliance requirement matrix; the SQL default when no row. */
export function useComplianceRequirements() {
  const { profile } = useAuth()
  return useQuery<ComplianceRequirements>({
    queryKey: [KEY, 'requirements', profile?.organisation_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('subcontractor_compliance_requirements')
        .select('required')
        .eq('organisation_id', profile!.organisation_id!)
        .maybeSingle()
      if (error) throw error
      return (data?.required ?? DEFAULT_REQUIREMENTS) as ComplianceRequirements
    },
    enabled: !!profile?.organisation_id,
  })
}

export function useSaveComplianceRequirements() {
  const qc = useQueryClient()
  const { profile } = useAuth()
  return useMutation({
    mutationFn: async (required: ComplianceRequirements) => {
      if (!profile?.organisation_id) throw new Error('No organisation')
      const { error } = await supabase.from('subcontractor_compliance_requirements').upsert(
        {
          organisation_id: profile.organisation_id,
          required,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'organisation_id' },
      )
      if (error) throw error
    },
    onSuccess: () => {
      // Changing requirements re-derives every subcontractor's verdict.
      invalidateAll(qc)
      toast.success('Compliance requirements saved')
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to save requirements'),
  })
}

// ── Reads ────────────────────────────────────────────────────────────

export function useSubcontractorInsurance(subcontractorId: string | undefined) {
  return useQuery<SubcontractorInsurancePolicy[]>({
    queryKey: [KEY, 'insurance', subcontractorId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('subcontractor_insurance_policies')
        .select('*')
        .eq('subcontractor_id', subcontractorId!)
        .order('expiry_date', { ascending: true })
      if (error) throw error
      return (data ?? []) as SubcontractorInsurancePolicy[]
    },
    enabled: !!subcontractorId,
  })
}

export function useSubcontractorAccreditations(subcontractorId: string | undefined) {
  return useQuery<SubcontractorAccreditation[]>({
    queryKey: [KEY, 'accreditations', subcontractorId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('subcontractor_accreditations')
        .select('*')
        .eq('subcontractor_id', subcontractorId!)
        .order('expiry_date', { ascending: true, nullsFirst: false })
      if (error) throw error
      return (data ?? []) as SubcontractorAccreditation[]
    },
    enabled: !!subcontractorId,
  })
}

export function useSubcontractorRamsList(subcontractorId: string | undefined) {
  return useQuery<RamsWithFile[]>({
    queryKey: [KEY, 'rams', subcontractorId],
    queryFn: async () => {
      // Join the document so staff can open the uploaded RAMS file (incl.
      // those uploaded via the no-login work link into the private bucket).
      const { data, error } = await supabase
        .from('subcontractor_rams')
        .select('*, subcontractor_documents(file_url)')
        .eq('subcontractor_id', subcontractorId!)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as RamsWithFile[]
    },
    enabled: !!subcontractorId,
  })
}

/** A RAMS row with the joined document file_url (for the View action). */
export type RamsWithFile = SubcontractorRams & {
  subcontractor_documents?: { file_url: string | null } | null
}

/** The SQL evaluator (00116) — the same logic the dispatch gate enforces. */
export function useSubcontractorComplianceStatus(subcontractorId: string | undefined) {
  return useQuery<SubcontractorComplianceStatus>({
    queryKey: [KEY, 'status', subcontractorId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('subcontractor_compliance_status', {
        p_subcontractor_id: subcontractorId!,
      })
      if (error) throw error
      return data as SubcontractorComplianceStatus
    },
    enabled: !!subcontractorId,
  })
}

/** Org-wide expiry radar: insurance + accreditations lapsed or expiring within
 *  `days`. Powers the subcontractors-index banner + the dashboard widget. */
export interface ExpiringComplianceItem {
  subcontractor_id: string
  company_name: string
  kind: 'insurance' | 'accreditation'
  label: string
  expiry_date: string
}

export function useExpiringSubcontractorCompliance(days = 30) {
  const { profile } = useAuth()
  return useQuery<ExpiringComplianceItem[]>({
    queryKey: [KEY, 'expiring', days],
    queryFn: async () => {
      const horizon = new Date()
      horizon.setDate(horizon.getDate() + days)
      const horizonKey = horizon.toLocaleDateString('en-CA') // YYYY-MM-DD, local
      const [ins, acc] = await Promise.all([
        supabase
          .from('subcontractor_insurance_policies')
          .select('subcontractor_id, policy_type, expiry_date, subcontractors(company_name)')
          .lte('expiry_date', horizonKey)
          .order('expiry_date', { ascending: true }),
        supabase
          .from('subcontractor_accreditations')
          .select('subcontractor_id, scheme, expiry_date, subcontractors(company_name)')
          .not('expiry_date', 'is', null)
          .lte('expiry_date', horizonKey)
          .order('expiry_date', { ascending: true }),
      ])
      if (ins.error) throw ins.error
      if (acc.error) throw acc.error
      type Joined = { subcontractors?: { company_name?: string } | null }
      const items: ExpiringComplianceItem[] = [
        ...(ins.data ?? []).map((r) => ({
          subcontractor_id: r.subcontractor_id as string,
          company_name: (r as Joined).subcontractors?.company_name ?? 'Subcontractor',
          kind: 'insurance' as const,
          label: String(r.policy_type).replace(/_/g, ' '),
          expiry_date: r.expiry_date as string,
        })),
        ...(acc.data ?? []).map((r) => ({
          subcontractor_id: r.subcontractor_id as string,
          company_name: (r as Joined).subcontractors?.company_name ?? 'Subcontractor',
          kind: 'accreditation' as const,
          label: String(r.scheme).toUpperCase(),
          expiry_date: r.expiry_date as string,
        })),
      ]
      return items.sort((a, b) => a.expiry_date.localeCompare(b.expiry_date))
    },
    enabled: !!profile?.organisation_id,
  })
}

// ── Mutations ────────────────────────────────────────────────────────

type InsuranceInput = Omit<SubcontractorInsurancePolicy, 'id' | 'created_at' | 'updated_at'>
type AccreditationInput = Omit<SubcontractorAccreditation, 'id' | 'created_at' | 'updated_at'>
type RamsInput = Omit<
  SubcontractorRams,
  'id' | 'created_at' | 'updated_at' | 'approval_status' | 'approved_by' | 'approved_at'
>

export function useAddSubcontractorInsurance() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: InsuranceInput) => {
      const { error } = await supabase.from('subcontractor_insurance_policies').insert(input)
      if (error) throw error
    },
    onSuccess: () => {
      invalidateAll(qc)
      toast.success('Insurance policy added')
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to add policy'),
  })
}

export function useDeleteSubcontractorInsurance() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('subcontractor_insurance_policies').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => invalidateAll(qc),
    onError: (err: Error) => toast.error(err.message || 'Failed to delete policy'),
  })
}

export function useAddSubcontractorAccreditation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: AccreditationInput) => {
      const { error } = await supabase.from('subcontractor_accreditations').insert(input)
      if (error) throw error
    },
    onSuccess: () => {
      invalidateAll(qc)
      toast.success('Accreditation added')
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to add accreditation'),
  })
}

export function useDeleteSubcontractorAccreditation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('subcontractor_accreditations').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => invalidateAll(qc),
    onError: (err: Error) => toast.error(err.message || 'Failed to delete accreditation'),
  })
}

export function useAddSubcontractorRams() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: RamsInput) => {
      const { error } = await supabase.from('subcontractor_rams').insert(input)
      if (error) throw error
    },
    onSuccess: () => {
      invalidateAll(qc)
      toast.success('RAMS added — awaiting approval')
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to add RAMS'),
  })
}

export function useDecideSubcontractorRams() {
  const qc = useQueryClient()
  const { profile } = useAuth()
  return useMutation({
    mutationFn: async ({ id, decision }: { id: string; decision: 'approved' | 'rejected' }) => {
      const { error } = await supabase
        .from('subcontractor_rams')
        .update({
          approval_status: decision,
          approved_by: profile?.id ?? null,
          approved_at: new Date().toISOString(),
        })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: (_d, vars) => {
      invalidateAll(qc)
      toast.success(vars.decision === 'approved' ? 'RAMS approved' : 'RAMS rejected')
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to record decision'),
  })
}

export function useDeleteSubcontractorRams() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('subcontractor_rams').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => invalidateAll(qc),
    onError: (err: Error) => toast.error(err.message || 'Failed to delete RAMS'),
  })
}
