export type PersistedVideoSource = {
  url: string
  type: 'direct' | 'embed' | 'proxy'
  server_name: string
  quality: string
}

type ResolveCanonicalEpisodePageUrlParams = {
  remoteEpisodePageUrl?: string | null
  usedEpisodeUrl?: string | null
  existingEpisodePageUrl?: string | null
}

type BuildEpisodeCacheUpsertPayloadParams = {
  malId: number
  episodeNumber: number
  videoSources: PersistedVideoSource[]
  resolvedEpisodePageUrl?: string | null
  timestamp: string
}

type BuildEpisodeRefreshFailureUpdateParams = {
  hasExistingEpisode: boolean
  timestamp: string
}

function normalizeOptionalString(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

export function resolveCanonicalEpisodePageUrl({
  remoteEpisodePageUrl,
  usedEpisodeUrl,
  existingEpisodePageUrl,
}: ResolveCanonicalEpisodePageUrlParams): string | null {
  return (
    normalizeOptionalString(remoteEpisodePageUrl) ||
    normalizeOptionalString(usedEpisodeUrl) ||
    normalizeOptionalString(existingEpisodePageUrl)
  )
}

export function buildEpisodeCacheUpsertPayload({
  malId,
  episodeNumber,
  videoSources,
  resolvedEpisodePageUrl,
  timestamp,
}: BuildEpisodeCacheUpsertPayloadParams): Record<string, unknown> {
  const upsertPayload: Record<string, unknown> = {
    mal_id: malId,
    episode_number: episodeNumber,
    video_url: videoSources[0].url,
    video_sources: videoSources,
    quality: videoSources[0].quality,
    subtitle_language: 'ar',
    is_active: true,
    scraped_at: timestamp,
    updated_at: timestamp,
  }

  const normalizedEpisodePageUrl = normalizeOptionalString(resolvedEpisodePageUrl)
  if (normalizedEpisodePageUrl) {
    upsertPayload.episode_page_url = normalizedEpisodePageUrl
  }

  return upsertPayload
}

export function buildEpisodeRefreshFailureUpdate({
  hasExistingEpisode,
  timestamp,
}: BuildEpisodeRefreshFailureUpdateParams): Record<string, unknown> | null {
  if (!hasExistingEpisode) return null

  return {
    video_url: null,
    video_sources: null,
    scraped_at: null,
    updated_at: timestamp,
  }
}
