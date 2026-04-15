import { useNews } from '../../hooks/useNews'
import { relativeTime } from '../../utils/time'
import { LoadingSkeleton } from '../common/LoadingSkeleton'
import { ErrorState } from '../common/ErrorState'

export function NewsFeed() {
  const { data, isLoading, isError, refetch } = useNews()

  if (isLoading) return <LoadingSkeleton className="h-40" />
  if (isError) return <ErrorState message="Failed to load news" onRetry={refetch} />
  if (!data?.articles?.length) return null

  return (
    <div className="bg-bg-card border border-border rounded-xl p-5">
      <h3 className="text-xs text-text-secondary tracking-[2px] mb-4">F1 NEWS</h3>
      <div className="space-y-3 max-h-[240px] overflow-y-auto pr-2">
        {data.articles.map((article, i) => (
          <a
            key={i}
            href={article.url}
            target="_blank"
            rel="noopener noreferrer"
            className="block py-2 border-b border-border/50 last:border-0 hover:bg-bg-elevated/30 -mx-2 px-2 rounded transition-colors"
          >
            <h4 className="text-sm font-medium leading-snug mb-1">{article.title}</h4>
            <div className="flex items-center gap-2 text-[11px] text-text-tertiary">
              <span className="px-1.5 py-0.5 bg-bg-elevated rounded text-[10px]">{article.source}</span>
              {article.published_utc && <span>{relativeTime(article.published_utc)}</span>}
            </div>
          </a>
        ))}
      </div>
    </div>
  )
}
