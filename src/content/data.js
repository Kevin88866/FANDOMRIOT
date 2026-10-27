// ============================================================
//  名字配置：联盟、战队、选手、招牌全部在这里，改这里即可。
//  游戏其他代码不硬编码任何名字。
//  role = TOP/JG/MID/ADC/SUP，skill 0-100（影响比赛强度）
//  sign = 总部楼顶招牌文字，popular = 额外人气（影响全明星投票和话题度）
// ============================================================

export const LEAGUE = {
  name: 'KSL',                          // 联盟简称
  full: 'Korea Summit League',
  arena: 'KSL 竞技场',                   // 其余战队的"总部"（地图上的竞技场）
  billboard: 'KSL 2026 · 서울 아레나',    // 竞技场大屏默认文字
  hqA: 'NVA',                           // 大路北侧总部的战队 id
  hqB: 'SOL',                           // 大路南侧总部的战队 id
  defaultFav: 'NVA',
};

export const TEAMS = [
  { id: 'NVA', name: 'Nova',       full: 'Nova Esports',        sign: 'NOVA',      color: '#e2012d', color2: '#111111', popular: 300,
    players: [['Ridge','TOP',86],['Hollow','JG',87],['Lumen','MID',93],['Quill','ADC',86],['Mossy','SUP',92]] },
  { id: 'SOL', name: 'Solaris',    full: 'Solaris Gaming',      sign: 'SOLARIS',   color: '#f37321', color2: '#1d1d1d', popular: 200,
    players: [['Tundra','TOP',91],['Wisp','JG',89],['Sable','MID',88],['Arrow','ADC',88],['Pebble','SUP',87]] },
  { id: 'IRC', name: 'Ironclad',   full: 'Ironclad Esports',    sign: 'IRONCLAD',  color: '#aa8b56', color2: '#000000', popular: 150,
    players: [['Bastion','TOP',90],['Fable','JG',91],['Cinder','MID',93],['Volley','ADC',91],['Lantern','SUP',85]] },
  { id: 'VTX', name: 'Vortex',     full: 'Vortex Gaming',       sign: 'VORTEX',    color: '#1fc3c9', color2: '#0b1830', popular: 80,
    players: [['Granite','TOP',80],['Haze','JG',82],['Mirage','MID',84],['Sling','ADC',85],['Anchor','SUP',81]] },
  { id: 'OWL', name: 'Midnight Owls', full: 'Midnight Owls',    sign: 'OWLS',      color: '#e60012', color2: '#222222', popular: 60,
    players: [['Talon','TOP',81],['Nocturne','JG',83],['Hoot','MID',85],['Glint','ADC',84],['Feather','SUP',80]] },
  { id: 'THB', name: 'Thunderbirds', full: 'Thunderbirds',      sign: 'THUNDER',   color: '#2e5bff', color2: '#0a0f2a', popular: 30,
    players: [['Bolt','TOP',77],['Static','JG',76],['Volt','MID',80],['Surge','ADC',80],['Ohm','SUP',76]] },
  { id: 'JTG', name: 'Jade Tigers', full: 'Jade Tigers',        sign: 'JADE',      color: '#ffcc00', color2: '#1a1a1a', popular: 30,
    players: [['Stripe','TOP',77],['Prowl','JG',78],['Jasper','MID',79],['Claw','ADC',80],['Whisker','SUP',76]] },
  { id: 'CFX', name: 'Crimson Fox', full: 'Crimson Fox',        sign: 'CRIMSON',   color: '#d4002a', color2: '#2a0000', popular: 30,
    players: [['Ember','TOP',78],['Kit','JG',76],['Rusk','MID',80],['Vixen','ADC',81],['Bramble','SUP',79]] },
  { id: 'NWF', name: 'Neon Wolves', full: 'Neon Wolves',        sign: 'NEON',      color: '#00a651', color2: '#06240f', popular: 20,
    players: [['Howl','TOP',74],['Pack','JG',75],['Lunar','MID',76],['Fang','ADC',77],['Scout','SUP',74]] },
  { id: 'STR', name: 'Storm Riders', full: 'Storm Riders',      sign: 'STORM',     color: '#7b2cbf', color2: '#160828', popular: 20,
    players: [['Gale','TOP',78],['Squall','JG',79],['Drift','MID',79],['Monsoon','ADC',79],['Breeze','SUP',76]] },
];

// 横幅 / 花圈 / LED 屏的默认标语（{p} = 选手名，{t} = 战队名）
export const SLOGANS = {
  attack: ['{p} OUT', '{p} 나가', '{p} 退役吧', '{t} 정신 차려', '{p} 是来度假的吗'],
  support: ['{p} 최고!', '{p} 永远的神', '{p} 응원해요 ♥', '{t} 화이팅', '{p} 生日快乐'],
};

