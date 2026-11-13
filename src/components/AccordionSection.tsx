import type { ReactNode } from 'react'

interface AccordionSectionProps {
  id: string
  title: string
  open: boolean
  onToggle: (id: string) => void
  children: ReactNode
}

export function AccordionSection({ id, title, open, onToggle, children }: AccordionSectionProps) {
  return (
    <section className="shrink-0">
      <h2>
        <button
          type="button"
          id={`${id}-header`}
          className="flex w-full cursor-pointer items-center justify-between rounded-lg border border-border bg-bg-elevated px-3.5 py-2.5 text-left text-[13px] font-medium text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          aria-expanded={open}
          aria-controls={`${id}-content`}
          onClick={() => onToggle(id)}
        >
          {title}
          <span aria-hidden="true" className={`transition-transform ${open ? 'rotate-180' : ''}`}>⌄</span>
        </button>
      </h2>
      <div id={`${id}-content`} role="region" aria-labelledby={`${id}-header`} hidden={!open} className="mt-3.5">
        {children}
      </div>
    </section>
  )
}
