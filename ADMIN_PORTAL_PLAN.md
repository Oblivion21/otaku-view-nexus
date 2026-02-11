# Admin Portal Implementation Plan
## Otaku View Nexus - Admin Dashboard

---

## 🎯 Project Overview

**Goal:** Create an admin portal to manage anime episode links and site settings for the main Otaku View Nexus site.

**Solution:** Supabase + React Admin Portal

**Cost:** **FREE** (using Supabase free tier)

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Main Site (React)                     │
│              otaku-view-nexus (existing)                 │
│  - Browse anime                                          │
│  - Watch episodes (from database URLs)                   │
│  - View trailers                                         │
└────────────────┬────────────────────────────────────────┘
                 │
                 │ Supabase Client (read-only)
                 │
┌────────────────▼────────────────────────────────────────┐
│                  Supabase Backend                        │
│  ┌──────────────────────────────────────────────────┐   │
│  │         PostgreSQL Database                      │   │
│  │  - episodes (mal_id, episode_num, video_url)    │   │
│  │  - site_settings (key, value)                   │   │
│  │  - admin_users (email, password_hash)           │   │
│  └──────────────────────────────────────────────────┘   │
│                                                          │
│  - Auto-generated REST API                               │
│  - Authentication (email/password)                       │
│  - Row Level Security                                    │
└────────────────▲────────────────────────────────────────┘
                 │
                 │ Supabase Client (admin access)
                 │
┌────────────────┴────────────────────────────────────────┐
│              Admin Portal (React)                        │
│           otaku-admin-portal (new)                       │
│  - Login page                                            │
│  - Episode manager (CRUD operations)                     │
│  - Site settings editor                                  │
│  - Dashboard with stats                                  │
└─────────────────────────────────────────────────────────┘
```

---

## 💾 Database Schema

### Table 1: `anime_episodes`
```sql
CREATE TABLE anime_episodes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  mal_id INTEGER NOT NULL,  -- MyAnimeList anime ID
  episode_number INTEGER NOT NULL,
  video_url TEXT NOT NULL,  -- External URL (Gogoanime, etc.)
  quality TEXT DEFAULT '1080p',  -- Video quality
  subtitle_language TEXT DEFAULT 'arabic',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraints
  UNIQUE(mal_id, episode_number)
);

-- Index for fast lookups
CREATE INDEX idx_anime_episodes_mal_id ON anime_episodes(mal_id);
```

### Table 2: `site_settings`
```sql
CREATE TABLE site_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  key TEXT UNIQUE NOT NULL,  -- e.g., 'featured_anime_ids', 'site_banner_url'
  value JSONB NOT NULL,  -- Flexible JSON storage
  description TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Example settings:
-- { key: 'featured_anime_ids', value: [38000, 40748, 16498] }
-- { key: 'site_announcement', value: { ar: 'إعلان الموقع', en: 'Site announcement' } }
-- { key: 'maintenance_mode', value: false }
```

### Table 3: `admin_logs`
```sql
CREATE TABLE admin_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  admin_email TEXT NOT NULL,
  action TEXT NOT NULL,  -- 'create_episode', 'update_setting', etc.
  table_name TEXT,
  record_id UUID,
  changes JSONB,  -- Before/after values
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 🔐 Authentication & Security

### Admin Authentication
- Use Supabase Auth with email/password
- Create admin accounts via Supabase dashboard
- No public registration - admins added manually

### Row Level Security (RLS)
```sql
-- Enable RLS on all tables
ALTER TABLE anime_episodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_settings ENABLE ROW LEVEL SECURITY;

-- Public can read episodes (for main site)
CREATE POLICY "Public can read active episodes"
ON anime_episodes FOR SELECT
USING (is_active = true);

-- Only authenticated users can modify (admins only)
CREATE POLICY "Admins can do everything"
ON anime_episodes FOR ALL
USING (auth.role() = 'authenticated');

-- Site settings: public read, admin write
CREATE POLICY "Public can read settings"
ON site_settings FOR SELECT
USING (true);

CREATE POLICY "Admins can modify settings"
ON site_settings FOR ALL
USING (auth.role() = 'authenticated');
```

---

## 🛠️ Tech Stack

### Admin Portal (New Project)
- **Framework:** React + TypeScript + Vite (same as main site)
- **UI Library:** shadcn/ui (same as main site for consistency)
- **State Management:** React Query (same as main site)
- **Routing:** React Router
- **Database Client:** @supabase/supabase-js
- **Forms:** React Hook Form + Zod validation
- **Tables:** TanStack Table (for episode list)

### Main Site Integration
- **Add:** @supabase/supabase-js (to fetch episodes)
- **Replace:** Hardcoded episode data with real database queries

---

## 📁 Project Structure

```
otaku-admin-portal/  (NEW PROJECT)
├── src/
│   ├── components/
│   │   ├── ui/  (shadcn components)
│   │   ├── Layout.tsx
│   │   ├── EpisodeTable.tsx
│   │   ├── EpisodeForm.tsx
│   │   ├── SettingsEditor.tsx
│   │   └── LoginForm.tsx
│   ├── pages/
│   │   ├── Login.tsx
│   │   ├── Dashboard.tsx
│   │   ├── Episodes.tsx
│   │   └── Settings.tsx
│   ├── lib/
│   │   ├── supabase.ts  (Supabase client)
│   │   └── auth.tsx  (Auth context/hooks)
│   ├── App.tsx
│   └── main.tsx
├── .env  (Supabase credentials)
└── package.json

otaku-view-nexus/  (EXISTING PROJECT - UPDATES)
├── src/
│   ├── lib/
│   │   └── supabase.ts  (NEW - read-only client)
│   ├── hooks/
│   │   └── useEpisodes.ts  (NEW - fetch from database)
│   └── pages/
│       └── EpisodeWatch.tsx  (UPDATE - use real data)
```

