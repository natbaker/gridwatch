import { useQuery } from '@tanstack/react-query'
import { api } from '../../api/client'
import { LoadingSkeleton } from '../common/LoadingSkeleton'

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return ''
  const diff = Date.now() - new Date(dateStr).getTime()
  const hours = Math.floor(diff / (1000 * 60 * 60))
  if (hours < 1) return 'Just now'
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days === 1) return '1 day ago'
  return `${days} days ago`
}

export function VideoFeed() {
  const { data, isLoading } = useQuery({
    queryKey: ['videos'],
    queryFn: () => api.getVideos(),
    staleTime: 15 * 60 * 1000,
  })

  if (isLoading) return <LoadingSkeleton className="h-64" />
  if (!data?.videos?.length) return null

  return (
    <div className="bg-bg-card border border-border rounded-xl p-4 sm:p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xs text-text-secondary tracking-[2px]">LATEST VIDEOS</h2>
        <span className="text-[10px] text-text-tertiary">
          YouTube
        </span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {data.videos.map((video) => (
          <a
            key={video.video_id}
            href={video.url}
            target="_blank"
            rel="noopener noreferrer"
            className="group block"
          >
            <div className="relative aspect-video rounded-lg overflow-hidden mb-2 bg-bg-elevated">
              <img
                src={video.thumbnail}
                alt={video.title}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                loading="lazy"
              />
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                <div className="w-10 h-10 rounded-full bg-red-600/90 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <svg width="14" height="16" viewBox="0 0 14 16" fill="white">
                    <path d="M0 0 L14 8 L0 16 Z" />
                  </svg>
                </div>
              </div>
            </div>
            <h3 className="text-xs font-medium text-text-primary group-hover:text-accent transition-colors line-clamp-2 leading-relaxed">
              {video.title}
            </h3>
            <p className="text-[10px] text-text-tertiary mt-1">
              {video.channel} · {timeAgo(video.published_utc)}
            </p>
          </a>
        ))}
      </div>
    </div>
  )
}
