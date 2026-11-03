#!/usr/bin/env bash
# Regenerates the tutorial media in docs/public/media from this checkout: the terminal parts with VHS, the
# dashboard with Playwright, then ffmpeg joins them into tutorial-{en,es}.mp4 (+ .vtt subtitles) and cuts a GIF
# per part. Needs vhs (with ttyd) and ffmpeg. Usage: npm run docs:media   (MEDIA_LOCALES="en" for one locale)
set -euo pipefail
MEDIA="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$MEDIA/../.." && pwd)"
OUT="${MEDIA_OUT:-$(mktemp -d)/sdlc-media}"  # outside the checkout: the tutorial repos are git repos of their own
DEST="$REPO/docs/public/media"   # video and subtitles: played by URL, so they stay in public/
IMG="$REPO/docs/media"            # GIFs and screenshots: relative links, which also work on GitHub
LOCALES="${MEDIA_LOCALES:-en es}"
TERMINAL_PARTS="install quick loop guardrail"
for tool in vhs ffmpeg ffprobe; do command -v "$tool" >/dev/null || { echo "missing: $tool (brew install vhs ffmpeg)" >&2; exit 1; }; done

rm -rf "$OUT" && mkdir -p "$OUT/parts" "$DEST" "$IMG"
export MEDIA_OUT="$OUT"

echo "▶ build and pack this checkout"
(cd "$REPO" && npm run -s build >/dev/null)
TGZ="$(cd "$REPO/packages/cli" && npm pack --silent --pack-destination "$OUT")"
export SDLC_TGZ="$OUT/$TGZ" SDLC_BIN="node $REPO/packages/cli/dist/sdlc.mjs"

echo "▶ terminal parts (vhs)"
node "$MEDIA/tapes.mjs" "$OUT" >/dev/null
for loc in $LOCALES; do for part in $TERMINAL_PARTS; do
  echo "  $part-$loc"
  vhs -q "$OUT/tapes/$part-$loc.tape"
done; done

echo "▶ dashboard (playwright)"
grep="dashboard-($(echo $LOCALES | tr ' ' '|'))"
(cd "$REPO" && npx playwright test -c scripts/media/playwright.config.ts --grep "$grep" >"$OUT/playwright.log" 2>&1) || { cat "$OUT/playwright.log" >&2; exit 1; }
for loc in $LOCALES; do
  webm="$(ls "$OUT"/pw/*dashboard-$loc*/video.webm | head -1)"
  cp "$webm" "$OUT/parts/dashboard-$loc.webm"
  cp "$OUT/dashboard-board-$loc.png" "$OUT/dashboard-inbox-$loc.png" "$IMG/"
done

# Same size, frame rate and codec for every part, so the concat demuxer can join them without re-timing.
norm() { ffmpeg -loglevel error -y -i "$1" -vf "fps=30,scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2:color=0x1e1e2e" -c:v libx264 -preset slow -crf 30 -pix_fmt yuv420p -an "$2"; }
gif() { ffmpeg -loglevel error -y -i "$1" -vf "fps=6,scale=960:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=48:stats_mode=diff[p];[b][p]paletteuse=dither=none:diff_mode=rectangle" "$2"; }
dur() { ffprobe -v error -show_entries format=duration -of csv=p=0 "$1"; }
ts() { awk -v s="$1" 'BEGIN { printf "%02d:%02d:%06.3f", int(s/3600), int(s%3600/60), s%60 }'; }

caption() { # <part> <loc>
  case "$2:$1" in
    en:install) echo "Install: npm i -D @morsadev/sdlc, then npx sdlc init. sdlc doctor checks the setup." ;;
    en:quick) echo "A small change takes the quick lane: no spec or plan, limits checked on every push." ;;
    en:loop) echo "A real feature: the agent writes intent, spec and plan; you approve each one. Agent steps are sped up." ;;
    en:guardrail) echo "Code pushed before the plan is approved is blocked by the git hook." ;;
    en:dashboard) echo "The same decisions in the local dashboard: npx sdlc ui." ;;
    es:install) echo "Instalar: npm i -D @morsadev/sdlc y después npx sdlc init. sdlc doctor verifica la configuración." ;;
    es:quick) echo "Un cambio chico va por el carril rápido: sin spec ni plan, con límites en cada push." ;;
    es:loop) echo "Una funcionalidad de verdad: el agente escribe intent, spec y plan; vos aprobás cada uno. Los pasos del agente están acelerados." ;;
    es:guardrail) echo "El hook de git bloquea el código que se sube antes de aprobar el plan." ;;
    es:dashboard) echo "Las mismas decisiones en el dashboard local: npx sdlc ui." ;;
  esac
}

for loc in $LOCALES; do
  echo "▶ tutorial-$loc.mp4"
  list="$OUT/concat-$loc.txt"; vtt="$DEST/tutorial-$loc.vtt"; : > "$list"; printf 'WEBVTT\n\n' > "$vtt"; t=0
  for part in $TERMINAL_PARTS dashboard; do
    src="$OUT/parts/$part-$loc.mp4"; [ -f "$src" ] || src="$OUT/parts/$part-$loc.webm"
    norm "$src" "$OUT/parts/$part-$loc.norm.mp4"
    echo "file '$OUT/parts/$part-$loc.norm.mp4'" >> "$list"
    d="$(dur "$OUT/parts/$part-$loc.norm.mp4")"
    end="$(awk -v a="$t" -v b="$d" 'BEGIN { print a + b }')"
    printf '%s --> %s\n%s\n\n' "$(ts "$t")" "$(ts "$end")" "$(caption "$part" "$loc")" >> "$vtt"
    t="$end"
    [ "$part" = dashboard ] || gif "$OUT/parts/$part-$loc.norm.mp4" "$IMG/$part-$loc.gif"
  done
  ffmpeg -loglevel error -y -f concat -safe 0 -i "$list" -c copy -movflags +faststart "$DEST/tutorial-$loc.mp4"
done

echo "▶ sizes"
fail=0
for f in "$DEST"/* "$IMG"/*; do
  kb=$(( $(wc -c < "$f") / 1024 ))
  case "$f" in *.gif) max=2048 ;; *.mp4) max=10240 ;; *) max=1024 ;; esac
  printf '  %6s KB  %s\n' "$kb" "${f#"$REPO"/}"
  [ "$kb" -le "$max" ] || { echo "  too big (max $max KB)" >&2; fail=1; }
done
exit "$fail"
