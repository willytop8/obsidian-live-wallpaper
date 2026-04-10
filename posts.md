# Launch Posts

## Reddit (r/ObsidianMD)

**Title:** I made my vault graph my desktop wallpaper [macOS, open source]

**Body:**
The Obsidian graph view is one of the prettiest things in the app and I never look at it because it's buried two clicks deep. So I built a tiny tool that turns it into a live desktop wallpaper — new notes appear within seconds of saving, fully ambient, no labels.

It's three layers: a Node script that parses your vault into JSON, a d3 force simulation in an HTML file, and Plash (free Mac App Store app) that renders the HTML as your wallpaper. Windows port is coming next — the code is identical, just needs Lively Wallpaper instead of Plash.

MIT licensed, ~150 lines total. Would love feedback and PRs, especially from anyone on Linux.

https://github.com/willytop8/obsidian-live-wallpaper

[GIF]

---

## Hacker News (Show HN)

**Title:** Show HN: Obsidian Live Wallpaper – your knowledge graph as your desktop

**Body:**
Small weekend project. Turns an Obsidian vault's graph view into a live, animated macOS wallpaper using a Node file watcher, d3-force in a fullscreen canvas, and Plash as the wallpaper host. Architecturally it's three layers with narrow JSON contracts between them, which is why the Windows and Linux ports (planned) only need to swap the host — the parser and renderer don't change.

Roughly 150 lines of code. MIT. Feedback welcome.

---

## LinkedIn

I shipped a small open-source tool this weekend: it turns your Obsidian vault's graph view into a live desktop wallpaper.

The interesting part wasn't the d3 animation — it was how easy the cross-platform port turned out to be once I separated three concerns into three files that only know about each other through a JSON file on disk:

→ A parser that watches the vault
→ A renderer that draws the graph
→ A host that puts the renderer on the desktop

Only the host is OS-specific. Everything else is free. macOS shipped today; Windows is a documentation change.

Narrow contracts between layers is one of those ideas that sounds obvious until you watch it save you 80% of the work on the second platform. Worth remembering on bigger projects too.

https://github.com/willytop8/obsidian-live-wallpaper · [GIF]