---

## 💰 Cost Breakdown

### Supabase Free Tier (Perfect for this project)
- **Database:** 500 MB PostgreSQL storage (more than enough for URLs)
- **Bandwidth:** 2 GB per month
- **Users:** Unlimited authenticated users
- **API Requests:** Unlimited
- **Cost:** **$0/month** ✅

### When to upgrade? (Optional - only if needed)
- **Pro Plan ($25/month):** If you exceed 500MB database or 2GB bandwidth
- **Estimate:** You can store ~100,000 episode URLs in 500MB

---

## ⏱️ Implementation Timeline

### Phase 1: Setup (30 minutes)
1. Create Supabase project
2. Set up database tables
3. Configure RLS policies
4. Create first admin user

### Phase 2: Admin Portal (4-6 hours)
1. Initialize React project
2. Set up authentication
3. Build episode manager UI
4. Build settings editor
5. Add dashboard

### Phase 3: Main Site Integration (2-3 hours)
1. Add Supabase client to main site
2. Create hooks to fetch episodes
3. Update EpisodeWatch page
4. Test playback

### Phase 4: Testing & Polish (1-2 hours)
1. Test CRUD operations
2. Test main site integration
3. Add loading states
4. Handle errors

**Total Time:** 8-12 hours

---

## 🚀 Step-by-Step Implementation

### Step 1: Create Supabase Account
1. Go to https://supabase.com
2. Sign up (free)
3. Create new project:
   - Name: "otaku-nexus"
   - Database password: (save this!)
   - Region: Choose closest to you
   - Plan: Free tier

### Step 2: Set Up Database
1. Go to SQL Editor in Supabase dashboard
2. Run the SQL schema (from Database Schema section above)
3. Verify tables created

### Step 3: Create Admin User
1. Go to Authentication → Users
2. Click "Add user"
3. Email: your-email@example.com
4. Password: (strong password)
5. Auto-confirm user: Yes

### Step 4: Get API Credentials
1. Go to Project Settings → API
2. Copy:
   - `Project URL`
   - `anon public` key
   - `service_role` key (keep secret!)

### Step 5: Create Admin Portal Project
```bash
cd ~/Desktop
npm create vite@latest otaku-admin-portal -- --template react-ts
cd otaku-admin-portal
npm install
npm install @supabase/supabase-js
npm install react-router-dom @tanstack/react-query
npm install react-hook-form zod @hookform/resolvers
# ... shadcn setup
```

### Step 6: Configure Environment Variables
```bash
# Create .env file
echo "VITE_SUPABASE_URL=your-project-url" >> .env
echo "VITE_SUPABASE_ANON_KEY=your-anon-key" >> .env
```

### Step 7: Build Admin Portal
(I'll help you code this!)

### Step 8: Integrate with Main Site
(I'll help you add Supabase to the main site!)

---

## 🎨 Admin Portal Features

### 1. Dashboard Page
- Total anime with episodes
- Total episodes added
- Recent additions
- Quick stats

### 2. Episode Manager
- **List View:** Table showing all episodes
  - Columns: Anime (MAL ID), Episode #, URL, Quality, Status
  - Search by MAL ID or episode number
  - Filter by anime
  - Bulk operations

- **Add Episode Form:**
  - MAL ID (number input)
  - Episode Number (number input)
  - Video URL (text input with validation)
  - Quality selector (1080p, 720p, 480p)
  - Subtitle language
  - Active/Inactive toggle

- **Edit Episode:**
  - Same form, pre-filled
  - Update button

- **Delete Episode:**
  - Confirmation dialog

### 3. Site Settings
- **Featured Anime:**
  - Add/remove MAL IDs
  - Drag to reorder

- **Site Announcement:**
  - Arabic text
  - English text
  - Enable/disable

- **Maintenance Mode:**
  - Toggle on/off

- **Banner Images:**
  - URL inputs

---

## 🔄 Main Site Integration

### Episode Playback Flow

**Before (current):**
```
User clicks episode → EpisodeWatch page → Shows "لا يوجد فيديو متاح"
```

**After (with admin portal):**
```
User clicks episode → EpisodeWatch page → Fetch from Supabase → Play video
```

### Code Changes Needed

1. **Add Supabase client**
2. **Create episode hooks**
3. **Update EpisodeWatch component**
4. **Update AnimeDetail to show available episodes**

---

## 🎯 Success Criteria

✅ Admin can log in securely
✅ Admin can add episode URLs
✅ Admin can edit/delete episodes
✅ Admin can manage site settings
✅ Main site fetches episodes from database
✅ Videos play correctly on main site
✅ System is fast and responsive
✅ Everything works on free tier

---

## 🚦 Ready to Start?

I'm ready to help you implement this! We can proceed step-by-step.

**Would you like me to:**
1. Start by setting up the Supabase database schema?
2. Create the admin portal React project?
3. Both - guide you through the complete setup?

Let me know and I'll begin the implementation! 🚀
