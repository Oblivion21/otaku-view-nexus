
# Auto-Playing Trailer Video in Anime Detail Banner

## Overview
Replace the static poster image in the banner section with an auto-playing, muted, looping YouTube trailer video. The video plays silently in the background with no user controls, restarting every 15 seconds. Falls back to the static poster image if no trailer is available.

## How It Works
- The Jikan API already provides `anime.trailer.youtube_id` for most anime entries
- We embed a YouTube iframe with `autoplay=1`, `mute=1`, `controls=0`, and use the YouTube IFrame API to loop playback every 15 seconds
- The iframe is styled to fill the banner area with `pointer-events: none` so users cannot interact with it
- A gradient overlay sits on top for readability, same as the current design
- The static poster image remains as a fallback when no trailer exists

## Changes

### `src/pages/AnimeDetail.tsx`
- Replace the banner `div` (lines 48-55) with a new component that:
  - If `anime.trailer.youtube_id` exists: renders a YouTube iframe embed with these parameters:
    - `autoplay=1` -- starts playing immediately
    - `mute=1` -- no sound
    - `controls=0` -- hides all player controls
    - `showinfo=0`, `modestbranding=1`, `rel=0` -- minimal YouTube branding
    - `loop=1`, `playlist={youtube_id}` -- enables native looping
    - `vq=hd1080` -- requests 1080p quality (falls back to 720p if unavailable)
    - `start=0`, `end=15` -- plays only the first 15 seconds
  - The iframe is wrapped in a container with `pointer-events-none` CSS to block all user interaction (no clicking, pausing, or controls)
  - The iframe is scaled up slightly (`scale-125`) to crop out any YouTube UI elements that might peek through
  - A `useEffect` with `setInterval` seeks the video back to 0 every 15 seconds using the YouTube IFrame API, ensuring the 15-second loop
  - If no `youtube_id`: falls back to the current static poster image
- Keep the existing gradient overlay on top of the video for text readability
- Add `useRef` and `useEffect` for managing the YouTube player instance and the 15-second loop timer

### Technical Details
- YouTube embed URL format: `https://www.youtube.com/embed/{id}?autoplay=1&mute=1&controls=0&showinfo=0&modestbranding=1&rel=0&loop=1&playlist={id}&vq=hd1080&start=0&end=15`
- `pointer-events: none` on the iframe container prevents any user interaction
- `overflow-hidden` on the banner container crops any overflow from the scaled iframe
- The `end=15` parameter combined with `loop=1&playlist={id}` makes YouTube restart from 0 after 15 seconds automatically -- no extra JS needed
- Cleanup: `useEffect` cleanup function clears any intervals on unmount
- The banner dimensions remain `h-[300px] md:h-[400px]` -- the iframe uses `object-fit: cover` equivalent sizing via absolute positioning
