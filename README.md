![music.cloud](https://img.shields.io/badge/music.cloud-MVP-blue?style=flat-square)
[![GitHub License](https://img.shields.io/github/license/phranck/music.cloud?style=flat-square)](LICENSE)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-green?style=flat-square)](https://nodejs.org)
[![Test Coverage](https://img.shields.io/badge/tests-112%2F112-brightgreen?style=flat-square)](#testing)
[![WCAG Accessibility](https://img.shields.io/badge/accessibility-WCAG%20AA-blue?style=flat-square)](#accessibility)
[![Code Style](https://img.shields.io/badge/code%20style-TypeScript-blue?style=flat-square)](#code-quality)
[![Astro](https://img.shields.io/badge/astro-5.3.0-purple?style=flat-square)](https://astro.build)
[![React](https://img.shields.io/badge/react-19.0.0-61dafb?style=flat-square)](https://react.dev)

# 🎵 music.cloud

**Share music across every platform with one universal link.**

Paste a Spotify, Apple Music, or YouTube link and get a short shareable URL that resolves to the correct platform for each recipient.

---

## ✨ Features

### 🔗 Universal Music Linking
- **Cross-Platform Resolution**: ISRC-based music matching across Spotify, Apple Music, YouTube, and SoundCloud
- **URL Input**: Paste any service link and get a universal share URL
- **Text Search**: Search by song title and artist with disambiguation for accurate matching
- **Fallback Resolution**: Odesli integration for additional platform support

### 🎨 User Experience
- **Responsive Design**: Optimized for desktop, tablet, and mobile
- **Instant Feedback**: Real-time search results with visual disambiguation
- **Social Sharing**: OpenGraph meta tags with album art for link previews
- **Minimal UI**: Fast, distraction-free interface

### 🔒 Performance & Reliability
- **Rate Limiting**: Per-IP request throttling to prevent abuse
- **Error Handling**: 13+ specific error codes with user-friendly messages
- **Full-Text Search**: FTS5 database queries for instant track discovery
- **SSR Optimized**: Server-side rendering for fast initial loads

### ♿ Accessibility
- **WCAG AA Compliant**: Full keyboard navigation support
- **Screen Reader Ready**: Semantic HTML with ARIA labels
- **Reduced Motion**: `prefers-reduced-motion` media query support
- **Escape Key**: Clear UX with keyboard shortcuts

---

## 🚀 Quick Start

### Prerequisites
- **Node.js** ≥ 18.0.0
- **npm** ≥ 9.0.0

### Installation

```bash
# Clone the repository
git clone git@github.com:phranck/music.cloud.git
cd music.cloud

# Install dependencies
npm install

# Configure environment variables
cp .env.example .env.local

# Add API credentials (from step below)
# Then run database migrations
npm run db:generate
npm run db:migrate

# Start development server
npm run dev
```

Open [http://localhost:4321](http://localhost:4321) in your browser.

### API Credentials Required

Before running locally, obtain credentials from:

1. **Spotify** → [developer.spotify.com](https://developer.spotify.com)
   - `SPOTIFY_CLIENT_ID`
   - `SPOTIFY_CLIENT_SECRET`

2. **Apple Music** → [Apple Developer](https://developer.apple.com)
   - `APPLE_MUSIC_KEY_ID`
   - `APPLE_MUSIC_TEAM_ID`
   - `APPLE_MUSIC_PRIVATE_KEY`

3. **YouTube** → [Google Cloud Console](https://console.cloud.google.com)
   - `YOUTUBE_API_KEY`

4. **Odesli** (Optional) → [odesli.co](https://odesli.co)
   - `ODESLI_API_KEY` (for higher rate limits)

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────┐
│         Frontend (React + Astro)        │
│  - Landing Page                         │
│  - Results Display                      │
│  - Share Page (SSR)                     │
└─────────────────────────────────────────┘
           ↓
┌─────────────────────────────────────────┐
│      API Layer (Astro Endpoints)        │
│  - POST /api/resolve → Music resolver   │
│  - GET /[shortId] → SSR share page      │
│  - Rate limiting, error handling        │
└─────────────────────────────────────────┘
           ↓
┌─────────────────────────────────────────┐
│    Service Adapters & Fallback          │
│  - Spotify API client                   │
│  - Apple Music API client               │
│  - YouTube API client                   │
│  - Odesli fallback resolver             │
└─────────────────────────────────────────┘
           ↓
┌─────────────────────────────────────────┐
│      Database (SQLite + Drizzle)        │
│  - Track cache with ISRC                │
│  - Service links (7 platforms)          │
│  - Short URL mapping                    │
│  - FTS5 full-text search index          │
└─────────────────────────────────────────┘
```

### Key Technologies

- **Frontend**: React 19 + Astro 5 + Tailwind CSS 4
- **Backend**: Node.js (Astro SSR)
- **Database**: SQLite 3 + Drizzle ORM
- **Search**: FTS5 full-text search
- **Testing**: Vitest + Testing Library
- **Deployment**: Node.js adapter (Vercel, Railway, Fly.io compatible)

---

## 📦 Project Structure

```
src/
├── components/          # React UI components (12+)
│   ├── LandingPage.tsx
│   ├── ResultsPanel.tsx
│   ├── PlatformButton.tsx
│   └── ...
├── pages/              # Astro routes
│   ├── index.astro     # Landing page
│   ├── [shortId].astro # Share URL handler
│   └── api/            # API endpoints
├── services/           # Business logic
│   ├── resolver.ts     # Music resolution engine
│   ├── adapters/       # Platform API clients
│   └── types.ts
├── db/                 # Database
│   ├── schema.ts       # Drizzle schema
│   └── migrations/     # SQL migrations
├── lib/                # Utilities
│   ├── errors.ts       # Error handling
│   ├── og-helpers.ts   # OpenGraph meta tags
│   └── short-id.ts     # URL generation
└── styles/             # CSS
    ├── global.css      # Tailwind + custom
    └── animations.css  # Motion preferences
```

---

## 🧪 Testing

### Run All Tests
```bash
npm run test:run
```

### Watch Mode (Development)
```bash
npm run test
```

### Test Categories

| Category | Tests | Status |
|----------|-------|--------|
| Input Validation | 20 | ✅ Passing |
| Matching & Resolution | 16 | ✅ Passing |
| Error Handling | 9 | ✅ Passing |
| Error Messages | 13 | ✅ Passing |
| Accessibility | 14 | ✅ Passing |
| Mobile Responsive | 42 | ✅ Passing |
| **Total** | **112** | **✅ 100%** |

---

## 🚀 Deployment

### Environment Preparation

```bash
# Build for production
npm run build

# Preview production build locally
npm run preview
```

### Hosting Options

#### Vercel (Recommended)
```bash
npm i -g vercel
vercel deploy
```

#### Railway
```bash
# Connect via GitHub
# Add environment variables in Railway dashboard
# Auto-deploy on push
```

#### Fly.io
```bash
flyctl launch
flyctl deploy
```

### Required Environment Variables

```env
# Service Credentials
SPOTIFY_CLIENT_ID=your_id
SPOTIFY_CLIENT_SECRET=your_secret
APPLE_MUSIC_KEY_ID=your_key_id
APPLE_MUSIC_TEAM_ID=your_team_id
APPLE_MUSIC_PRIVATE_KEY=your_private_key
YOUTUBE_API_KEY=your_api_key

# Optional
ODESLI_API_KEY=your_odesli_key

# Database (optional, uses local SQLite by default)
DATABASE_PATH=./data/music.db
```

---

## ♿ Accessibility

This project maintains **WCAG AA compliance**:

- ✅ Keyboard navigation (Tab, Enter, Escape)
- ✅ Screen reader support (semantic HTML)
- ✅ Color contrast (4.5:1 ratio minimum)
- ✅ Reduced motion support (`prefers-reduced-motion`)
- ✅ Focus management
- ✅ ARIA labels on interactive elements

### Running Accessibility Tests
```bash
npm run test:run -- --grep "accessibility|a11y"
```

---

## 📊 Performance

### Page Load Metrics (Target)
- **First Contentful Paint (FCP)**: < 1s
- **Time to Interactive (TTI)**: < 2s
- **Largest Contentful Paint (LCP)**: < 2.5s
- **Cumulative Layout Shift (CLS)**: < 0.1

### Database Performance
- **Track Search**: FTS5 index (< 100ms for ~1M tracks)
- **Short URL Resolution**: Direct lookup (< 10ms)
- **Service Link Retrieval**: Indexed query (< 20ms)

---

## 🔄 Roadmap

### Phase 2 (Post-MVP)
- [ ] Custom OG image generation (album art + branding)
- [ ] Analytics dashboard (popular tracks, sharing patterns)
- [ ] User accounts (personalized share history)
- [ ] Advanced search filters (genre, year, artist)
- [ ] Direct artist/album linking (not just tracks)

### Phase 3 (Long-term)
- [ ] Mobile app (React Native)
- [ ] Playlist support
- [ ] Social features (user profiles, share comments)
- [ ] Integration with music forums/communities
- [ ] API for third-party developers

---

## 🤝 Contributing

Contributions welcome! Please:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development Guidelines

- **Code Style**: TypeScript, strict mode
- **Testing**: All features require tests (100% pass rate target)
- **Accessibility**: WCAG AA compliance required
- **Documentation**: Update README for user-facing changes

---

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 📧 Support

- **Issues**: [GitHub Issues](https://github.com/phranck/music.cloud/issues)
- **Discussions**: [GitHub Discussions](https://github.com/phranck/music.cloud/discussions)

---

## 🙏 Acknowledgments

- **Spotify** for music data and API
- **Apple Music** for cross-platform support
- **YouTube** for video track resolution
- **Odesli** for fallback resolution
- **Astro** and **React** communities for excellent frameworks

---

<div align="center">

**Made with ❤️ by [phranck](https://github.com/phranck)**

[⭐ Star on GitHub](https://github.com/phranck/music.cloud) • [🐛 Report Bug](https://github.com/phranck/music.cloud/issues) • [💡 Request Feature](https://github.com/phranck/music.cloud/issues)

</div>
