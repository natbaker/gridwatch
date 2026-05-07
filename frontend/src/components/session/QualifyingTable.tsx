import type { QualifyingEntry } from '../../types'

export function QualifyingTable({ qualifying, onSelectDriver, selectedA, selectedB }: {
  qualifying: QualifyingEntry[]
  onSelectDriver?: (abbreviation: string) => void
  selectedA?: string | null
  selectedB?: string | null
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[10px] text-text-tertiary tracking-wider border-b border-border">
            <th className="text-left py-2 px-2 w-10">POS</th>
            <th className="text-left py-2 px-2">DRIVER</th>
            <th className="text-left py-2 px-2 hidden sm:table-cell">TEAM</th>
            <th className="text-right py-2 px-2">Q1</th>
            <th className="text-right py-2 px-2">Q2</th>
            <th className="text-right py-2 px-2">Q3</th>
          </tr>
        </thead>
        <tbody>
          {qualifying.map((q) => {
            const eliminated = !q.q3 ? (!q.q2 ? 'q1' : 'q2') : null
            const isSelA = q.abbreviation === selectedA
            const isSelB = q.abbreviation === selectedB
            return (
              <tr
                key={q.position}
                onClick={() => onSelectDriver?.(q.abbreviation)}
                className={`border-b border-border/50 transition-colors ${onSelectDriver ? 'cursor-pointer' : ''} ${isSelA || isSelB ? 'bg-bg-elevated' : 'hover:bg-bg-elevated/50'}`}
              >
                <td className="py-2.5 px-2 font-mono text-text-secondary">{q.position}</td>
                <td className="py-2.5 px-2">
                  <div className="flex items-center gap-2">
                    <div className="w-1 h-6 rounded-full flex-shrink-0" style={{ backgroundColor: q.team_color }} />
                    <span className="font-medium">{q.driver}</span>
                    {isSelA && <span className="text-[8px] font-mono bg-accent/20 text-accent px-1 py-0.5 rounded ml-1">A</span>}
                    {isSelB && <span className="text-[8px] font-mono bg-white/10 text-white px-1 py-0.5 rounded ml-1">B</span>}
                  </div>
                </td>
                <td className="py-2.5 px-2 text-text-secondary text-xs hidden sm:table-cell">{q.team}</td>
                <td className={`py-2.5 px-2 text-right font-mono text-xs ${eliminated === 'q1' ? 'text-red-400' : 'text-text-secondary'}`}>{q.q1 || '—'}</td>
                <td className={`py-2.5 px-2 text-right font-mono text-xs ${eliminated === 'q2' ? 'text-red-400' : 'text-text-secondary'}`}>{q.q2 || '—'}</td>
                <td className="py-2.5 px-2 text-right font-mono text-xs text-text-primary">{q.q3 || '—'}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
