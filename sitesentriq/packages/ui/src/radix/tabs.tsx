/**
 * Tabs replacement for @haumea/ui — HeroUI-compatible API over Radix Tabs.
 *  <Tabs selectedKey={k} onSelectionChange={setK}>
 *    <Tabs.ListContainer><Tabs.List>
 *      <Tabs.Tab id="all">All</Tabs.Tab> … <Tabs.Indicator/>
 *    </Tabs.List></Tabs.ListContainer>
 *    <Tabs.Panel id="all">…</Tabs.Panel>
 *  </Tabs>
 *
 * The active-tab underline is a framer `layoutId` element, so it SLIDES
 * between tabs instead of snapping. A TabsContext tracks the active value
 * (works for controlled `selectedKey` and uncontrolled `defaultSelectedKey`)
 * so each Tab knows whether to render the shared indicator.
 */
import { type ReactNode, createContext, useContext, useEffect, useState } from 'react'
import * as RTabs from '@radix-ui/react-tabs'
import { motion } from 'framer-motion'
import { cn } from './primitives'

interface TabsProps {
  selectedKey?: string
  defaultSelectedKey?: string
  onSelectionChange?: (key: string) => void
  variant?: string
  'aria-label'?: string
  className?: string
  children?: ReactNode
}
type TabsComp = React.FC<TabsProps> & {
  ListContainer: React.FC<{ className?: string; children?: ReactNode }>
  List: React.FC<{ className?: string; children?: ReactNode }>
  Tab: React.FC<{ id: string; className?: string; children?: ReactNode }>
  Indicator: React.FC
  Panel: React.FC<{ id: string; className?: string; children?: ReactNode }>
}

// Tracks the active tab value + a per-instance layoutId group so multiple
// Tabs on one page don't share (and fight over) a single sliding indicator.
const TabsContext = createContext<{ value?: string; group: string }>({ group: 'tabs' })
let tabsGroupSeq = 0

const TabsBase: React.FC<TabsProps> = ({
  selectedKey,
  defaultSelectedKey,
  onSelectionChange,
  className,
  children,
}) => {
  // Mirror Radix's value so children can read it without prop-drilling.
  const [value, setValue] = useState<string | undefined>(selectedKey ?? defaultSelectedKey)
  const [group] = useState(() => `tabs-${++tabsGroupSeq}`)

  // Keep in sync when the parent drives the value (controlled usage).
  useEffect(() => {
    if (selectedKey !== undefined) setValue(selectedKey)
  }, [selectedKey])

  const handleChange = (v: string) => {
    setValue(v)
    onSelectionChange?.(v)
  }

  return (
    <TabsContext.Provider value={{ value, group }}>
      <RTabs.Root
        value={selectedKey}
        defaultValue={defaultSelectedKey}
        onValueChange={handleChange}
        className={className}
      >
        {children}
      </RTabs.Root>
    </TabsContext.Provider>
  )
}
export const Tabs = TabsBase as TabsComp
Tabs.ListContainer = ({ className, children }) => <div className={cn('border-b border-border-subtle', className)}>{children}</div>
Tabs.List = ({ className, children }) => <RTabs.List className={cn('flex gap-1', className)}>{children}</RTabs.List>
Tabs.Tab = ({ id, className, children }) => {
  const { value, group } = useContext(TabsContext)
  const active = value === id
  return (
    <RTabs.Trigger
      value={id}
      className={cn(
        'relative -mb-px px-3 py-2 text-label font-medium text-text-muted transition-colors data-[state=active]:text-text-primary',
        className,
      )}
    >
      {children}
      {active && (
        <motion.span
          layoutId={group}
          className="absolute inset-x-0 bottom-0 h-0.5 bg-[var(--accent)]"
          transition={{ type: 'spring', stiffness: 450, damping: 38 }}
        />
      )}
    </RTabs.Trigger>
  )
}
Tabs.Indicator = () => null
Tabs.Panel = ({ id, className, children }) => <RTabs.Content value={id} className={cn('ui-anim-tab', className)}>{children}</RTabs.Content>
