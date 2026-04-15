import { QUICK_LINKS } from '../../utils/constants'

export function QuickLinks() {
  return (
    <div className="bg-bg-card border border-border rounded-xl p-5">
      <h3 className="text-xs text-text-secondary tracking-[2px] mb-4">QUICK LINKS</h3>
      <div className="grid grid-cols-2 gap-2">
        {QUICK_LINKS.map((link) => (
          <a
            key={link.label}
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-3 py-3 bg-bg-elevated rounded-lg hover:bg-border/50 transition-colors"
          >
            <span className="text-lg">{link.icon}</span>
            <span className="text-sm">{link.label}</span>
          </a>
        ))}
      </div>
    </div>
  )
}
