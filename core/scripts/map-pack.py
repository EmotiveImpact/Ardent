"""Pack OpenFreeMap street tiles for south Manchester into one file the prototype can carry.

    python3 scripts/map-pack.py <out-prefix>      e.g. dist/map/manchester

Writes <out>.tiles.txt (tiles end to end, gzipped, as base64 text so any static host serves
it), <out>.json (where each tile sits) and <out>-fonts/ (the letters for labels, also base64).
Build with VITE_MAP_PACK=./map/manchester to use them. The real app reads OpenFreeMap
directly and needs none of this.
"""

import base64
import concurrent.futures as cf
import gzip
import json
import math
import os
import sys
import urllib.request

OFM = 'https://tiles.openfreemap.org'
WEST, EAST, SOUTH, NORTH = -2.42, -2.12, 53.37, 53.53
# Street-level tiles are heavy, so the closest zoom only covers where the demo crew work.
CLOSE = (-2.37, -2.15, 53.395, 53.505)
# Shop and house detail the map doesn't draw.
DROP = {'building', 'housenumber', 'poi', 'mountain_peak', 'aerodrome_label'}
FONT_RANGES = ['0-255', '256-511', '8192-8447']


def get(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (Ardent map pack)'})
    data = urllib.request.urlopen(req, timeout=30).read()
    return gzip.decompress(data) if data[:2] == b'\x1f\x8b' else data


def tile(lon, lat, z):
    n = 2**z
    r = math.radians(lat)
    return int((lon + 180) / 360 * n), int((1 - math.log(math.tan(r) + 1 / math.cos(r)) / math.pi) / 2 * n)


def tiles():
    for z in range(8, 15):
        w, e, s, n = CLOSE if z == 14 else (WEST, EAST, SOUTH, NORTH)
        x0, y0 = tile(w, n, z)
        x1, y1 = tile(e, s, z)
        for x in range(x0, x1 + 1):
            for y in range(y0, y1 + 1):
                yield z, x, y


def varint(b, i):
    r = s = 0
    while True:
        c = b[i]
        i += 1
        r |= (c & 0x7F) << s
        s += 7
        if c < 0x80:
            return r, i


def fields(b):
    """Top-level protobuf fields as (number, raw bytes, payload) without needing the schema."""
    i = 0
    while i < len(b):
        start = i
        key, i = varint(b, i)
        f, w = key >> 3, key & 7
        payload = None
        if w == 0:
            _, i = varint(b, i)
        elif w == 1:
            i += 8
        elif w == 5:
            i += 4
        elif w == 2:
            n, i = varint(b, i)
            payload = b[i : i + n]
            i += n
        yield f, b[start:i], payload


def slim(b, z):
    """Keep the layers the map draws (layers are field 3, their name is field 1)."""
    out = bytearray()
    for f, raw, payload in fields(b):
        if f == 3:
            name = next(p for g, _, p in fields(payload) if g == 1).decode()
            if name in DROP or (z == 14 and name == 'landcover'):
                continue
        out += raw
    return bytes(out)


def main(out):
    os.makedirs(os.path.dirname(out) or '.', exist_ok=True)
    version = json.loads(get(f'{OFM}/planet'))['tiles'][0].rsplit('/', 3)[0]
    wanted = list(tiles())
    with cf.ThreadPoolExecutor(8) as pool:
        raw = list(pool.map(lambda t: get(f'{version}/{t[0]}/{t[1]}/{t[2]}.pbf'), wanted))
    index, blob = {}, bytearray()
    for (z, x, y), data in zip(wanted, raw):
        data = slim(data, z)
        index[f'{z}-{x}-{y}'] = [len(blob), len(data)]
        blob += data
    open(f'{out}.tiles.txt', 'wb').write(base64.b64encode(gzip.compress(bytes(blob), 9)))
    json.dump(index, open(f'{out}.json', 'w'))
    os.makedirs(f'{out}-fonts', exist_ok=True)
    for r in FONT_RANGES:
        open(f'{out}-fonts/{r}.txt', 'wb').write(base64.b64encode(get(f'{OFM}/fonts/Noto%20Sans%20Regular/{r}.pbf')))
    print(f'{len(index)} tiles, {len(blob) / 1e6:.1f} MB')


if __name__ == '__main__':
    main(sys.argv[1])
