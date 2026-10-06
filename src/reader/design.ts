import type { CSSProperties } from "react";
import type { Book } from "../types.ts";
import { mix } from "../doodle/theme.ts";

/** CSS variables for the author's custom page & cover colours (layered over the paper preset). */
export function designVars(book: Pick<Book, "design">): CSSProperties {
  const d = book.design;
  if (!d) return {};
  const v: Record<string, string> = {};
  if (d.page) v["--page-bg"] = d.page;
  if (d.text) v["--page-ink"] = d.text;
  if (d.accent) v["--page-accent"] = d.accent;
  if (d.cover) {
    v["--cover-a"] = mix(d.cover, "#ffffff", 0.3);
    v["--cover-b"] = d.cover;
    v["--cover-c"] = mix(d.cover, "#000000", 0.2);
    v["--cover-shadow"] = mix(d.cover, "#000000", 0.6);
  }
  if (d.coverText) v["--cover-ink"] = d.coverText;
  return v as CSSProperties;
}
