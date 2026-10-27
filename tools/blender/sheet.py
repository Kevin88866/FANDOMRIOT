# 把预览图拼成一张总览图：python3 tools/blender/sheet.py 输出.png 名字...
import sys, os
from PIL import Image
PREV = os.path.join(os.path.dirname(__file__), 'previews')
out, names = sys.argv[1], sys.argv[2:]
rows = []
for n in names:
    ims = [Image.open(os.path.join(PREV, f)) for f in sorted(os.listdir(PREV)) if f == n + '.png' or (f.startswith(n + '_') and f[len(n) + 1:-4].isdigit())]
    if ims:
        rows.append(ims)
w = max(sum(i.width for i in r) for r in rows)
h = sum(max(i.height for i in r) for r in rows)
sheet = Image.new('RGB', (w, h), (30, 30, 30))
y = 0
for r in rows:
    x = 0
    for i in r:
        sheet.paste(i, (x, y)); x += i.width
    y += max(i.height for i in r)
scale = min(1.0, 1400 / w)
if scale < 1:
    sheet = sheet.resize((int(w * scale), int(h * scale)), Image.LANCZOS)
sheet.save(out)
print(out, sheet.size)
