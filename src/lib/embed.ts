// Turns a Spotify / YouTube share link into an embeddable player URL (both are free to embed).
export interface Embed { src: string; provider: "spotify" | "youtube"; height: number }

export function toEmbed(url?: string): Embed | null {
  const u = (url ?? "").trim();
  const sp = u.match(/^https?:\/\/open\.spotify\.com\/(?:intl-[a-z-]+\/)?(?:embed\/)?(playlist|album|track|episode|show|artist)\/([A-Za-z0-9]+)/i);
  if (sp) {
    const type = sp[1].toLowerCase();
    return { provider: "spotify", src: `https://open.spotify.com/embed/${type}/${sp[2]}?utm_source=generator&theme=0`, height: type === "track" || type === "episode" ? 152 : 352 };
  }
  const list = u.match(/^https?:\/\/(?:www\.|music\.)?youtube\.com\/.*[?&]list=([\w-]+)/i);
  if (list) return { provider: "youtube", src: `https://www.youtube-nocookie.com/embed/videoseries?list=${list[1]}`, height: 260 };
  const vid = u.match(/^https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?(?:.*&)?v=|youtu\.be\/)([\w-]{11})/i);
  if (vid) return { provider: "youtube", src: `https://www.youtube-nocookie.com/embed/${vid[1]}`, height: 260 };
  return null;
}
