# 饭圈风云 · FANDOM RIOT  v1.1

一个首尔电竞饭圈 3D 模拟游戏（自用，不发布）。你是一个粉丝博主：开 LED 卡车、送花圈、拉横幅、砸臭鸡蛋、喷涂鸦、组织集会、放烟花、搞无人机灯光秀，用手机拍下来发到社交平台换曝光、粉丝和钱。你的行动会影响选手心态 → 比赛结果 → 舆论热度。三个剧本赛季打完有结局，之后进入无尽模式。

## 怎么玩
- **Windows**：解压 `FandomRiot-v1.1-win32-x64.zip`，双击 `FandomRiot.exe`。默认全屏，F11 切换窗口 / 全屏（设置里也能改）。
- **开发 / 其他系统**：装好 Node.js 后 `npm install`，再 `npm start`。也可以 `npm run serve`，然后用浏览器打开 http://localhost:8123 。

存档：1 个自动存档（每周开始、周结算后）+ 3 个手动存档位（暂停菜单 → 保存游戏）。桌面版存在 `%APPDATA%\饭圈风云\saves\`，错误日志在同目录的 `logs\error.log`。

## 操作
| 动作 | 键盘鼠标（可在设置里改键） | 手柄 |
|---|---|---|
| 移动 / 开车 | WASD | 左摇杆（开车时 RT 油门、LT 倒车） |
| 视角 | 鼠标 | 右摇杆 |
| 奔跑 | Shift | RT |
| 跳 / 刹车 | 空格（步行时跳，开车时刹车） | A（步行、没有互动提示时跳）/ B（车里刹车） |
| 互动 | E | A |
| 上车 / 下车 | F | X |
| 手机拍照 | C（左键拍、滚轮变焦、右键退出） | Y（RT / A 拍、LB / RB 变焦、B 退出） |
| 背包 / 地图 / 收起目标 | Tab / M / H | 十字键↓ / View / 十字键↑ |
| 摆放模式 | 鼠标移动、左键放下、Q / E 或滚轮旋转、右键取消 | 左摇杆、A 放下、LB / RB 旋转、B 取消 |
| 菜单 | Esc | ☰ |

菜单里可以用方向键 / 十字键 / 左摇杆移动焦点，Enter / A 确认，Esc / B 返回；设置页 Q / E 或 LB / RB 切换分页。按键提示会根据你最后用的设备自动在键盘和手柄之间切换。

## 设置
- **显示**：显示模式、分辨率、帧率上限（含不限）、视野、动态视野、亮度、镜头晃动、显示帧率。
- **图形**：画质预设、渲染倍率、阴影质量和距离、视距、环境光遮蔽、辉光、抗锯齿、纹理过滤、路人密度、车流密度、胶片颗粒、暗角。
- **界面**：界面缩放，小地图 / 目标 / 按键提示 / 推送 / 数据栏分别开关。
- **音频**：主音量、音乐、音效、环境音、界面音。
- **操作**：鼠标 / 手柄灵敏度、反转 Y 轴、手柄震动、键位重新绑定。
- **游戏**：难度（轻松 / 普通 / 困难，影响收入和争议度增长）、界面缩放、新手引导、自动存档。

## 每周流程
1. **比赛日**（直播风格）：赛果、MVP 和背锅位、热搜榜、选手动态，以及"你的行动 → 心态 → 本场表现"因果链。
2. **私信**：有时会收到俱乐部、选手本人、对手粉头等的私信，二选一 / 三选一，影响后续。
3. **行动日**（游戏内 18:00–24:00）：去用品店买道具 → 到目标选手所在的总部（其他战队在 LCK 竞技场）使用；限时机会事件（选手下班、电视台采访、对手粉头卡车、街头主播）；手机拍照。第一周有新手引导。
4. **发帖**（社交 App 风格）：每天最多 3 条，选平台和语气。
5. **周结算**：商单任务、商单收入、房租、争议度后果、粉丝团变化、技能升级。


## 修改名字和数值
- 战队名、选手名、招牌文字、默认标语、道具价格和平衡参数：**`src/content/data.js`**
- 私信剧情、每周商单、成就：**`src/content/story.js`**

改完重新打开游戏就生效（打包版需要重新打包：`npm run pack:win`）。数值平衡可以用 `npm run simulate` 跑机器人模拟检查。

## 3D 模型（Blender）
车辆、街道设施、道具、楼体细节、地标总部、行道树、路人配件全部由 `tools/blender/*.py` 用 Blender 的 Python 模块（bpy）脚本建模，自动倒角、合并网格、把环境光遮蔽烘焙进顶点色，再导出到 `assets/models/*.glb`：

```
pip install bpy            # Blender 5.x 的 Python 模块
python tools/blender/vehicles.py     # 也可以只建某几个：python tools/blender/street.py st_lamp st_signal
python tools/blender/street.py
python tools/blender/props.py
python tools/blender/buildings.py
python tools/blender/landmarks.py
python tools/blender/nature.py
```
每个模型会在 `tools/blender/previews/` 生成两张 Cycles 预览图。开发用的预览页：`/tools/dev/actors.html`（人物 × 动画）、`/tools/dev/vehicles.html`（所有车辆）。

## 打包
`npm run pack:win` → `dist/FandomRiot-win32-x64/`（程序图标和版本信息由 `tools/win-resources.mjs` 写入，不需要 wine）。

## 素材
- 下载的第三方素材在 `assets/thirdparty/`，来源和许可见 `assets/thirdparty/CREDITS.md`：
  - 人物和动画：Mixamo（Adobe）。**Mixamo 许可不允许转发原始素材，仓库必须保持私有。**
  - 贴图、HDR、家具、植物：Poly Haven / ambientCG / Kenney / Poly Pizza（CC0）。
  - 音效：Freesound 等（CC0）。
- 人物精简版：`tools/blender/chars_lod.py` → `assets/models/chars/`。
- 店铺内景：`tools/blender/shops.py`；写实行道树：`tools/blender/trees2.py`。
- 车辆、街道设施、道具、楼体细节、地标由 Blender 脚本生成；背景音乐由代码生成。
- 打包时 `tools/prune-pack.mjs` 只保留实际用到的第三方文件。
