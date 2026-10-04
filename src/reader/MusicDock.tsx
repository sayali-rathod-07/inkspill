import { useState } from "react";
import { toEmbed } from "../lib/embed.ts";

/** A small floating player that keeps playing while you read or write. */
export function MusicDock({ url, title, onClose }: { url: string; title?: string; onClose: () => void }) {
  const [mini, setMini] = useState(false);
  const embed = toEmbed(url);
  if (!embed) return null;
  return (
    <div className={`music-dock ${mini ? "mini" : ""}`}>
      <div className="md-head">
        <span>♫ {title || (embed.provider === "spotify" ? "Spotify" : "YouTube")}</span>
        <button onClick={() => setMini((m) => !m)} title={mini ? "Show player" : "Shrink (music keeps playing)"}>{mini ? "▴" : "▾"}</button>
        <button onClick={onClose} title="Close player (stops music)">×</button>
      </div>
      {/* Kept mounted while minimised so the music doesn't stop. */}
      <iframe
        title={title || "Music player"}
        src={embed.src}
        width="100%"
        height={embed.height}
        style={mini ? { height: 0 } : undefined}
        allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
        loading="lazy"
      />
      {embed.provider === "spotify" && !mini && <p className="md-note">Log in to Spotify in this browser to hear full songs (otherwise 30-second previews).</p>}
    </div>
  );
}
