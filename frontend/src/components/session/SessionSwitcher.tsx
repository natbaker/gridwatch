interface SessionSwitcherProps {
  sessions: { session_key: number; session_name: string }[]
  activeSessionKey?: number
  activeSessionType: string
  onSelect: (sessionName: string) => void
}

export function SessionSwitcher({ sessions, activeSessionKey, activeSessionType, onSelect }: SessionSwitcherProps) {
  if (sessions.length <= 1) return null
  return (
    <div className="flex gap-1 flex-wrap">
      {sessions.map((s) => {
        const isActive = activeSessionKey ? s.session_key === activeSessionKey : s.session_name === activeSessionType
        return (
          <button
            key={s.session_key}
            onClick={() => onSelect(s.session_name)}
            aria-pressed={isActive}
            className={`px-2.5 py-1 rounded text-[10px] font-mono transition-colors ${
              isActive
                ? 'bg-accent text-white'
                : 'bg-bg-elevated text-text-tertiary hover:text-text-primary hover:bg-bg-card border border-border'
            }`}
          >
            {s.session_name.toUpperCase()}
          </button>
        )
      })}
    </div>
  )
}
