"""Google Fonts (OFL) fetcher: font file + OFL.txt from github.com/google/fonts."""
from lib import get, asset_dir, add_credit

RAW = 'https://raw.githubusercontent.com/google/fonts/main/ofl'
FONTS = [  # (dir, file, display name, author)
    ('notosanssc', 'NotoSansSC[wght].ttf', 'Noto Sans SC (variable)', 'Google, Adobe'),
    ('notosanskr', 'NotoSansKR[wght].ttf', 'Noto Sans KR (variable)', 'Google, Adobe'),
    ('blackhansans', 'BlackHanSans-Regular.ttf', 'Black Han Sans (bold Korean display)', 'Zess Type'),
    ('bebasneue', 'BebasNeue-Regular.ttf', 'Bebas Neue (bold Latin display)', 'Dharma Type'),
]
for d, f, name, author in FONTS:
    out = asset_dir('fonts', 'googlefonts', d)
    get(f'{RAW}/{d}/{f}', out / f.replace('[wght]', '-VariableWght'))
    get(f'{RAW}/{d}/OFL.txt', out / 'OFL.txt')
    add_credit('fonts', name, f'https://fonts.google.com/specimen/{name.split(" (")[0].replace(" ", "+")}', author,
               'OFL-1.1', out)
    print('ok', d)
