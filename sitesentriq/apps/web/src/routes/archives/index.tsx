import { useState } from 'react'
import { Button, Chip, Tabs } from '@haumea/ui'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/use-auth'
import { formatDate } from '@haumea/utils'
import { Breadcrumbs } from '@/components/shared/breadcrumbs'
import { Briefcase, Building2, Users, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'
import { TableSkeleton } from '@/components/shared/skeletons'
import { PageHeader } from '@haumea/ui'

type TabKey = 'jobs' | 'properties' | 'clients'

const TABS: { key: TabKey; label: string; icon: typeof Briefcase }[] = [
  { key: 'jobs', label: 'Archived Jobs', icon: Briefcase },
  { key: 'properties', label: 'Archived Properties', icon: Building2 },
  { key: 'clients', label: 'Archived Clients', icon: Users },
]

function useArchivedJobs(orgId?: string) {
  return useQuery({
    queryKey: ['archived-jobs', orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('jobs')
        .select('id, title, status, archived_at, properties(name)')
        .not('archived_at', 'is', null)
        .order('archived_at', { ascending: false })
      if (error) throw error
      return data ?? []
    },
    enabled: !!orgId,
  })
}

function useArchivedProperties(orgId?: string) {
  return useQuery({
    queryKey: ['archived-properties', orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('properties')
        .select('id, name, address, archived_at, clients(name)')
        .not('archived_at', 'is', null)
        .order('archived_at', { ascending: false })
      if (error) throw error
      return data ?? []
    },
    enabled: !!orgId,
  })
}

function useArchivedClients(orgId?: string) {
  return useQuery({
    queryKey: ['archived-clients', orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clients')
        .select('id, name, contact_email, archived_at')
        .not('archived_at', 'is', null)
        .order('archived_at', { ascending: false })
      if (error) throw error
      return data ?? []
    },
    enabled: !!orgId,
  })
}

function useRestore(table: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from(table)
        .update({ archived_at: null })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`archived-${table}`] })
      queryClient.invalidateQueries({ queryKey: [table] })
      toast.success('Item restored successfully')
    },
    onError: () => {
      toast.error('Failed to restore item')
    },
  })
}

function EmptyState({ icon: Icon, label }: { icon: React.ElementType; label: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16">
      <div className="w-16 h-16 rounded-full bg-surface-elevated border border-border-subtle flex items-center justify-center mb-4">
        <Icon size={24} strokeWidth={1.5} className="text-text-muted" />
      </div>
      <h2 className="text-[15px] font-semibold text-text-primary mb-1">No archived items</h2>
      <p className="text-label text-text-muted">{label}</p>
    </div>
  )
}

