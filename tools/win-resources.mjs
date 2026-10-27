// 打包后给 Windows 可执行文件写入图标和版本信息（纯 JS，不需要 wine / rcedit）
import fs from 'fs';
import path from 'path';
import * as ResEdit from 'resedit';
import * as PELibrary from 'pe-library';

const exe = path.resolve('dist/FandomRiot-win32-x64/FandomRiot.exe');
const ico = path.resolve('electron/icon.ico');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const exeData = PELibrary.NtExecutable.from(fs.readFileSync(exe), { ignoreCert: true });
const res = PELibrary.NtExecutableResource.from(exeData);
const iconFile = ResEdit.Data.IconFile.from(fs.readFileSync(ico));
ResEdit.Resource.IconGroupEntry.replaceIconsForResource(res.entries, 1, 1033, iconFile.icons.map(i => i.data));
const vi = ResEdit.Resource.VersionInfo.fromEntries(res.entries)[0] || ResEdit.Resource.VersionInfo.createEmpty();
const [a, b, c] = pkg.version.split('.').map(Number);
vi.setFileVersion(a, b, c, 0, 1033); vi.setProductVersion(a, b, c, 0, 1033);
vi.setStringValues({ lang: 1033, codepage: 1200 }, { ProductName: '饭圈风云 FANDOM RIOT', FileDescription: '饭圈风云', CompanyName: 'Kevin88866', LegalCopyright: '© 2026 Kevin88866', OriginalFilename: 'FandomRiot.exe' });
vi.outputToResourceEntries(res.entries);
res.outputResource(exeData);
fs.writeFileSync(exe, Buffer.from(exeData.generate()));
console.log('图标和版本信息已写入', exe);
