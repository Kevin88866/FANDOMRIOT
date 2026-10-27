# 生成程序图标：electron/icon.png（512）和 electron/icon.ico（多尺寸，Windows 打包用）
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import os
S = 512
img = Image.new('RGBA', (S, S), (0, 0, 0, 0))
# 渐变圆角方块
grad = Image.new('RGBA', (S, S))
gd = ImageDraw.Draw(grad)
for y in range(S):
    t = y / S
    c = (int(255 * (1 - t) + 122 * t), int(45 * (1 - t) + 43 * t), int(85 * (1 - t) + 255 * t), 255)
    gd.line([(0, y), (S, y)], fill=c)
mask = Image.new('L', (S, S), 0)
ImageDraw.Draw(mask).rounded_rectangle([16, 16, S - 16, S - 16], radius=110, fill=255)
img.paste(grad, (0, 0), mask)
d = ImageDraw.Draw(img)
font = ImageFont.truetype('/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc', 300)
txt = '饭'
bb = d.textbbox((0, 0), txt, font=font)
x, y = (S - (bb[2] - bb[0])) / 2 - bb[0], (S - (bb[3] - bb[1])) / 2 - bb[1] - 14
shadow = Image.new('RGBA', (S, S), (0, 0, 0, 0))
ImageDraw.Draw(shadow).text((x + 6, y + 10), txt, font=font, fill=(40, 0, 30, 160))
img = Image.alpha_composite(img, shadow.filter(ImageFilter.GaussianBlur(8)))
d = ImageDraw.Draw(img)
d.text((x, y), txt, font=font, fill=(255, 255, 255, 255))
# 小 LED 条
d.rounded_rectangle([110, 410, 402, 436], radius=13, fill=(39, 225, 255, 255))
out = os.path.join(os.path.dirname(__file__), '..', 'electron')
img.save(os.path.join(out, 'icon.png'))
img.save(os.path.join(out, 'icon.ico'), sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
print('ok')