export default function ArchivesPage() {
  const { organisation } = useAuth()
  const [tab, setTab] = useState<TabKey>('jobs')

  const { data: jobs, isLoading: jobsLoading } = useArchivedJobs(organisation?.id)
  const { data: properties, isLoading: propsLoading } = useArchivedProperties(organisation?.id)
  const { data: clients, isLoading: clientsLoading } = useArchivedClients(organisation?.id)

  const restoreJob = useRestore('jobs')
  const restoreProperty = useRestore('properties')
  const restoreClient = useRestore('clients')

  const counts: Record<TabKey, number> = {
    jobs: jobs?.length ?? 0,
    properties: properties?.length ?? 0,
    clients: clients?.length ?? 0,
  }

  return (
    <div className="space-y-6 max-w-[1200px]">
      <Breadcrumbs items={[
        { label: 'Dashboard', path: '/dashboard' },
        { label: 'Archives' },
      ]} />

      <div>
        <PageHeader title="Archives" subtitle="View and restore archived items" />
      </div>

      {/* Tab bar */}
      <Tabs
        selectedKey={tab}
        onSelectionChange={(key) => setTab(key as TabKey)}
        aria-label="Archived item type"
        className="w-fit"
      >
        <Tabs.ListContainer>
          <Tabs.List aria-label="Archived item type">
            {TABS.map((t) => (
              <Tabs.Tab key={t.key} id={t.key}>
                <span className="inline-flex items-center gap-1.5">
                  <t.icon size={14} />
                  {t.label}
                  {counts[t.key] > 0 && (
                    <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-micro font-medium bg-surface-page text-muted-foreground">
                      {counts[t.key]}
                    </span>
                  )}
                </span>
                <Tabs.Indicator />
              </Tabs.Tab>
            ))}
          </Tabs.List>
        </Tabs.ListContainer>
      </Tabs>

      {/* Jobs tab */}
      {tab === 'jobs' && (
        <>
          {jobsLoading ? (
            <TableSkeleton rows={5} cols={5} showHeader={false} showSearch={false} />
          ) : !jobs || jobs.length === 0 ? (
            <EmptyState icon={Briefcase} label="No archived jobs found" />
          ) : (
            <div className="bg-surface-card border border-border-default rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table aria-label="Archived jobs" className="w-full">
                    <thead><tr>
                      <th className="text-left py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">Title</th>
                      <th className="text-left py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">Property</th>
                      <th className="text-left py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">Status</th>
                      <th className="text-left py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">Archived</th>
                      <th className="text-right py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">Actions</th>
                    </tr></thead>
                    <tbody>
                      {jobs.map((job) => {
                        const propName = Array.isArray(job.properties)
                          ? job.properties[0]?.name
                          : (job.properties as { name: string } | null)?.name
                        return (
                          <tr key={job.id} id={job.id} className="border-b border-border-subtle hover:bg-surface-page transition-colors last:border-0">
                            <td className="py-3 px-4 text-label font-medium text-text-primary">{job.title}</td>
                            <td className="py-3 px-4 text-label text-text-secondary">{propName || '-'}</td>
                            <td className="py-3 px-4">
                              <Chip variant="soft" color="default" size="sm">
                                {job.status.replace(/_/g, ' ')}
                              </Chip>
                            </td>
                            <td className="py-3 px-4 text-label text-text-secondary">{job.archived_at ? formatDate(job.archived_at) : '-'}</td>
                            <td className="py-3 px-4 text-right">
                              <Button
                                variant="outline"
                                size="sm"
                                onPress={() => restoreJob.mutate(job.id)}
                                isDisabled={restoreJob.isPending}
                              >
                                <RotateCcw size={13} />
                                Restore
                              </Button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* Properties tab */}
      {tab === 'properties' && (
        <>
          {propsLoading ? (
            <TableSkeleton rows={5} cols={5} showHeader={false} showSearch={false} />
          ) : !properties || properties.length === 0 ? (
            <EmptyState icon={Building2} label="No archived properties found" />
          ) : (
            <div className="bg-surface-card border border-border-default rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table aria-label="Archived properties" className="w-full">
                    <thead><tr>
                      <th className="text-left py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">Name</th>
                      <th className="text-left py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">Address</th>
                      <th className="text-left py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">Client</th>
                      <th className="text-left py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">Archived</th>
                      <th className="text-right py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">Actions</th>
                    </tr></thead>
                    <tbody>
                      {properties.map((prop) => {
                        const clientName = Array.isArray(prop.clients)
                          ? prop.clients[0]?.name
                          : (prop.clients as { name: string } | null)?.name
                        return (
                          <tr key={prop.id} id={prop.id} className="border-b border-border-subtle hover:bg-surface-page transition-colors last:border-0">
                            <td className="py-3 px-4 text-label font-medium text-text-primary">{prop.name}</td>
                            <td className="py-3 px-4 text-label text-text-secondary">{prop.address || '-'}</td>
                            <td className="py-3 px-4 text-label text-text-secondary">{clientName || '-'}</td>
                            <td className="py-3 px-4 text-label text-text-secondary">{prop.archived_at ? formatDate(prop.archived_at) : '-'}</td>
                            <td className="py-3 px-4 text-right">
                              <Button
                                variant="outline"
                                size="sm"
                                onPress={() => restoreProperty.mutate(prop.id)}
                                isDisabled={restoreProperty.isPending}
                              >
                                <RotateCcw size={13} />
                                Restore
                              </Button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* Clients tab */}
      {tab === 'clients' && (
        <>
          {clientsLoading ? (
            <TableSkeleton rows={5} cols={5} showHeader={false} showSearch={false} />
          ) : !clients || clients.length === 0 ? (
            <EmptyState icon={Users} label="No archived clients found" />
          ) : (
            <div className="bg-surface-card border border-border-default rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table aria-label="Archived clients" className="w-full">
                    <thead><tr>
                      <th className="text-left py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">Name</th>
                      <th className="text-left py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">Email</th>
                      <th className="text-left py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">Archived</th>
                      <th className="text-right py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">Actions</th>
                    </tr></thead>
                    <tbody>
                      {clients.map((client) => (
                        <tr key={client.id} id={client.id} className="border-b border-border-subtle hover:bg-surface-page transition-colors last:border-0">
                          <td className="py-3 px-4 text-label font-medium text-text-primary">{client.name}</td>
                          <td className="py-3 px-4 text-label text-text-secondary">{client.contact_email || '-'}</td>
                          <td className="py-3 px-4 text-label text-text-secondary">{client.archived_at ? formatDate(client.archived_at) : '-'}</td>
                          <td className="py-3 px-4 text-right">
                            <Button
                              variant="outline"
                              size="sm"
                              onPress={() => restoreClient.mutate(client.id)}
                              isDisabled={restoreClient.isPending}
                            >
                              <RotateCcw size={13} />
                              Restore
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
