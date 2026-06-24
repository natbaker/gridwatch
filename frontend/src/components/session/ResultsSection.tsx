import type { RaceResultEntry, QualifyingEntry } from '../../types'
import { RaceTable } from './RaceTable'
import { QualifyingTable } from './QualifyingTable'

interface ResultsSectionProps {
  resultsTab: 'race' | 'qualifying'
  onTabChange: (tab: 'race' | 'qualifying') => void
  hasQualifying: boolean
  results: RaceResultEntry[]
  qualifying: QualifyingEntry[]
  onSelectDriver: (abbr: string) => void
  selectedA: string | null
  selectedB: string | null
}

export function ResultsSection({
  resultsTab, onTabChange, hasQualifying, results, qualifying,
  onSelectDriver, selectedA, selectedB,
}: ResultsSectionProps) {
  const nothingSelected = !selectedA && !selectedB
  return (
    <>
      {hasQualifying && (
        <div className="flex gap-1 bg-bg-elevated rounded-lg p-1" role="tablist">
          <button
            role="tab"
            aria-selected={resultsTab === 'race'}
            onClick={() => onTabChange('race')}
            className={`flex-1 text-xs font-medium py-2 px-4 rounded-md transition-colors ${
              resultsTab === 'race' ? 'bg-bg-card text-text-primary shadow-sm' : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            RACE RESULT
          </button>
          <button
            role="tab"
            aria-selected={resultsTab === 'qualifying'}
            onClick={() => onTabChange('qualifying')}
            className={`flex-1 text-xs font-medium py-2 px-4 rounded-md transition-colors ${
              resultsTab === 'qualifying' ? 'bg-bg-card text-text-primary shadow-sm' : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            QUALIFYING
          </button>
        </div>
      )}

      <div className="bg-bg-card border border-border rounded-xl p-4 sm:p-5">
        {nothingSelected && (
          <p className="text-[10px] text-text-tertiary mb-3">
            Tip: click two drivers to compare their laps.
          </p>
        )}
        {resultsTab === 'race' ? (
          <RaceTable results={results} onSelectDriver={onSelectDriver} selectedA={selectedA} selectedB={selectedB} />
        ) : (
          <QualifyingTable qualifying={qualifying} onSelectDriver={onSelectDriver} selectedA={selectedA} selectedB={selectedB} />
        )}
      </div>
    </>
  )
}