// 道具：kind = attack(黑) / support(应援)，ext = 极端道具（关注度大涨，触发警察）
// impact: 曝光基础值，heat: 关注度增加，mood: 对目标选手心态影响
export const ITEMS = [
  { id: 'banner',   name: '抗议横幅',    kind: 'attack',  price: 150000,   impact: 10, heat: 1,  mood: -3, unlock: 0, prop: 'banner',
    desc: '在总部门口拉一条横幅。便宜，但没啥人看。' },
  { id: 'wreath',   name: '花圈',        kind: 'attack',  price: 400000,   impact: 22, heat: 3,  mood: -6, unlock: 0, prop: 'wreath',
    desc: '韩国饭圈经典的"근조화환"。一排摆开最有冲击力。' },
  { id: 'truck',    name: 'LED 抗议卡车', kind: 'attack', price: 2500000,  impact: 60, heat: 6,  mood: -10, unlock: 0, prop: 'truck', truck: true,
    desc: '卡车侧面大屏滚动你写的标语，在总部门口绕圈。' },
  { id: 'eggs',     name: '臭鸡蛋',      kind: 'attack',  price: 50000,    impact: 14, heat: 10, mood: -6, unlock: 1, prop: 'eggs', thrown: true,
    desc: '亲手砸向大楼。有点掉价，但很有画面感。' },
  { id: 'graffiti', name: '喷漆涂鸦',    kind: 'attack',  price: 300000,   impact: 30, heat: 16, mood: -8, unlock: 2, prop: 'graffiti',
    desc: '在总部外墙喷一个巨大的 OUT。' },
  { id: 'drone',    name: '无人机灯光秀', kind: 'both',   price: 6000000,  impact: 110, heat: 8, mood: 12, unlock: 3, prop: 'drone',
    desc: '几百架无人机在总部上空拼字。黑和捧都能用。' },
  { id: 'fireworks',name: '烟花',        kind: 'both',    price: 1200000,  impact: 45, heat: 14, mood: 6, unlock: 2, prop: 'fireworks',
    desc: '在总部门口放烟花。夜景照片的王者。' },
  { id: 'bomb',     name: '整蛊炸弹',    kind: 'attack',  price: 3000000,  impact: 160, heat: 45, mood: -20, unlock: 4, prop: 'bomb', ext: true,
    desc: '卡通炸弹，炸掉门口的装饰。全网爆炸级曝光，警察会来。' },
  { id: 'rpg',      name: '火箭筒',      kind: 'attack',  price: 8000000,  impact: 260, heat: 70, mood: -30, unlock: 6, prop: 'rpg', ext: true,
    desc: '把总部招牌轰下来。传说级操作，大概率被通缉。' },
  { id: 'flowers',  name: '应援花篮',    kind: 'support', price: 300000,   impact: 18, heat: 0,  mood: 6, unlock: 0, prop: 'flowers',
    desc: '韩国饭圈的"쌀화환"/花篮应援，温暖但平淡。' },
  { id: 'coffee',   name: '咖啡应援车',  kind: 'support', price: 3500000,  impact: 55, heat: 0,  mood: 12, unlock: 1, prop: 'truck', truck: true, support: true,
    desc: '请全队和员工喝咖啡，车身印选手照片。选手会发 ins 感谢。' },
  { id: 'billboard',name: '生日应援大屏', kind: 'support', price: 5000000, impact: 85, heat: 0,  mood: 16, unlock: 2, prop: 'billboard',
    desc: '把总部对面大楼的屏幕包下来。粉丝圈的顶级排面。' },
];

// 社交平台：pref 对不同"照片标签"的偏好
export const PLATFORMS = [
  { id: 'x',     name: 'X(推特)',  icon: '𝕏', color: '#ffffff', cpm: 0.9,  desc: '海外粉丝多，话题扩散快',
    pref: { attack: 1.0, support: 1.1, explosion: 1.2, crowd: 1.0, text: 1.3 } },
  { id: 'tok',   name: '短视频',   icon: '♪', color: '#ff2d55', cpm: 0.7,  desc: '只看爽不爽，场面越大越好',
    pref: { attack: 1.0, support: 0.9, explosion: 1.8, crowd: 1.3, text: 0.7 } },
  { id: 'dc',    name: 'DC 论坛',  icon: 'DC', color: '#3b6cff', cpm: 0.5, desc: '硬核玩家聚集地，爱骂人',
    pref: { attack: 1.5, support: 0.5, explosion: 1.1, crowd: 0.8, text: 1.2 } },
];

export const TONES = [
  { id: 'mock',   name: '嘲讽', attack: 1.3, support: 0.6, backlash: 1.4 },
  { id: 'emo',    name: '煽情', attack: 0.9, support: 1.4, backlash: 0.8 },
  { id: 'calm',   name: '理性', attack: 0.8, support: 1.0, backlash: 0.5 },
];

export const SKILLS = [
  { id: 'photo',  name: '摄影',   max: 5, cost: [1,1,2,2,3], desc: '每级照片质量 +8%，取景提示更多' },
  { id: 'edit',   name: '剪辑',   max: 5, cost: [1,1,2,2,3], desc: '每级运气下限提高，石沉大海概率降低' },
  { id: 'net',    name: '人脉',   max: 5, cost: [1,2,2,3,3], desc: '道具打 9 折/级，解锁更多商单' },
  { id: 'stealth',name: '反侦察', max: 5, cost: [1,1,2,2,3], desc: '极端道具关注度 -12%/级，警察更慢' },
];

export const VEHICLES = [
  { id: 'scooter', name: '电动滑板车', price: 0,        speed: 14, desc: '起步装备' },
  { id: 'van',     name: '二手面包车', price: 4000000,  speed: 20, desc: '更快，甩警察靠它' },
  { id: 'pickup',  name: '改装皮卡',   price: 12000000, speed: 26, desc: '极速，适合亡命之徒' },
];

export const BALANCE = {
  startMoney: 3000000, startFans: 800,
  weeksPerSeason: 10, dayMinutes: 6 * 60, realSecPerGameMin: 0.6,
  wonPerView: 6,                 // 每个曝光值换算的韩元
  repeatDecay: 0.6, timingBonus: 1.5,
  viralChance: 0.04, viralMin: 5, viralMax: 18, flopChance: 0.10, flopMul: 0.2, luckSigma: 0.38,
  heatDecay: 12, heatLimit: 50, heatBan: 75, heatArrest: 100,
  fanToMoney: 40, skillPointEvery: 3000,
};
