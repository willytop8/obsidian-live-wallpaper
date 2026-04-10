# macOS Setup

## Plash configuration

1. Install [Plash](https://apps.apple.com/us/app/plash/id1494023538) from the Mac App Store.
2. Plash menu bar → **Add Website** → paste `http://localhost:3000`.
3. **Browsing Mode**: off (so clicks pass through to your desktop).
4. **Opacity**: 100%. **Invert colors**: off.
5. **Reload interval**: leave blank — the renderer polls on its own.

## Autostart the parser

Save this as `~/Library/LaunchAgents/com.user.vaultwallpaper.plist`, edit the two paths, then run `launchctl load ~/Library/LaunchAgents/com.user.vaultwallpaper.plist`.

Find your node path first: run `which node` in Terminal and paste the result below.

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.user.vaultwallpaper</string>
  <key>ProgramArguments</key>
  <array>
    <string>PASTE_OUTPUT_OF_WHICH_NODE</string>
    <string>/Users/YOU/path/to/obsidian-live-wallpaper/parser.js</string>
  </array>
  <key>WorkingDirectory</key><string>/Users/YOU/path/to/obsidian-live-wallpaper</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
</dict></plist>
```

**Common node paths:**
- Apple Silicon (M1/M2/M3/M4): `/opt/homebrew/bin/node`
- Intel Mac (Homebrew): `/usr/local/bin/node`
- nvm: `/Users/YOU/.nvm/versions/node/vXX.X.X/bin/node` (launchctl does not expand `~` — use the full absolute path)

## Troubleshooting

- **Blank wallpaper**: check that `graph.json` exists in the project folder. If not, the parser isn't running or `vaultPath` is wrong.
- **Plash shows "file not found"**: use the absolute path with `file:///` (three slashes). Drag the `index.html` into a browser first to verify.
- **Nodes not updating**: confirm chokidar is watching by editing a note and checking the parser's terminal output.
- **Performance**: if your vault is 2000+ notes, increase `refreshMs` to 10000 in `config.json`.
