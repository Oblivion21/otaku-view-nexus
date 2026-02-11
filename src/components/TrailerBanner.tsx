interface TrailerBannerProps {
  youtubeId: string;
  posterUrl: string;
  height?: string;
}

export function TrailerBanner({ youtubeId, posterUrl, height = '400px' }: TrailerBannerProps) {
  return (
    <div className="relative overflow-hidden" style={{ height }}>
      {/* Poster image */}
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: `url(${posterUrl})` }}
      />

      {/* Fade overlay for design effect */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/20 to-transparent pointer-events-none z-10" />

      {/* Dark gradient overlay for text readability */}
      <div className="absolute inset-0 bg-gradient-to-t from-background via-background/70 to-background/30 pointer-events-none z-10" />
    </div>
  );
}
