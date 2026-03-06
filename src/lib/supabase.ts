import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase credentials not configured. Episode playback will be limited.')
}

export const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null

// Database types
export type EpisodeCategory = 'black_org' | 'main_story' | 'featured' | 'regular' | null
export type EpisodeTag = 'filler' | 'manga' | 'special'

export interface VideoSource {
  server_name: string
  url: string
  quality: string
  type: 'embed' | 'direct' | 'proxy'
}

export interface AnimeEpisode {
  id: string
  mal_id: number
  episode_number: number
  video_url: string
  quality: string
  video_sources: VideoSource[] | null
  subtitle_language: string
  is_active: boolean
  category: EpisodeCategory
  tags: EpisodeTag[]
  created_at: string
  updated_at: string
}

// Resolve a proxy video source URL by calling the Supabase Edge Function
// The Edge Function fetches the anime3rb/witanime page server-side and extracts a fresh embed URL
export async function resolveProxyVideoUrl(sourcePageUrl: string): Promise<{ url: string; error?: string }> {
  if (!supabase) return { url: '', error: 'Supabase not configured' }

  try {
    const { data, error } = await supabase.functions.invoke('resolve-video', {
      body: { url: sourcePageUrl },
    })

    if (error) return { url: '', error: error.message }
    if (!data?.url) return { url: '', error: 'No video URL found on that page' }

    return { url: data.url }
  } catch (err: any) {
    return { url: '', error: err.message || 'Failed to resolve video URL' }
  }
}

// Fetch episode video URL from database (legacy - use getEpisodeData for multi-server)
export async function getEpisodeUrl(malId: number, episodeNumber: number): Promise<string | null> {
  if (!supabase) return null

  const { data, error } = await supabase
    .from('anime_episodes')
    .select('video_url')
    .eq('mal_id', malId)
    .eq('episode_number', episodeNumber)
    .eq('is_active', true)
    .single()

  if (error || !data) {
    console.log('Episode not found in database:', { malId, episodeNumber, error })
    return null
  }

  return data.video_url
}

// Fetch full episode data including video sources
export async function getEpisodeData(malId: number, episodeNumber: number): Promise<AnimeEpisode | null> {
  if (!supabase) return null

  const { data, error } = await supabase
    .from('anime_episodes')
    .select('*')
    .eq('mal_id', malId)
    .eq('episode_number', episodeNumber)
    .eq('is_active', true)
    .single()

  if (error || !data) {
    console.log('Episode not found in database:', { malId, episodeNumber, error })
    return null
  }

  return data
}

// Fetch all episodes for an anime
export async function getAnimeEpisodes(malId: number): Promise<AnimeEpisode[]> {
  if (!supabase) return []

  const { data, error } = await supabase
    .from('anime_episodes')
    .select('*')
    .eq('mal_id', malId)
    .eq('is_active', true)
    .order('episode_number', { ascending: true })

  if (error || !data) {
    console.log('Episodes not found in database:', { malId, error })
    return []
  }

  return data
}

// Scrape anime3rb for an episode video URL using Apify Cloudflare Bypasser
// This is called on-demand when a user opens an episode page that has no cached video data
export async function scrapeAnime3rbEpisode(
  animeTitle: string,
  animeTitleEnglish: string | null,
  episodeNumber: number,
  malId: number
): Promise<{ video_sources: VideoSource[] | null; cached: boolean; error?: string }> {
  if (!supabase) return { video_sources: null, cached: false, error: 'Supabase not configured' }

  try {
    const { data, error } = await supabase.functions.invoke('scrape-anime3rb', {
      body: { animeTitle, animeTitleEnglish, episodeNumber, malId },
    })

    if (error) return { video_sources: null, cached: false, error: error.message }
    if (data?.error) return { video_sources: null, cached: false, error: data.error }
    if (!data?.video_sources || data.video_sources.length === 0) {
      return { video_sources: null, cached: false, error: 'No video sources found' }
    }

    return {
      video_sources: data.video_sources,
      cached: data.cached || false,
    }
  } catch (err: any) {
    return { video_sources: null, cached: false, error: err.message || 'Failed to scrape episode' }
  }
}

// Site Settings Types
export interface SiteSetting {
  id: string
  key: string
  value: any
  description: string | null
  updated_at: string
}

// Fetch a specific site setting
export async function getSetting(key: string): Promise<any | null> {
  if (!supabase) return null

  const { data, error } = await supabase
    .from('site_settings')
    .select('value')
    .eq('key', key)
    .single()

  if (error || !data) {
    console.log('Setting not found:', { key, error })
    return null
  }

  return data.value
}

// Fetch all site settings
export async function getAllSettings(): Promise<Record<string, any>> {
  if (!supabase) return {}

  const { data, error } = await supabase
    .from('site_settings')
    .select('*')

  if (error || !data) {
    console.log('Failed to fetch settings:', error)
    return {}
  }

  // Convert array to key-value object
  const settings: Record<string, any> = {}
  data.forEach(setting => {
    settings[setting.key] = setting.value
  })

  return settings
}

// Get featured anime IDs
export async function getFeaturedAnimeIds(): Promise<number[]> {
  const ids = await getSetting('featured_anime_ids')
  return Array.isArray(ids) ? ids : []
}

// Get site announcement
export async function getSiteAnnouncement(): Promise<{ ar: string; en: string } | null> {
  const announcement = await getSetting('site_announcement')
  return announcement || null
}

// Check if maintenance mode is enabled
export async function isMaintenanceMode(): Promise<boolean> {
  const mode = await getSetting('maintenance_mode')
  return mode === true
}
