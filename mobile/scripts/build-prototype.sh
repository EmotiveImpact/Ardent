#!/usr/bin/env bash
# Builds the web export into a folder that can be hosted under any sub-path
# (used for the clickable prototype). Usage: scripts/build-prototype.sh <out-dir>
set -euo pipefail
cd "$(dirname "$0")/.."
OUT=${1:?out dir}
rm -rf dist "$OUT"
npx expo export --platform web --output-dir dist >/dev/null
mkdir -p "$OUT"
cp -r dist/assets "$OUT/assets"
mv dist/_expo/static/js/web "$OUT/js"
# Only the font weights the app loads.
find "$OUT/assets" -name '*.ttf' | grep -Ev 'Michroma_400Regular|Geist_(400Regular|500Medium|600SemiBold)\.|GeistMono_(400Regular|500Medium)\.' | xargs rm -f
cd "$OUT/js"
for f in *; do n=${f#__}; n=${n//[/}; n=${n//]/}; [ "$f" = "$n" ] || mv "$f" "$n"; done
# Absolute paths become paths under the page's own folder.
sed -i -E \
  -e 's#"/assets/#window.__AB+"assets/#g' \
  -e 's#"/_expo/static/js/web/#window.__AB+"js/#g' \
  -e 's#"js/__#"js/#g' -e 's#"js/\[([a-z]+)\]#"js/\1#g' *.js
if grep -q '"/assets/\|"/_expo/static' *.js; then echo "unrewritten paths left" >&2; exit 1; fi
cd - >/dev/null
SCRIPTS=$(grep -o '_expo/static/js/web/[^"]*\.js' dist/index.html | sed -E 's#.*/(__)?##' | sed "s/.*/'&'/" | paste -sd, -)
sed "s#__SCRIPTS__#[$SCRIPTS]#" prototype/index.html > "$OUT/index.html"
echo "built $OUT"
