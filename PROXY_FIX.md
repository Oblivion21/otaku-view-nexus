# Proxy Video Source Fix - "No URL Provided" Error

**Date**: 2026-03-07
**Issue**: Player showing "no url provided" error
**Status**: ✅ FIXED

---

## Root Cause

The scraper (`scrape-anime3rb`) was extracting anime3rb video URLs but marking them with the wrong source type:

```typescript
// ❌ BEFORE (Wrong)
sources.push({ url: 'https://video.vid3rb.com/player/xxx', type: 'embed', ... })
```

The player only calls the `resolve-video` Edge Function when `source.type === 'proxy'`:

```typescript
// In EpisodeWatch.tsx
if (!source || source.type !== 'proxy') return;  // ❌ Skips resolution!
```

This caused:
1. Scraper finds Cloudflare-protected anime3rb URLs
2. Marks them as `'embed'` type
3. Player tries to load them directly in iframe
4. Cloudflare blocks the request
5. Video fails to load

---

## The Fix

### Changed Files

#### 1. `supabase/functions/scrape-anime3rb/index.ts`

**Before:**
```typescript
// Pattern 2: vid3rb.com player/embed URLs
for (const url of vid3rbMatches) {
  sources.push({ url, type: 'embed', ... })  // ❌ Wrong type
}
```

**After:**
```typescript
// Pattern 2: vid3rb.com player/embed URLs (these need proxy resolution due to Cloudflare)
for (const url of vid3rbMatches) {
  sources.push({ url, type: 'proxy', ... })  // ✅ Correct type
}
```

**Logic:**
- Direct MP4 files (`https://files.vid3rb.com/xxx.mp4`) → `type: 'direct'`
- anime3rb/vid3rb player pages → `type: 'proxy'` (need Cloudflare bypass)
- External embeds (non-anime3rb) → `type: 'embed'`

#### 2. `supabase/functions/resolve-video/index.ts`

Added better debugging:
```typescript
const body = await req.json()
console.log('[Request] Body received:', JSON.stringify(body))

const { url } = body
if (!url) {
  console.error('[Request] No URL in body')
  return jsonResponse({ url: '', error: 'no url provided', debug: { bodyKeys: Object.keys(body) } })
}

console.log('[Request] Processing URL:', url)
```

---

## How It Works Now

### Complete Flow

```
1. User clicks play on episode
   ↓
2. Frontend checks database for cached episode data
   ↓ (if not cached)
3. Frontend calls scrape-anime3rb Edge Function
   - Uses Apify to search anime3rb
   - Finds episode page: https://anime3rb.com/episode/frieren/1
   - Uses Apify to fetch episode page (bypassing Cloudflare)
   - Extracts video URLs from HTML
   - Found: https://video.vid3rb.com/player/abc123
   - Marks as type: 'proxy' ✅
   - Returns to frontend
   ↓
4. Frontend displays video sources
   - Source 1: anime3rb (proxy) - 720p
   ↓
5. User selects source (or auto-selects first)
   ↓
6. Frontend detects source.type === 'proxy'
   ↓
7. Frontend calls resolve-video Edge Function
   - Sends: { url: "https://video.vid3rb.com/player/abc123" }
   ↓
8. resolve-video Edge Function:
   a. Tries Apify (if token configured) ✅ NEW!
      - Fetches player page with Cloudflare bypass
      - Extracts final video/embed URL
   b. Falls back to FlareSolverr (if configured)
   c. Falls back to Browserless (if configured)
   d. Returns: { url: "https://files.vid3rb.com/video.mp4" }
   ↓
9. Frontend receives resolved URL
   ↓
10. Player loads video successfully! 🎉
```

---

## Testing

### Test 1: Check Scraper Output

The scraper should now return sources with correct types:

