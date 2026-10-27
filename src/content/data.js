// 所有可调数值和内容集中在这里。名字都是"实况足球式"恶搞名。
// 阵容可随意修改：role = TOP/JG/MID/ADC/SUP，skill 0-100。

export const TEAMS = [
  { id: 'T0',  name: 'T0',        full: 'T0 이스포츠',      color: '#e2012d', color2: '#111111', hq: true,
    players: [['Dorran','TOP',86],['Onar','JG',87],['Fakor','MID',93],['Peiz','ADC',86],['Kerya','SUP',92]] },
  { id: 'HWL', name: '汉华生命',  full: 'Hanhwa Lyfe Esports', color: '#f37321', color2: '#1d1d1d', hq: true,
    players: [['Zeous','TOP',91],['Kanabi','JG',89],['Zekka','MID',88],['Gumayoshi','ADC',88],['Delite','SUP',87]] },
  { id: 'GZ',  name: 'Gen.Z',     full: 'Gen.Z Esports',   color: '#aa8b56', color2: '#000000',
    players: [['Kiyn','TOP',90],['Kanyon','JG',91],['Chobi','MID',93],['Rular','ADC',91],['Duroo','SUP',85]] },
  { id: 'DM',  name: 'D-Minus',   full: 'D-Minus KIYA',    color: '#1fc3c9', color2: '#0b1830',
    players: [['Syeon','TOP',80],['Lussid','JG',82],['ShoeMaker','MID',84],['Aimy','ADC',85],['Kellin','SUP',81]] },
  { id: 'KC',  name: 'KC 롤스터', full: 'KC Rollster',     color: '#e60012', color2: '#222222',
    players: [['PerFact','TOP',81],['Kuzi','JG',83],['Bidd','MID',85],['Ahz','ADC',84],['Peter','SUP',80]] },
  { id: 'DRZ', name: 'DRZ',       full: 'DRZ Gaming',      color: '#2e5bff', color2: '#0a0f2a',
    players: [['Rich','TOP',77],['Sponj','JG',76],['Ucal','MID',80],['Teddi','ADC',80],['Andi','SUP',76]] },
  { id: 'FX',  name: 'FearZ',     full: 'BNK FearZ',       color: '#ffcc00', color2: '#1a1a1a',
    players: [['Clea','TOP',77],['Raptr','JG',78],['VicLa','MID',79],['Diable','ADC',80],['Kelly','SUP',76]] },
  { id: 'NS',  name: '농심 레드',  full: 'Nongsim RedForce',color: '#d4002a', color2: '#2a0000',
    players: [['Kingin','TOP',78],['Sylvi','JG',76],['Calix','MID',80],['Jiwoo','ADC',81],['Lehendz','SUP',79]] },
  { id: 'BRY', name: 'BRYON',     full: 'OKSaving BRYON',  color: '#00a651', color2: '#06240f',
    players: [['Kasting','TOP',74],['GIDEN','JG',75],['Fisha','MID',76],['Hype','ADC',77],['Pullbak','SUP',74]] },
  { id: 'DNF', name: 'DN 프릭스', full: 'DN Freaks',       color: '#7b2cbf', color2: '#160828',
    players: [['DuDu','TOP',78],['Pyosik','JG',79],['Clozer','MID',79],['deokdam','ADC',79],['Peter2','SUP',76]] },
];

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
