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
export interface AnimeEpisode {
  id: string
  mal_id: number
  episode_number: number
  video_url: string
  quality: string
  subtitle_language: string
  is_active: boolean
  created_at: string
  updated_at: string
}

// Fetch episode video URL from database
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