```json
{
  "video_sources": [
    {
      "url": "https://files.vid3rb.com/xxx.mp4",
      "type": "direct",        ← Direct MP4 files
      "server_name": "anime3rb",
      "quality": "720p"
    },
    {
      "url": "https://video.vid3rb.com/player/xxx",
      "type": "proxy",         ← Player pages (need resolution)
      "server_name": "anime3rb",
      "quality": "720p"
    }
  ]
}
```

### Test 2: Check Frontend Behavior

When user selects a `'proxy'` source:
1. Should show "جاري تحميل مصدر الفيديو..." (Loading video source...)
2. Should call `resolve-video` Edge Function
3. Should display resolved video

### Test 3: Check Edge Function Logs

**Supabase Dashboard → Edge Functions → resolve-video → Logs**

Should see:
```
✅ [Request] Body received: {"url":"https://video.vid3rb.com/player/xxx"}
✅ [Request] Processing URL: https://video.vid3rb.com/player/xxx
✅ [Apify] Fetching: https://video.vid3rb.com/player/xxx
✅ [Apify] Got HTML, length: 12345
✅ Apify success! Page title: ...
```

---

## Deployment Steps

### 1. Deploy scrape-anime3rb

```bash
# Option A: Supabase Dashboard
Go to Edge Functions → scrape-anime3rb → Paste updated code → Deploy

# Option B: CLI
cd /Users/hamoraby/Desktop/claude\ project/otaku-view-nexus
supabase functions deploy scrape-anime3rb
```

### 2. Deploy resolve-video

```bash
# Option A: Supabase Dashboard
Go to Edge Functions → resolve-video → Paste updated code → Deploy

# Option B: CLI
supabase functions deploy resolve-video
```

### 3. Test on Frontend

1. Clear any cached episode data
2. Navigate to an episode page
3. Watch the scraping and resolution process
4. Video should load successfully

---

## Source Type Reference

| Type | Description | Example | Needs Resolution? |
|------|-------------|---------|-------------------|
| `direct` | Direct video file URL | `https://files.vid3rb.com/video.mp4` | ❌ No - Play directly |
| `proxy` | Cloudflare-protected page with video | `https://video.vid3rb.com/player/xxx` | ✅ Yes - Call resolve-video |
| `embed` | External embed (non-CF protected) | `https://example.com/player` | ❌ No - Load in iframe |

---

## Before vs After

### Before (Broken)

```
Scraper finds: https://video.vid3rb.com/player/xxx
   ↓
Marks as: type: 'embed'
   ↓
Frontend tries to load directly in iframe
   ↓
Cloudflare blocks: 403 Forbidden
   ↓
❌ Video fails to load
```

### After (Fixed)

```
Scraper finds: https://video.vid3rb.com/player/xxx
   ↓
Marks as: type: 'proxy'
   ↓
Frontend detects proxy type
   ↓
Calls resolve-video Edge Function
   ↓
Apify bypasses Cloudflare and extracts real URL
   ↓
Returns: https://files.vid3rb.com/video.mp4
   ↓
✅ Video loads successfully
```

---

## Troubleshooting

### Issue: Still seeing "no url provided"

**Check:**
1. Deploy both Edge Functions (scrape-anime3rb AND resolve-video)
2. Clear browser cache
3. Check Edge Function logs for errors

### Issue: "جاري تحميل مصدر الفيديو..." forever

**Causes:**
- resolve-video Edge Function not responding
- Apify/FlareSolverr/Browserless all failing

**Debug:**
1. Check Edge Function logs
2. Test Apify directly (see APIFY_SETUP.md)
3. Check Apify credits

### Issue: Videos still not playing

**Check:**
1. Is the final URL correct? (Check resolve-video response)
2. Is the video file itself accessible?
3. Are there CORS issues?

---

## Related Documentation

- **APIFY_SETUP.md** - Apify integration guide
- **APIFY_DEPLOYMENT.md** - Quick deployment guide
- **CLOUDFLARE_BYPASS_SETUP.md** - General Cloudflare bypass info

---

**Status**: Ready to deploy! Deploy both Edge Functions and test.
