
// ナイト・オール・スクール
// app.js 単一ファイル統合版 v18
// - ガチャ完成版（10連 / NEW重複 / 比較表示 / 装備 / 強化 / 売却 / お気に入り / 一括売却 / ロック / 演出）
// - 戦闘 v1.3（ダメージ色分け / クリティカル / 回復 / 行動予告 / ボス危険攻撃予告 / クリックターゲット / 演出）

const STORAGE_KEY = 'night-all-school-single-v18';
const WEAPON_ENHANCE_MAX = 10;
const WEAPON_ENHANCE_RATE = 0.10;
const WEAPON_ENHANCE_BASE_COST = 10;
const GACHA_SINGLE_COST = 50;
const GACHA_TEN_COST = 500;
const GACHA_RARITY_WEIGHTS = { 1: 70, 2: 25, 3: 5 };
const GACHA_LOG_MAX = 30;
const SELL_VALUES = { 1: 5, 2: 15, 3: 50 };
const GAUGE_RULES = { normalAttack: 20, skillUse: 5, damageTaken: 10, guard: 10, burstReady: 100 };
const COMMAND_RULES = { attackBoost: 0.05, defenseReduce: 0.10, focusGauge: 5, guardReduction: 0.80 };
const CRIT_MULTIPLIER = 1.5;
const CRIT_RATES = { default: 0.08, char_towa: 0.18, char_hinano: 0.06, char_suzu: 0.05, protagonist: 0.04 };

const screens = {
  title: document.getElementById('screen-title'),
  menu: document.getElementById('screen-menu'),
  adventure: document.getElementById('screen-adventure'),
  formation: document.getElementById('screen-formation'),
  bond: document.getElementById('screen-bond'),
  gacha: document.getElementById('screen-gacha')
};

const gameData = { story: null, characters: null, battles: null, weapons: null };
const storyReaderState = { currentStoryId: null, currentSceneIndex: 0 };
const formationState = { equippedWeapons: { protagonist: '', char_towa: '', char_hinano: '', char_suzu: '' } };
const progressState = { clearedBattles: [] };
const resourceState = { materialCore: 0, exp: 0 };
const weaponState = { enhancements: {}, ownedWeapons: {}, lockedWeapons: {}, favoriteWeapons: {} };
const gachaState = { logs: [], lastResults: [], revealCount: 0, revealTimer: null };
const battleUiState = {
  currentBattleId: null,
  protagonistCommand: 'wait',
  partyCommands: {
    char_towa: { action: 'attack', targetId: '' },
    char_hinano: { action: 'attack', targetId: '' },
    char_suzu: { action: 'attack', targetId: '' }
  },
  runtime: null,
  turnCount: 0,
  turnLogs: [],
  result: null,
  targetPickerMember: 'char_towa'
};

// -------------------------
// 共通ユーティリティ
// -------------------------
function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
function clamp(v, min, max) { return Math.min(max, Math.max(min, v)); }
function randChance(rate) { return Math.random() < rate; }
function createInfoCard(id = '') { const card = document.createElement('div'); card.className = 'info-card dynamic-card'; if (id) card.id = id; return card; }
function clearDynamicCards(container) { container.querySelectorAll('.dynamic-card').forEach((card) => card.remove()); }
function showScreen(name) { Object.values(screens).forEach((screen) => screen && screen.classList.remove('active')); screens[name]?.classList.add('active'); }
async function loadJson(path) { const response = await fetch(path, { cache: 'no-store' }); if (!response.ok) throw new Error(`${path} の読み込みに失敗しました (${response.status})`); return response.json(); }
function renderResourceSummaryCard(title = '現在の所持数') {
  return `
    <h3>${escapeHtml(title)}</h3>
    <div class="status-row"><span>マテリアルコア</span><strong>${escapeHtml(resourceState.materialCore)}</strong></div>
    <div class="status-row"><span>EXP</span><strong>${escapeHtml(resourceState.exp)}</strong></div>
    <p class="muted" style="margin-top:12px;">報酬・装備・武器強化・ガチャ結果・売却結果は localStorage に保存されます。</p>
  `;
}
function rerenderAllSections() { renderAdventureSection(); renderFormationSection(); renderGachaSection(); }
function getCharactersList() { return gameData.characters?.characters || []; }
function getCharacterById(id) { return getCharactersList().find((char) => char.id === id) || null; }
function getWeaponsList() { return gameData.weapons?.weapons || []; }
function getWeaponById(id) { return getWeaponsList().find((weapon) => weapon.id === id) || null; }
function getBattleById(id) { return (gameData.battles?.battles || []).find((battle) => battle.id === id) || null; }
function getEnemyTemplateById(id) { return (gameData.battles?.enemyTemplates || []).find((enemy) => enemy.id === id) || null; }
function getSlotDisplayName(slotId) { return slotId === 'protagonist' ? '主人公' : (getCharacterById(slotId)?.name || slotId); }
function getWeaponTypeMap() { return new Map(Object.entries(gameData.weapons?.meta?.weaponTypeRules || {})); }
function getWeaponTypeDisplay(weapon) { const map = getWeaponTypeMap(); return weapon?.weaponTypeDisplay || map.get(weapon?.weaponType)?.displayName || weapon?.weaponType || '未設定'; }
function getRarityColor(rarity) { if (rarity === 3) return '#ffd86a'; if (rarity === 2) return '#8fd4ff'; return '#c7d2fe'; }
function getRarityBg(rarity) { if (rarity === 3) return 'radial-gradient(circle at top, rgba(255,216,106,0.22), rgba(9,13,28,1) 72%)'; if (rarity === 2) return 'radial-gradient(circle at top, rgba(143,212,255,0.18), rgba(9,13,28,1) 72%)'; return 'linear-gradient(180deg, rgba(15,22,48,1) 0%, rgba(9,13,28,1) 100%)'; }
function getRarityLabel(rarity) { return `★${rarity || 1}`; }

// -------------------------
// 保存 / 読み込み
// -------------------------
function getDefaultSaveState() {
  return {
    equippedWeapons: { protagonist: '', char_towa: '', char_hinano: '', char_suzu: '' },
    clearedBattles: [],
    resources: { materialCore: 0, exp: 0 },
    weaponEnhancements: {},
    ownedWeapons: {},
    lockedWeapons: {},
    favoriteWeapons: {},
    gachaLogs: [],
    lastGachaResults: [],
    gachaRevealCount: 0
  };
}
function saveGameState(showMessage = false) {
  try {
    const payload = {
      version: 'v18-single',
      savedAt: new Date().toISOString(),
      equippedWeapons: formationState.equippedWeapons,
      clearedBattles: progressState.clearedBattles,
      resources: { materialCore: resourceState.materialCore, exp: resourceState.exp },
      weaponEnhancements: weaponState.enhancements,
      ownedWeapons: weaponState.ownedWeapons,
      lockedWeapons: weaponState.lockedWeapons,
      favoriteWeapons: weaponState.favoriteWeapons,
      gachaLogs: gachaState.logs.slice(0, GACHA_LOG_MAX),
      lastGachaResults: gachaState.lastResults.slice(0, 10),
      gachaRevealCount: gachaState.revealCount
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    if (showMessage) alert('保存しました。');
    return true;
  } catch (error) {
    console.error(error);
    if (showMessage) alert('保存に失敗しました。');
    return false;
  }
}
function loadSaveData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    const defaults = getDefaultSaveState();
    formationState.equippedWeapons = { ...defaults.equippedWeapons, ...(parsed?.equippedWeapons || {}) };
    progressState.clearedBattles = Array.isArray(parsed?.clearedBattles) ? [...parsed.clearedBattles] : [];
    resourceState.materialCore = Number(parsed?.resources?.materialCore ?? 0) || 0;
    resourceState.exp = Number(parsed?.resources?.exp ?? 0) || 0;
    weaponState.enhancements = parsed?.weaponEnhancements && typeof parsed.weaponEnhancements === 'object' ? { ...parsed.weaponEnhancements } : {};
    weaponState.ownedWeapons = parsed?.ownedWeapons && typeof parsed.ownedWeapons === 'object' ? { ...parsed.ownedWeapons } : {};
    weaponState.lockedWeapons = parsed?.lockedWeapons && typeof parsed.lockedWeapons === 'object' ? { ...parsed.lockedWeapons } : {};
    weaponState.favoriteWeapons = parsed?.favoriteWeapons && typeof parsed.favoriteWeapons === 'object' ? { ...parsed.favoriteWeapons } : {};
    gachaState.logs = Array.isArray(parsed?.gachaLogs) ? parsed.gachaLogs.slice(0, GACHA_LOG_MAX) : [];
    gachaState.lastResults = Array.isArray(parsed?.lastGachaResults) ? parsed.lastGachaResults.slice(0, 10) : [];
    gachaState.revealCount = clamp(Number(parsed?.gachaRevealCount ?? 0) || 0, 0, 10);
    return true;
  } catch (error) {
    console.error(error);
    return false;
  }
}
function resetFormationState() { formationState.equippedWeapons = { protagonist: '', char_towa: '', char_hinano: '', char_suzu: '' }; }
function sanitizeOwnedWeapons() {
  const validSet = new Set(getWeaponsList().map((weapon) => weapon.id));
  const nextState = {};
  Object.entries(weaponState.ownedWeapons).forEach(([weaponId, count]) => { if (validSet.has(weaponId)) nextState[weaponId] = Math.max(0, Math.floor(Number(count) || 0)); });
  weaponState.ownedWeapons = nextState;
}
function sanitizeWeaponEnhancements() {
  const validSet = new Set(getWeaponsList().map((weapon) => weapon.id));
  const nextState = {};
  Object.entries(weaponState.enhancements).forEach(([weaponId, level]) => { if (validSet.has(weaponId)) nextState[weaponId] = clamp(Number(level) || 0, 0, WEAPON_ENHANCE_MAX); });
  weaponState.enhancements = nextState;
}
function sanitizeProtectedWeapons() {
  const validSet = new Set(getWeaponsList().map((weapon) => weapon.id));
  const nextLocked = {}, nextFavorites = {};
  Object.entries(weaponState.lockedWeapons).forEach(([weaponId, locked]) => { if (validSet.has(weaponId) && locked) nextLocked[weaponId] = true; });
  Object.entries(weaponState.favoriteWeapons).forEach(([weaponId, marked]) => { if (validSet.has(weaponId) && marked) nextFavorites[weaponId] = true; });
  weaponState.lockedWeapons = nextLocked; weaponState.favoriteWeapons = nextFavorites;
}
function initializeStarterWeaponsIfNeeded() {
  const total = Object.values(weaponState.ownedWeapons).reduce((sum, count) => sum + (Number(count) || 0), 0);
  if (total > 0) return;
  const weapons = [...getWeaponsList()];
  weapons.sort((a, b) => ((a.rarity || 1) - (b.rarity || 1)) || String(a.id).localeCompare(String(b.id)));
  weapons.slice(0, Math.min(4, weapons.length)).forEach((weapon) => { weaponState.ownedWeapons[weapon.id] = 1; });
}

// -------------------------
// 武器 / 所持 / 強化 / 売却 / ロック
// -------------------------
function getOwnedWeaponCount(weaponId) { return Math.max(0, Math.floor(Number(weaponState.ownedWeapons[weaponId] || 0))); }
function addOwnedWeapon(weaponId, count = 1) { weaponState.ownedWeapons[weaponId] = getOwnedWeaponCount(weaponId) + Math.max(1, Math.floor(Number(count) || 1)); }
function isWeaponLocked(weaponId) { return !!weaponState.lockedWeapons[weaponId]; }
function isWeaponFavorite(weaponId) { return !!weaponState.favoriteWeapons[weaponId]; }
function isWeaponProtected(weaponId) { return isWeaponLocked(weaponId) || isWeaponFavorite(weaponId); }
function setWeaponLocked(weaponId, value) { if (value) weaponState.lockedWeapons[weaponId] = true; else delete weaponState.lockedWeapons[weaponId]; }
function setWeaponFavorite(weaponId, value) { if (value) weaponState.favoriteWeapons[weaponId] = true; else delete weaponState.favoriteWeapons[weaponId]; }
function getEquippedWeaponUsageMap() { const map = new Map(); Object.values(formationState.equippedWeapons).forEach((weaponId) => { if (weaponId) map.set(weaponId, (map.get(weaponId) || 0) + 1); }); return map; }
function canEquipWeaponToSlot(weapon, slotId) {
  if (!weapon || !slotId) return false;
  if (slotId === 'protagonist') return true;
  const char = getCharacterById(slotId);
  if (!char) return false;
  const affinity = char.weaponAffinity || [];
  return !affinity.length || affinity.includes(weapon.weaponType);
}
function sanitizeEquippedWeapons() {
  const validSet = new Set(getWeaponsList().map((weapon) => weapon.id));
  Object.keys(formationState.equippedWeapons).forEach((slotId) => {
    const weaponId = formationState.equippedWeapons[slotId];
    if (!weaponId || !validSet.has(weaponId)) { formationState.equippedWeapons[slotId] = ''; return; }
    const weapon = getWeaponById(weaponId); if (!canEquipWeaponToSlot(weapon, slotId)) formationState.equippedWeapons[slotId] = '';
  });
  const usageMap = getEquippedWeaponUsageMap();
  Object.entries(formationState.equippedWeapons).forEach(([slotId, weaponId]) => {
    if (!weaponId) return;
    if ((usageMap.get(weaponId) || 0) > getOwnedWeaponCount(weaponId)) {
      formationState.equippedWeapons[slotId] = '';
      usageMap.set(weaponId, (usageMap.get(weaponId) || 1) - 1);
    }
  });
}
function getSellableWeaponCount(weaponId) {
  if (isWeaponProtected(weaponId)) return 0;
  const owned = getOwnedWeaponCount(weaponId); const equippedCount = getEquippedWeaponUsageMap().get(weaponId) || 0; const keepMinimum = Math.max(1, equippedCount);
  return Math.max(0, owned - keepMinimum);
}
function getWeaponSellValue(weapon) { return weapon ? (SELL_VALUES[weapon.rarity || 1] || 0) : 0; }
function getWeaponEnhanceLevel(weaponId) { return clamp(Number(weaponState.enhancements[weaponId] || 0), 0, WEAPON_ENHANCE_MAX); }
function getWeaponEnhanceCost(level) { return (level + 1) * WEAPON_ENHANCE_BASE_COST; }
function getEffectiveWeaponStats(weapon) { if (!weapon) return { hp: 0, atk: 0, level: 0 }; const level = getWeaponEnhanceLevel(weapon.id); const rate = 1 + (level * WEAPON_ENHANCE_RATE); return { hp: Math.floor((weapon.baseStats?.hp ?? 0) * rate), atk: Math.floor((weapon.baseStats?.atk ?? 0) * rate), level }; }
function canEnhanceWeapon(weaponId) { const weapon = getWeaponById(weaponId); if (!weapon) return false; const level = getWeaponEnhanceLevel(weaponId); return getOwnedWeaponCount(weaponId) > 0 && level < WEAPON_ENHANCE_MAX && resourceState.materialCore >= getWeaponEnhanceCost(level); }
function tryEnhanceWeapon(weaponId) {
  const weapon = getWeaponById(weaponId); if (!weapon) return false;
  const level = getWeaponEnhanceLevel(weaponId); if (level >= WEAPON_ENHANCE_MAX) { alert('最大強化済みです。'); return false; }
  const cost = getWeaponEnhanceCost(level); if (resourceState.materialCore < cost) { alert(`マテリアルコアが不足しています。必要数：${cost}`); return false; }
  resourceState.materialCore -= cost; weaponState.enhancements[weaponId] = level + 1; saveGameState(); rerenderAllSections(); alert(`${weapon.name} を +${level + 1} に強化しました。`); return true;
}
function equipWeaponToSlot(slotId, weaponId) {
  const weapon = getWeaponById(weaponId);
  if (!weapon) { alert('武器データが見つかりません。'); return false; }
  if (!canEquipWeaponToSlot(weapon, slotId)) { alert(`${weapon.name} は ${getSlotDisplayName(slotId)} に装備できません。`); return false; }
  formationState.equippedWeapons[slotId] = weapon.id; sanitizeEquippedWeapons(); saveGameState(); rerenderAllSections(); return true;
}
function trySellDuplicateWeapon(weaponId) {
  const weapon = getWeaponById(weaponId); if (!weapon) return;
  const sellable = getSellableWeaponCount(weaponId);
  if (sellable <= 0) { alert('売却できる重複分がありません。装備中の本数・最低1本・ロック/お気に入り保護を確認してください。'); return; }
  weaponState.ownedWeapons[weaponId] = getOwnedWeaponCount(weaponId) - 1; resourceState.materialCore += getWeaponSellValue(weapon); saveGameState(); rerenderAllSections(); alert(`${weapon.name} を売却しました。`); showScreen('gacha');
}
function getBulkSellTargets(options = {}) { const rarity = options.rarity || null; const targets = []; getWeaponsList().forEach((weapon) => { if (rarity && (weapon.rarity || 1) !== rarity) return; const sellable = getSellableWeaponCount(weapon.id); if (sellable > 0) targets.push({ weapon, count: sellable, totalGain: sellable * getWeaponSellValue(weapon) }); }); return targets; }
function executeBulkSell(options = {}) {
  const targets = getBulkSellTargets(options);
  if (!targets.length) { alert(options.rarity === 1 ? '売却できる★1重複武器がありません。' : '売却できる重複武器がありません。'); return; }
  let gain = 0, soldCount = 0;
  targets.forEach(({ weapon, count, totalGain }) => { weaponState.ownedWeapons[weapon.id] = getOwnedWeaponCount(weapon.id) - count; gain += totalGain; soldCount += count; });
  resourceState.materialCore += gain; saveGameState(); rerenderAllSections(); alert(`${options.rarity === 1 ? '★1重複一括売却' : '全部売却'} を実行しました。\n売却本数：${soldCount}\n獲得コア：${gain}`); showScreen('gacha');
}
function lockHighRarityWeapons() { let count = 0; getWeaponsList().forEach((weapon) => { if ((weapon.rarity || 1) >= 2 && getOwnedWeaponCount(weapon.id) > 0 && !isWeaponLocked(weapon.id)) { setWeaponLocked(weapon.id, true); count += 1; } }); saveGameState(); rerenderAllSections(); alert(count > 0 ? `★2以上の武器を ${count} 件ロックしました。` : 'ロック対象の★2以上武器はありません。'); showScreen('gacha'); }
function toggleFavoriteFromGachaResult(index) { const result = gachaState.lastResults[index]; if (!result) return; const next = !isWeaponFavorite(result.weaponId); setWeaponFavorite(result.weaponId, next); if (next) setWeaponLocked(result.weaponId, true); saveGameState(); rerenderAllSections(); alert(next ? `${result.name} をお気に入り登録しました。売却保護も有効です。` : `${result.name} のお気に入りを解除しました。`); showScreen('gacha'); }

// -------------------------
// 最終値計算 / 比較表示
// -------------------------
function getEquippedWeaponObjectsFromMap(equipMap) { return Object.values(equipMap).map((weaponId) => getWeaponById(weaponId)).filter(Boolean); }
function aggregatePartySkills(equippedWeapons) {
  const result = {};
  equippedWeapons.forEach((weapon) => {
    (weapon.partySkills || []).forEach((skill) => {
      if (!result[skill.type]) result[skill.type] = { small: 0, middle: 0, large: 0 };
      if (skill.tier === 'small') result[skill.type].small += 1;
      if (skill.tier === 'middle') result[skill.type].middle += 1;
      if (skill.tier === 'large') result[skill.type].large += 1;
    });
  });
  Object.keys(result).forEach((type) => {
    const s2m = Math.floor(result[type].small / 2); result[type].small %= 2; result[type].middle += s2m;
    const m2l = Math.floor(result[type].middle / 2); result[type].middle %= 2; result[type].large += m2l;
  });
  return result;
}
function computeAggregatedSkillRate(skillType, tiers) { const defs = gameData.weapons?.meta?.partySkillDefs?.[skillType]?.tiers; if (!defs) return 0; return (tiers.small * (defs.small?.value || 0)) + (tiers.middle * (defs.middle?.value || 0)) + (tiers.large * (defs.large?.value || 0)); }
function computeFinalStatsForSlot(slotId, equipMap) {
  const equipped = getEquippedWeaponObjectsFromMap(equipMap);
  const aggregated = aggregatePartySkills(equipped);
  const atkBonus = computeAggregatedSkillRate('atkUp', aggregated.atkUp || { small: 0, middle: 0, large: 0 });
  const hpBonus = computeAggregatedSkillRate('hpUp', aggregated.hpUp || { small: 0, middle: 0, large: 0 });
  const weapon = getWeaponById(equipMap[slotId]);
  const ew = getEffectiveWeaponStats(weapon);
  if (slotId === 'protagonist') return { finalHp: Math.floor((1 + ew.hp) * (1 + hpBonus)), finalAtk: Math.floor((1 + ew.atk) * (1 + atkBonus)), weaponName: weapon?.name || '未装備' };
  const char = getCharacterById(slotId);
  const baseHp = char?.displayStats?.baseHp ?? 0;
  const baseAtk = char?.displayStats?.baseAtk ?? 0;
  return { finalHp: Math.floor((baseHp + ew.hp) * (1 + hpBonus)), finalAtk: Math.floor((baseAtk + ew.atk) * (1 + atkBonus)), weaponName: weapon?.name || '未装備' };
}
function buildEquipComparison(slotId, newWeaponId) {
  const currentMap = { ...formationState.equippedWeapons };
  const nextMap = { ...formationState.equippedWeapons, [slotId]: newWeaponId };
  const currentStats = computeFinalStatsForSlot(slotId, currentMap);
  const nextStats = computeFinalStatsForSlot(slotId, nextMap);
  return { slotName: getSlotDisplayName(slotId), currentName: currentStats.weaponName, newName: getWeaponById(newWeaponId)?.name || '未設定', currentHp: currentStats.finalHp, currentAtk: currentStats.finalAtk, newHp: nextStats.finalHp, newAtk: nextStats.finalAtk, hpDiff: nextStats.finalHp - currentStats.finalHp, atkDiff: nextStats.finalAtk - currentStats.finalAtk };
}
function renderComparisonHtml(result) {
  const weapon = getWeaponById(result.weaponId);
  if (!weapon) return '<p class="muted">比較データなし</p>';
  const targets = [{ slotId: 'protagonist', label: '主人公' }, { slotId: 'char_towa', label: 'トワ' }, { slotId: 'char_hinano', label: 'ヒナノ' }, { slotId: 'char_suzu', label: 'スズ' }];
  const rows = targets.map((target) => {
    if (!canEquipWeaponToSlot(weapon, target.slotId)) return `<li><strong>${escapeHtml(target.label)}</strong>：<span class="muted">装備不可</span></li>`;
    const cmp = buildEquipComparison(target.slotId, result.weaponId); const hpPrefix = cmp.hpDiff > 0 ? '+' : ''; const atkPrefix = cmp.atkDiff > 0 ? '+' : '';
    return `<li><strong>${escapeHtml(target.label)}</strong>：${escapeHtml(cmp.currentName)} → ${escapeHtml(cmp.newName)}<br><span class="muted">最終HP ${escapeHtml(cmp.currentHp)} → ${escapeHtml(cmp.newHp)} (${escapeHtml(hpPrefix + cmp.hpDiff)}) / 最終ATK ${escapeHtml(cmp.currentAtk)} → ${escapeHtml(cmp.newAtk)} (${escapeHtml(atkPrefix + cmp.atkDiff)})</span></li>`;
  }).join('');
  return `<div class="info-card" style="margin-top:10px;background:rgba(15,22,48,.65);"><h4 style="margin-top:0;font-size:13px;">装備後の最終値比較</h4><ul style="margin:8px 0 0;padding-left:18px;">${rows}</ul></div>`;
}

// -------------------------
// ガチャ演出
// -------------------------
function ensureGachaFxStyles() {
  if (document.getElementById('gacha-fx-style')) return;
  const style = document.createElement('style');
  style.id = 'gacha-fx-style';
  style.textContent = `
    @keyframes gachaFlipIn {0%{transform:rotateY(90deg) scale(.92);opacity:0}100%{transform:rotateY(0) scale(1);opacity:1}}
    @keyframes gachaFlash {0%{opacity:0}10%{opacity:.86}100%{opacity:0}}
    @keyframes gachaNewPulse {0%,100%{box-shadow:0 0 0 rgba(34,197,94,0),0 8px 20px rgba(0,0,0,.25)}50%{box-shadow:0 0 24px rgba(34,197,94,.45),0 8px 20px rgba(0,0,0,.25)}}
  `;
  document.head.appendChild(style);
}
function triggerRareFlash() {
  ensureGachaFxStyles();
  let overlay = document.getElementById('gacha-flash-overlay');
  if (!overlay) {
    overlay = document.createElement('div'); overlay.id = 'gacha-flash-overlay';
    Object.assign(overlay.style, { position: 'fixed', inset: '0', pointerEvents: 'none', zIndex: '9999', background: 'radial-gradient(circle, rgba(255,239,180,0.92) 0%, rgba(255,216,106,0.48) 38%, rgba(255,216,106,0.05) 78%, rgba(255,216,106,0) 100%)', opacity: '0' });
    document.body.appendChild(overlay);
  }
  overlay.style.animation = 'none'; void overlay.offsetWidth; overlay.style.animation = 'gachaFlash 0.65s ease-out';
}
function stopRevealTimer() { if (gachaState.revealTimer) { clearInterval(gachaState.revealTimer); gachaState.revealTimer = null; } }
function getWeaponsByRarity(rarity) { return getWeaponsList().filter((weapon) => (weapon.rarity || 1) === rarity); }
function getWeightedRarity(weights) { const total = Object.values(weights).reduce((sum, value) => sum + value, 0); let roll = Math.random() * total; for (const [rarity, weight] of Object.entries(weights)) { roll -= weight; if (roll <= 0) return Number(rarity); } return 1; }
function drawWeaponWithMinimum(minRarity = 1) {
  const adjusted = {};
  Object.entries(GACHA_RARITY_WEIGHTS).forEach(([rarity, weight]) => { if (Number(rarity) >= minRarity) adjusted[rarity] = weight; });
  const rarity = getWeightedRarity(Object.keys(adjusted).length ? adjusted : GACHA_RARITY_WEIGHTS);
  let pool = getWeaponsByRarity(rarity).filter((weapon) => (weapon.rarity || 1) >= minRarity);
  if (!pool.length) pool = getWeaponsList().filter((weapon) => (weapon.rarity || 1) >= minRarity);
  if (!pool.length) pool = getWeaponsList();
  if (!pool.length) return null;
  return pool[Math.floor(Math.random() * pool.length)] || null;
}
function createResultEntry(weapon, ownershipTracker, source, guaranteed = false) {
  const beforeCount = Math.max(0, Math.floor(Number(ownershipTracker[weapon.id] || 0))); ownershipTracker[weapon.id] = beforeCount + 1; addOwnedWeapon(weapon.id, 1);
  const result = { weaponId: weapon.id, name: weapon.name, rarity: weapon.rarity || 1, source, isNew: beforeCount === 0, guaranteed, weaponType: weapon.weaponType, at: new Date().toISOString() };
  gachaState.logs.unshift(result); gachaState.logs = gachaState.logs.slice(0, GACHA_LOG_MAX); return result;
}
function resetRevealForResults(results) { stopRevealTimer(); gachaState.lastResults = results; gachaState.revealCount = 0; }
function revealResultAtIndex(index) { const result = gachaState.lastResults[index]; if (!result) return; if (index + 1 <= gachaState.revealCount) return; gachaState.revealCount = index + 1; if (result.rarity >= 3) triggerRareFlash(); saveGameState(); renderGachaSection(); }
function revealNextCard() { if (!gachaState.lastResults.length) return; revealResultAtIndex(clamp(gachaState.revealCount, 0, gachaState.lastResults.length - 1)); if (gachaState.revealCount >= gachaState.lastResults.length) stopRevealTimer(); }
function revealSingleCard(index) { revealResultAtIndex(index); }
function revealAllCards() { if (!gachaState.lastResults.length) return; gachaState.lastResults.forEach((result, index) => { if (index >= gachaState.revealCount && result.rarity >= 3) triggerRareFlash(); }); gachaState.revealCount = gachaState.lastResults.length; stopRevealTimer(); saveGameState(); renderGachaSection(); }
function startSequentialReveal() { if (!gachaState.lastResults.length) return; stopRevealTimer(); gachaState.revealTimer = setInterval(() => { if (gachaState.revealCount >= gachaState.lastResults.length) { stopRevealTimer(); return; } revealNextCard(); }, 360); }
function formatGachaResultText(results) { return results.map((item, i) => `${i + 1}. ★${item.rarity || 1} ${item.name}${item.isNew ? ' [NEW]' : ' [重複]'}`).join('\n'); }
function runSingleGacha() {
  if (!getWeaponsList().length) { alert('武器データがありません。'); return; }
  if (resourceState.materialCore < GACHA_SINGLE_COST) { alert(`マテリアルコアが不足しています。必要数：${GACHA_SINGLE_COST}`); return; }
  resourceState.materialCore -= GACHA_SINGLE_COST; const picked = drawWeaponWithMinimum(1); if (!picked) { alert('ガチャ結果の生成に失敗しました。'); return; }
  const ownershipTracker = { ...weaponState.ownedWeapons }; const result = createResultEntry(picked, ownershipTracker, 'single', false);
  resetRevealForResults([result]); saveGameState(); rerenderAllSections(); alert(`シングルガチャ結果\n\n★${result.rarity} ${result.name}${result.isNew ? ' [NEW]' : ' [重複]'}`); showScreen('gacha');
}
function runTenGacha() {
  if (!getWeaponsList().length) { alert('武器データがありません。'); return; }
  if (resourceState.materialCore < GACHA_TEN_COST) { alert(`マテリアルコアが不足しています。必要数：${GACHA_TEN_COST}`); return; }
  resourceState.materialCore -= GACHA_TEN_COST;
  const ownershipTracker = { ...weaponState.ownedWeapons }; const results = [];
  for (let i = 0; i < 9; i += 1) { const picked = drawWeaponWithMinimum(1); if (picked) results.push(createResultEntry(picked, ownershipTracker, 'ten', false)); }
  const guaranteedWeapon = drawWeaponWithMinimum(2) || drawWeaponWithMinimum(1); if (guaranteedWeapon) results.push(createResultEntry(guaranteedWeapon, ownershipTracker, 'ten', true));
  resetRevealForResults(results); saveGameState(); rerenderAllSections(); alert(`10連ガチャ結果（10枠目は★2以上保証）\n\n${formatGachaResultText(results)}`); showScreen('gacha');
}
function renderGachaLog() { if (!gachaState.logs.length) return '<p class="muted">まだガチャ結果はありません。</p>'; return `<ul>${gachaState.logs.map((log) => `<li><strong>★${escapeHtml(log.rarity)}</strong> ${escapeHtml(log.name)} <span class="muted">(${escapeHtml(log.weaponId)} / ${escapeHtml(log.source === 'ten' ? '10連' : '単発')} / ${escapeHtml(log.isNew ? 'NEW' : '重複')})</span></li>`).join('')}</ul>`; }
function renderHiddenGachaCard(result, index) { const rarityColor = getRarityColor(result.rarity); const hiddenGlow = result.rarity >= 3 ? '0 0 24px rgba(255,216,106,.35)' : '0 0 14px rgba(143,212,255,.18)'; return `<div style="border:1px dashed ${rarityColor};border-radius:16px;padding:14px;background:linear-gradient(180deg, rgba(7,10,22,1) 0%, rgba(4,6,13,1) 100%);min-height:310px;display:flex;flex-direction:column;justify-content:center;align-items:center;box-shadow:${hiddenGlow};text-align:center;"><div style="font-size:20px;letter-spacing:.08em;color:${rarityColor};font-weight:800;">REVEAL</div><div style="font-size:12px;color:#94a3b8;margin-top:10px;">${escapeHtml(index + 1)} 枠目</div><button class="text-button gacha-card-reveal-one" data-gacha-reveal-index="${escapeHtml(index)}" style="margin-top:18px;">めくる</button></div>`; }
function renderEquipButtonsHtml(result, index) { const weapon = getWeaponById(result.weaponId); const targets = [{ slotId: 'protagonist', label: '主人公' }, { slotId: 'char_towa', label: 'トワ' }, { slotId: 'char_hinano', label: 'ヒナノ' }, { slotId: 'char_suzu', label: 'スズ' }]; return `<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;width:100%;">${targets.map((target) => { const disabled = canEquipWeaponToSlot(weapon, target.slotId) ? '' : 'disabled'; return `<button class="text-button gacha-card-equip" data-gacha-equip-index="${escapeHtml(index)}" data-gacha-equip-slot="${escapeHtml(target.slotId)}" ${disabled}>${escapeHtml(target.label)} に装備</button>`; }).join('')}</div>`; }
function renderRevealedGachaCard(result, index) {
  const rarityColor = getRarityColor(result.rarity); const badgeBg = result.isNew ? '#22c55e' : '#64748b'; const weapon = getWeaponById(result.weaponId); const sellValue = getWeaponSellValue(weapon); const canSell = getSellableWeaponCount(result.weaponId) > 0; const enhanceLevel = getWeaponEnhanceLevel(result.weaponId); const enhanceLabel = enhanceLevel >= WEAPON_ENHANCE_MAX ? '強化最大' : `強化する（${getWeaponEnhanceCost(enhanceLevel)} コア）`; const canEnhance = canEnhanceWeapon(result.weaponId); const protectedLabel = isWeaponProtected(result.weaponId) ? `<div style="font-size:11px;color:#facc15;margin-top:6px;">${isWeaponFavorite(result.weaponId) ? 'お気に入り' : 'ロック中'}</div>` : ''; const favLabel = isWeaponFavorite(result.weaponId) ? '★ お気に入り解除' : '☆ お気に入り登録'; const extraGlow = result.rarity === 3 ? '0 0 28px rgba(255,216,106,.55),0 8px 26px rgba(0,0,0,.35)' : result.isNew ? '0 0 20px rgba(34,197,94,.35),0 8px 20px rgba(0,0,0,.25)' : '0 8px 20px rgba(0,0,0,.25)';
  return `<div style="border:1px solid ${rarityColor};border-radius:16px;padding:14px;background:${getRarityBg(result.rarity)};min-height:420px;display:flex;flex-direction:column;justify-content:space-between;box-shadow:${extraGlow};animation:gachaFlipIn .45s ease;${result.isNew ? 'animation:gachaFlipIn .45s ease, gachaNewPulse 1.4s ease-in-out infinite;' : ''}"><div><div style="display:flex;justify-content:space-between;align-items:center;gap:8px;"><span style="font-size:13px;color:${rarityColor};font-weight:800;">${getRarityLabel(result.rarity)}</span><span style="font-size:11px;padding:4px 8px;border-radius:999px;background:${badgeBg};color:white;">${escapeHtml(result.isNew ? 'NEW' : '重複')}</span></div><div style="font-size:12px;color:#94a3b8;margin-top:6px;">${escapeHtml(index + 1)} 枠目</div><div style="margin-top:14px;font-size:18px;font-weight:800;line-height:1.4;${result.rarity === 3 ? 'color:#fff6cf;' : ''}">${escapeHtml(result.name)}</div><div style="margin-top:8px;font-size:12px;color:#cbd5e1;">${escapeHtml(result.weaponId)} / ${escapeHtml(getWeaponTypeDisplay(weapon))} / 強化 +${escapeHtml(enhanceLevel)}</div>${result.guaranteed ? '<div style="font-size:11px;color:#fde68a;margin-top:6px;">保証枠</div>' : ''}${result.isNew ? '<div style="font-size:11px;color:#86efac;margin-top:6px;">NEWエフェクト</div>' : ''}${protectedLabel}${renderComparisonHtml(result)}</div><div style="display:flex;flex-direction:column;gap:8px;margin-top:14px;">${renderEquipButtonsHtml(result, index)}<button class="text-button gacha-card-enhance" data-gacha-enhance-index="${escapeHtml(index)}" ${canEnhance ? '' : 'disabled'}>${escapeHtml(enhanceLabel)}</button><button class="text-button gacha-card-favorite" data-gacha-favorite-index="${escapeHtml(index)}">${escapeHtml(favLabel)}</button><button class="text-button gacha-card-sell" data-gacha-sell-index="${escapeHtml(index)}" ${canSell ? '' : 'disabled'}>売却する（${escapeHtml(sellValue)} コア）</button></div></div>`;
}
function renderLastGachaResults() { ensureGachaFxStyles(); if (!gachaState.lastResults.length) return '<p class="muted">まだ最新の結果はありません。</p>'; const cards = gachaState.lastResults.map((result, index) => (index < gachaState.revealCount ? renderRevealedGachaCard(result, index) : renderHiddenGachaCard(result, index))).join(''); const cols = gachaState.lastResults.length >= 10 ? 'repeat(5, minmax(0, 1fr))' : 'repeat(auto-fit, minmax(220px, 1fr))'; return `<div class="button-group" style="max-width:none;flex-direction:row;flex-wrap:wrap;margin-bottom:12px;"><button class="text-button" id="gacha-reveal-next" ${gachaState.revealCount >= gachaState.lastResults.length ? 'disabled' : ''}>1枚ずつめくる</button><button class="text-button" id="gacha-reveal-auto" ${gachaState.revealCount >= gachaState.lastResults.length ? 'disabled' : ''}>順番にめくる</button><button class="text-button" id="gacha-reveal-all" ${gachaState.revealCount >= gachaState.lastResults.length ? 'disabled' : ''}>すべてめくる</button></div><div style="display:grid;grid-template-columns:${cols};gap:12px;margin-top:8px;">${cards}</div>`; }
function renderOwnedWeaponsSummary() { const weapons = getWeaponsList().filter((weapon) => getOwnedWeaponCount(weapon.id) > 0); if (!weapons.length) return '<p class="muted">所持武器なし</p>'; const grouped = { 1: [], 2: [], 3: [] }; weapons.forEach((weapon) => { grouped[weapon.rarity || 1].push(weapon); }); return [1, 2, 3].map((rarity) => { const list = grouped[rarity] || []; if (!list.length) return `<h4>★${rarity}</h4><p class="muted">なし</p>`; return `<h4>★${rarity}</h4><ul>${list.map((weapon) => { const ew = getEffectiveWeaponStats(weapon); const marks = `${isWeaponFavorite(weapon.id) ? ' / お気に入り' : ''}${isWeaponLocked(weapon.id) ? ' / ロック' : ''}`; return `<li><strong>${escapeHtml(weapon.name)}</strong> <span class="muted">[${escapeHtml(getWeaponTypeDisplay(weapon))} / 所持 ${escapeHtml(getOwnedWeaponCount(weapon.id))} / 売却可 ${escapeHtml(getSellableWeaponCount(weapon.id))} / +${escapeHtml(ew.level)}${escapeHtml(marks)}]</span><br><span class="muted">HP ${escapeHtml(ew.hp)} / ATK ${escapeHtml(ew.atk)}</span></li>`; }).join('')}</ul>`; }).join(''); }
function attachGachaEvents() {
  document.getElementById('gacha-single-button')?.addEventListener('click', runSingleGacha);
  document.getElementById('gacha-ten-button')?.addEventListener('click', runTenGacha);
  document.getElementById('gacha-reveal-next')?.addEventListener('click', revealNextCard);
  document.getElementById('gacha-reveal-auto')?.addEventListener('click', startSequentialReveal);
  document.getElementById('gacha-reveal-all')?.addEventListener('click', revealAllCards);
  document.getElementById('gacha-bulk-sell-star1')?.addEventListener('click', () => executeBulkSell({ rarity: 1 }));
  document.getElementById('gacha-bulk-sell-all')?.addEventListener('click', () => executeBulkSell({}));
  document.getElementById('gacha-lock-high-rarity')?.addEventListener('click', lockHighRarityWeapons);
  document.querySelectorAll('[data-gacha-reveal-index]').forEach((button) => button.addEventListener('click', () => revealSingleCard(Number(button.getAttribute('data-gacha-reveal-index')))));
  document.querySelectorAll('[data-gacha-equip-index]').forEach((button) => { const index = Number(button.getAttribute('data-gacha-equip-index')); const slotId = button.getAttribute('data-gacha-equip-slot'); button.addEventListener('click', () => { const result = gachaState.lastResults[index]; if (!result) return; const ok = equipWeaponToSlot(slotId, result.weaponId); if (!ok) return; const weapon = getWeaponById(result.weaponId); alert(`${weapon?.name || result.name} を ${getSlotDisplayName(slotId)} に装備しました。`); showScreen('gacha'); }); });
  document.querySelectorAll('[data-gacha-enhance-index]').forEach((button) => button.addEventListener('click', () => { const result = gachaState.lastResults[Number(button.getAttribute('data-gacha-enhance-index'))]; if (!result) return; const ok = tryEnhanceWeapon(result.weaponId); if (ok) showScreen('gacha'); }));
  document.querySelectorAll('[data-gacha-favorite-index]').forEach((button) => button.addEventListener('click', () => toggleFavoriteFromGachaResult(Number(button.getAttribute('data-gacha-favorite-index')))));
  document.querySelectorAll('[data-gacha-sell-index]').forEach((button) => button.addEventListener('click', () => { const result = gachaState.lastResults[Number(button.getAttribute('data-gacha-sell-index'))]; if (!result) return; trySellDuplicateWeapon(result.weaponId); }));
}
function renderGachaSection() {
  const screen = document.getElementById('screen-gacha'); if (!screen || !gameData.weapons) return; const container = screen.querySelector('.screen-inner'); if (!container) return; clearDynamicCards(container);
  const bulkStar1Targets = getBulkSellTargets({ rarity: 1 }); const bulkAllTargets = getBulkSellTargets({}); const bulkStar1Count = bulkStar1Targets.reduce((sum, item) => sum + item.count, 0); const bulkStar1Gain = bulkStar1Targets.reduce((sum, item) => sum + item.totalGain, 0); const bulkAllCount = bulkAllTargets.reduce((sum, item) => sum + item.count, 0); const bulkAllGain = bulkAllTargets.reduce((sum, item) => sum + item.totalGain, 0);
  const resourceCard = createInfoCard(); resourceCard.innerHTML = renderResourceSummaryCard('ガチャ・売却に使う所持数');
  const gachaCard = createInfoCard(); gachaCard.innerHTML = `<h3>武器ガチャ（完成版）</h3><p class="muted">シングルガチャは ${GACHA_SINGLE_COST} コア、10連ガチャは ${GACHA_TEN_COST} コアです。</p><ul><li>通常確率：★1 70% / ★2 25% / ★3 5%</li><li>10連の10枠目は <strong>★2以上1枠保証（仮）</strong></li></ul><div class="button-group" style="max-width:none;flex-direction:row;flex-wrap:wrap;"><button class="text-button" id="gacha-single-button" ${resourceState.materialCore < GACHA_SINGLE_COST ? 'disabled' : ''}>シングルガチャ（${GACHA_SINGLE_COST} コア）</button><button class="text-button" id="gacha-ten-button" ${resourceState.materialCore < GACHA_TEN_COST ? 'disabled' : ''}>10連ガチャ（${GACHA_TEN_COST} コア）</button></div>`;
  const latestCard = createInfoCard(); latestCard.innerHTML = `<h3>最新のガチャ結果</h3><p class="muted">比較表示 / キャラ別装備 / 強化 / お気に入り / 売却 / 演出に対応。</p>${renderLastGachaResults()}`;
  const bulkCard = createInfoCard(); bulkCard.innerHTML = `<h3>一括操作</h3><div class="status-row"><span>★1重複 売却対象</span><strong>${escapeHtml(bulkStar1Count)} 本 / ${escapeHtml(bulkStar1Gain)} コア</strong></div><div class="status-row"><span>全部売却 対象</span><strong>${escapeHtml(bulkAllCount)} 本 / ${escapeHtml(bulkAllGain)} コア</strong></div><div class="button-group" style="max-width:none;flex-direction:row;flex-wrap:wrap;margin-top:12px;"><button class="text-button" id="gacha-bulk-sell-star1" ${bulkStar1Count > 0 ? '' : 'disabled'}>★1重複を一括売却</button><button class="text-button" id="gacha-bulk-sell-all" ${bulkAllCount > 0 ? '' : 'disabled'}>全部売却（売却可能分）</button><button class="text-button" id="gacha-lock-high-rarity">★2以上だけロック</button></div><p class="muted" style="margin-top:12px;">ロック済み・お気に入り済み武器は一括売却対象外です。</p>`;
  const logCard = createInfoCard(); logCard.innerHTML = `<h3>最近のガチャ履歴</h3>${renderGachaLog()}`;
  const ownedCard = createInfoCard(); ownedCard.innerHTML = `<h3>所持武器一覧</h3>${renderOwnedWeaponsSummary()}`;
  container.appendChild(resourceCard); container.appendChild(gachaCard); container.appendChild(latestCard); container.appendChild(bulkCard); container.appendChild(logCard); container.appendChild(ownedCard); attachGachaEvents();
}

// -------------------------
// 戦闘 v1.3
// -------------------------
function ensureBattleFxStyles() {
  if (document.getElementById('battle-fx-style')) return;
  const style = document.createElement('style');
  style.id = 'battle-fx-style';
  style.textContent = `
    @keyframes battleDamagePop {0%{transform:translateY(8px) scale(.85);opacity:0}20%{transform:translateY(0) scale(1.08);opacity:1}100%{transform:translateY(-24px) scale(1);opacity:0}}
    @keyframes battleHitShake {0%,100%{transform:translateX(0)}20%{transform:translateX(-4px)}40%{transform:translateX(4px)}60%{transform:translateX(-3px)}80%{transform:translateX(3px)}}
    @keyframes battleBurstGlow {0%{opacity:0;transform:scale(.9)}20%{opacity:1;transform:scale(1.02)}100%{opacity:0;transform:scale(1)}}
    @keyframes battleVictoryGlow {0%{opacity:0;transform:translateY(12px) scale(.96)}100%{opacity:1;transform:translateY(0) scale(1)}}
  `;
  document.head.appendChild(style);
}
function addRewards(materialCore = 0, exp = 0) { resourceState.materialCore += Number(materialCore) || 0; resourceState.exp += Number(exp) || 0; }
function initializePartyCommands(enemyList) { const defaultTarget = enemyList[0]?.id || ''; battleUiState.partyCommands = { char_towa: { action: 'attack', targetId: defaultTarget }, char_hinano: { action: 'attack', targetId: defaultTarget }, char_suzu: { action: 'attack', targetId: defaultTarget } }; battleUiState.protagonistCommand = 'wait'; battleUiState.targetPickerMember = 'char_towa'; }
function createPlayerUnit(slotId) { if (slotId === 'protagonist') { const stats = computeFinalStatsForSlot('protagonist', formationState.equippedWeapons); return { id:'protagonist', name:'主人公', maxHp:Math.max(1,stats.finalHp), hp:Math.max(1,stats.finalHp), atk:Math.max(1,stats.finalAtk), gauge:0, alive:true, guarding:false, taunt:0, damagePopups:[], hitFlashUntil:0, defeatedFlashUntil:0 }; } const char = getCharacterById(slotId); const stats = computeFinalStatsForSlot(slotId, formationState.equippedWeapons); return { id:slotId, name:char?.name || slotId, maxHp:Math.max(1,stats.finalHp), hp:Math.max(1,stats.finalHp), atk:Math.max(1,stats.finalAtk), gauge:0, alive:true, guarding:false, taunt:0, damagePopups:[], hitFlashUntil:0, defeatedFlashUntil:0, combat:char?.combat || {} }; }
function createEnemyUnit(ref) { const tmpl = getEnemyTemplateById(ref.enemyId); return { id:ref.instanceId, enemyId:ref.enemyId, name:tmpl?.name || ref.enemyId, maxHp:Math.max(1,tmpl?.displayStats?.hp || 1), hp:Math.max(1,tmpl?.displayStats?.hp || 1), atk:Math.max(1,tmpl?.displayStats?.atk || 1), gauge:0, alive:true, guarding:false, taunt:0, skillCooldown:0, damagePopups:[], hitFlashUntil:0, defeatedFlashUntil:0, nextIntent:null, combat:tmpl?.combat || {} }; }
function cleanBattleTransientEffects(runtime) { if (!runtime) return; const now = Date.now(); [...runtime.party, ...runtime.enemies].forEach((unit) => { unit.damagePopups = (unit.damagePopups || []).filter((item) => now - item.ts < 900); if (unit.hitFlashUntil && now > unit.hitFlashUntil) unit.hitFlashUntil = 0; if (unit.defeatedFlashUntil && now > unit.defeatedFlashUntil) unit.defeatedFlashUntil = 0; }); if (runtime.burstFx && now > runtime.burstFx.until) runtime.burstFx = null; if (runtime.victoryFx && now > runtime.victoryFx.until) runtime.victoryFx = null; }
function pushBattlePopup(unit, value, kind) { if (!unit) return; if (!unit.damagePopups) unit.damagePopups = []; unit.damagePopups.push({ value, kind, ts: Date.now() }); unit.hitFlashUntil = Date.now() + 320; if (!unit.alive) unit.defeatedFlashUntil = Date.now() + 650; }
function setBurstFx(runtime, text, rare = false) { runtime.burstFx = { text, rare, until: Date.now() + 950 }; }
function setVictoryFx(runtime, text) { runtime.victoryFx = { text, until: Date.now() + 1600 }; }
function createBattleRuntime(battle) { const runtime = { party:[createPlayerUnit('protagonist'),createPlayerUnit('char_towa'),createPlayerUnit('char_hinano'),createPlayerUnit('char_suzu')], enemies:(battle.enemyGroup || []).map(createEnemyUnit), turnBuffs:{ attackBoost:0, defenseReduce:0 }, burstFx:null, victoryFx:null }; initializePartyCommands(runtime.enemies); planEnemyIntents(runtime, battle); return runtime; }
function getAliveUnits(units) { return units.filter((unit) => unit.alive && unit.hp > 0); }
function getUnitById(units, id) { return units.find((unit) => unit.id === id) || null; }
function getTargetableEnemies() { return getAliveUnits(battleUiState.runtime?.enemies || []); }
function getFirstAlive(units) { return getAliveUnits(units)[0] || null; }
function applyDamage(target, amount, popupKind = 'damage') { if (!target || !target.alive) return 0; const actual = Math.max(1, Math.min(target.hp, Math.floor(amount))); target.hp = Math.max(0, target.hp - actual); if (target.hp <= 0) { target.hp = 0; target.alive = false; } pushBattlePopup(target, actual, popupKind); return actual; }
function recoverHp(target, amount) { if (!target || !target.alive) return 0; const actual = Math.max(0, Math.min(target.maxHp - target.hp, Math.floor(amount))); if (actual <= 0) return 0; target.hp += actual; pushBattlePopup(target, actual, 'heal'); return actual; }
function addGauge(unit, amount) { if (!unit || !unit.alive) return; unit.gauge = clamp((unit.gauge || 0) + amount, 0, 100); }
function tickStatuses(runtime) { runtime.party.forEach((unit) => { if (unit.taunt > 0) unit.taunt -= 1; }); runtime.enemies.forEach((unit) => { if (unit.taunt > 0) unit.taunt -= 1; if (unit.skillCooldown > 0) unit.skillCooldown -= 1; }); }
function applyGuardSelection(runtime) { runtime.party.forEach((unit) => { unit.guarding = false; if (unit.id === 'protagonist' || !unit.alive) return; const action = battleUiState.partyCommands[unit.id]?.action || 'attack'; if (action === 'guard') unit.guarding = true; }); }
function applyProtagonistCommand(runtime, context, logs) { const cmd = battleUiState.protagonistCommand; if (cmd === 'attack-order') { context.atkBoostRate += COMMAND_RULES.attackBoost; logs.push(`主人公の攻撃指示：味方ATKが ${Math.round(COMMAND_RULES.attackBoost * 100)}% 上昇。`); } else if (cmd === 'defense-order') { context.incomingReduceRate += COMMAND_RULES.defenseReduce; logs.push(`主人公の防御指示：味方被ダメージ ${Math.round(COMMAND_RULES.defenseReduce * 100)}% 軽減。`); } else if (cmd === 'focus-order') { runtime.party.filter((unit) => unit.alive && unit.id !== 'protagonist').forEach((unit) => addGauge(unit, COMMAND_RULES.focusGauge)); logs.push(`主人公の集中指示：味方必殺ゲージ +${COMMAND_RULES.focusGauge}。`); } else { logs.push('主人公は待機した。'); } }
function calcPlayerDamage(attacker, multiplier, context) { const critRate = CRIT_RATES[attacker.id] ?? CRIT_RATES.default; const isCritical = randChance(critRate); const base = attacker.atk * multiplier * (1 + (context.atkBoostRate || 0)); const raw = isCritical ? base * CRIT_MULTIPLIER : base; return { amount: Math.max(1, Math.floor(raw)), isCritical }; }
function calcEnemyDamage(attacker, multiplier, target, context) { let dmg = Math.max(1, Math.floor(attacker.atk * multiplier)); let reduced = false; if (target.guarding) { dmg = Math.max(1, Math.floor(dmg * (1 - COMMAND_RULES.guardReduction))); reduced = true; } if ((context.incomingReduceRate || 0) > 0) { dmg = Math.max(1, Math.floor(dmg * (1 - context.incomingReduceRate))); reduced = true; } return { amount: dmg, reduced }; }
function chooseEnemyTarget(runtime, enemy) { const aliveParty = getAliveUnits(runtime.party); if (!aliveParty.length) return null; const taunter = aliveParty.find((unit) => unit.taunt > 0); if (taunter) return taunter; const mode = enemy.combat?.ai?.targeting || 'front'; if (mode === 'lowest_hp') return aliveParty.slice().sort((a, b) => a.hp - b.hp)[0]; return aliveParty[0]; }
function chooseEnemyAction(enemy) { if ((enemy.gauge || 0) >= (enemy.combat?.burst?.gaugeCost || 100)) return { type:'burst', name:enemy.combat?.burst?.name || '必殺技', multiplier:enemy.combat?.burst?.multiplier || 2.0, cooldown:0 }; if ((enemy.skillCooldown || 0) <= 0 && randChance(enemy.combat?.ai?.skillChance || 0.35)) return { type:'skill', name:enemy.combat?.skill?.name || 'スキル', multiplier:enemy.combat?.skill?.multiplier || 1.2, cooldown:enemy.combat?.skill?.cooldown || 2 }; return { type:'attack', name:enemy.combat?.normalAttackName || '通常攻撃', multiplier:1.0, cooldown:0 }; }
function planEnemyIntents(runtime, battle) { runtime.enemies.forEach((enemy) => { if (!enemy.alive) { enemy.nextIntent = null; return; } const intent = chooseEnemyAction(enemy); enemy.nextIntent = { ...intent, isBossDanger: battle?.battleType === 'boss' && intent.type === 'burst' }; }); }
function getSelectedTarget(runtime, actorId) { const selectedId = battleUiState.partyCommands[actorId]?.targetId || ''; const enemy = getUnitById(runtime.enemies, selectedId); if (enemy && enemy.alive) return enemy; return getFirstAlive(runtime.enemies); }
function executeSingleHit(actor, target, amountInfo, logs, label) { const popupKind = amountInfo.isCritical ? 'critical' : 'damage'; const actual = applyDamage(target, amountInfo.amount, popupKind); const critText = amountInfo.isCritical ? '【クリティカル】' : ''; logs.push(`${actor.name} の${label}${critText}！ ${target.name} に ${actual} ダメージ。`); if (!target.alive) logs.push(`${target.name} を撃破した。`); }
function executePlayerActions(runtime, context, logs) {
  ['char_towa', 'char_hinano', 'char_suzu'].forEach((id) => {
    const actor = getUnitById(runtime.party, id); if (!actor || !actor.alive) return;
    const command = battleUiState.partyCommands[id] || { action:'attack', targetId:'' };
    if (command.action === 'guard') { addGauge(actor, GAUGE_RULES.guard); logs.push(`${actor.name} は防御。被ダメージを ${Math.round(COMMAND_RULES.guardReduction * 100)}% 軽減し、ゲージ +${GAUGE_RULES.guard}。`); return; }
    if (command.action === 'burst' && (actor.gauge || 0) < GAUGE_RULES.burstReady) { logs.push(`${actor.name} は必殺ゲージ不足のため通常攻撃に切り替えた。`); command.action = 'attack'; }
    if (id === 'char_hinano' && (command.action === 'skill' || command.action === 'burst')) {
      const multiplier = command.action === 'burst' ? (actor.combat?.burst?.multiplier || 1.75) : (actor.combat?.skill?.multiplier || 1.05);
      const targets = getAliveUnits(runtime.enemies); if (!targets.length) return;
      if (command.action === 'burst') setBurstFx(runtime, `${actor.name} ${actor.combat?.burst?.name || '必殺技'}！`, true);
      targets.forEach((target) => { const amountInfo = calcPlayerDamage(actor, multiplier, context); executeSingleHit(actor, target, amountInfo, logs, command.action === 'burst' ? `必殺技「${actor.combat?.burst?.name || '必殺技'}」` : `スキル「${actor.combat?.skill?.name || 'スキル'}」`); });
      const healTarget = getAliveUnits(runtime.party).slice().sort((a, b) => (a.hp / a.maxHp) - (b.hp / b.maxHp))[0];
      if (healTarget) { const healAmount = Math.floor(healTarget.maxHp * (command.action === 'burst' ? 0.14 : 0.08)); const healed = recoverHp(healTarget, healAmount); if (healed > 0) logs.push(`${actor.name} の支援効果で ${healTarget.name} が ${healed} 回復。`); }
      if (command.action === 'burst') actor.gauge = 0; else addGauge(actor, actor.combat?.skill?.gaugeGain ?? GAUGE_RULES.skillUse); return;
    }
    const target = getSelectedTarget(runtime, id); if (!target) return;
    if (id === 'char_suzu' && command.action === 'skill') { const amountInfo = calcPlayerDamage(actor, actor.combat?.skill?.multiplier || 1.1, context); executeSingleHit(actor, target, amountInfo, logs, `スキル「${actor.combat?.skill?.name || 'スキル'}」`); actor.taunt = actor.combat?.skill?.tauntTurns || 2; actor.guarding = true; addGauge(actor, actor.combat?.skill?.gaugeGain ?? GAUGE_RULES.skillUse); logs.push(`${actor.name} は挑発状態になった。敵の攻撃を引きつける。`); return; }
    if (id === 'char_suzu' && command.action === 'burst') { setBurstFx(runtime, `${actor.name} ${actor.combat?.burst?.name || '必殺技'}！`, true); const amountInfo = calcPlayerDamage(actor, actor.combat?.burst?.multiplier || 1.95, context); executeSingleHit(actor, target, amountInfo, logs, `必殺技「${actor.combat?.burst?.name || '必殺技'}」`); actor.taunt = actor.combat?.burst?.tauntTurns || 2; actor.gauge = 0; logs.push(`${actor.name} は必殺と同時に挑発状態になった。`); return; }
    if (command.action === 'skill') { const amountInfo = calcPlayerDamage(actor, actor.combat?.skill?.multiplier || 1.25, context); executeSingleHit(actor, target, amountInfo, logs, `スキル「${actor.combat?.skill?.name || 'スキル'}」`); addGauge(actor, actor.combat?.skill?.gaugeGain ?? GAUGE_RULES.skillUse); return; }
    if (command.action === 'burst') { setBurstFx(runtime, `${actor.name} ${actor.combat?.burst?.name || '必殺技'}！`, true); const amountInfo = calcPlayerDamage(actor, actor.combat?.burst?.multiplier || 2.0, context); executeSingleHit(actor, target, amountInfo, logs, `必殺技「${actor.combat?.burst?.name || '必殺技'}」`); actor.gauge = 0; return; }
    const amountInfo = calcPlayerDamage(actor, 1.0, context); executeSingleHit(actor, target, amountInfo, logs, `通常攻撃「${actor.combat?.normalAttackName || '通常攻撃'}」`); addGauge(actor, GAUGE_RULES.normalAttack);
  });
}
function executeEnemyActions(runtime, context, logs) { runtime.enemies.forEach((enemy) => { if (!enemy.alive) return; const target = chooseEnemyTarget(runtime, enemy); if (!target) return; const choice = enemy.nextIntent || chooseEnemyAction(enemy); if (choice.type === 'burst') setBurstFx(runtime, `${enemy.name} ${choice.name}！`, true); const amountInfo = calcEnemyDamage(enemy, choice.multiplier, target, context); const popupKind = amountInfo.reduced ? 'guard' : 'damage'; const actual = applyDamage(target, amountInfo.amount, popupKind); logs.push(`${enemy.name} の${choice.type === 'attack' ? '通常攻撃' : choice.type === 'skill' ? 'スキル' : '必殺技'}「${choice.name}」！ ${target.name} に ${actual} ダメージ。`); if (choice.type === 'attack') addGauge(enemy, GAUGE_RULES.normalAttack); if (choice.type === 'skill') { addGauge(enemy, GAUGE_RULES.skillUse); enemy.skillCooldown = choice.cooldown || 2; } if (choice.type === 'burst') enemy.gauge = 0; if (target.alive) addGauge(target, GAUGE_RULES.damageTaken); if (amountInfo.reduced) logs.push(`${target.name} はガード軽減により被ダメージを抑えた。`); if (!target.alive) logs.push(`${target.name} は戦闘不能になった。`); }); }
function checkBattleEnd(runtime) { const enemiesAlive = getAliveUnits(runtime.enemies).length; const partyAlive = getAliveUnits(runtime.party).length; if (enemiesAlive === 0) return 'victory'; if (partyAlive === 0) return 'defeat'; return null; }
function buildBattleRewardResult(battle, status) { if (status !== 'victory') return { status:'defeat', title:'敗北', lines:['報酬はありません。装備や行動を見直して再挑戦しましょう。'], rewards:{ materialCore:0, exp:0 } }; const newlyCleared = !progressState.clearedBattles.includes(battle.id); let materialCore = 0, exp = 0; const lines = []; if (newlyCleared) { materialCore += battle.firstClearReward?.materialCore ?? 0; exp += battle.firstClearReward?.exp ?? 0; progressState.clearedBattles.push(battle.id); lines.push(`初回クリア報酬：マテリアルコア ${battle.firstClearReward?.materialCore ?? 0} / EXP ${battle.firstClearReward?.exp ?? 0}`); } else { exp += battle.repeatReward?.exp ?? 0; lines.push(`再挑戦報酬：EXP ${battle.repeatReward?.exp ?? 0}`); } addRewards(materialCore, exp); saveGameState(); lines.push(`現在の所持数：マテリアルコア ${resourceState.materialCore} / EXP ${resourceState.exp}`); return { status:'victory', title:'勝利', lines, rewards:{ materialCore, exp } }; }
function executeBattleTurn() {
  const battle = getBattleById(battleUiState.currentBattleId); const runtime = battleUiState.runtime; if (!battle || !runtime || battleUiState.result) return;
  battleUiState.turnCount += 1; tickStatuses(runtime); cleanBattleTransientEffects(runtime);
  const logs = [`--- ターン ${battleUiState.turnCount} ---`]; const context = { atkBoostRate:0, incomingReduceRate:0 };
  applyGuardSelection(runtime); applyProtagonistCommand(runtime, context, logs); executePlayerActions(runtime, context, logs);
  let status = checkBattleEnd(runtime); if (!status) executeEnemyActions(runtime, context, logs); status = status || checkBattleEnd(runtime);
  if (status) { battleUiState.result = buildBattleRewardResult(battle, status); logs.push(...battleUiState.result.lines); if (status === 'victory') setVictoryFx(runtime, 'VICTORY'); }
  else { planEnemyIntents(runtime, battle); logs.push('ターン終了。次ターンの行動予告を更新。'); }
  battleUiState.turnLogs.unshift(logs); battleUiState.turnLogs = battleUiState.turnLogs.slice(0, 8); renderBattleUi();
}
function resetBattle() { if (!battleUiState.currentBattleId) return; openBattleUi(battleUiState.currentBattleId); }
function openBattleUi(battleId) { const battle = getBattleById(battleId); if (!battle) return; battleUiState.currentBattleId = battleId; battleUiState.runtime = createBattleRuntime(battle); battleUiState.turnCount = 0; battleUiState.turnLogs = []; battleUiState.result = null; battleUiState.targetPickerMember = 'char_towa'; renderBattleUi(); }
function renderDamagePopups(unit) { const popups = (unit.damagePopups || []).slice(-3); if (!popups.length) return ''; return `<div style="position:absolute;inset:0;pointer-events:none;overflow:visible;">${popups.map((popup, index) => { const color = popup.kind === 'critical' ? '#fbbf24' : popup.kind === 'guard' ? '#60a5fa' : popup.kind === 'heal' ? '#86efac' : '#fca5a5'; const sign = popup.kind === 'heal' ? '+' : '-'; const label = popup.kind === 'critical' ? ' CRIT' : popup.kind === 'guard' ? ' GUARD' : popup.kind === 'heal' ? ' HEAL' : ''; return `<div style="position:absolute;right:12px;top:${8 + (index * 20)}px;font-weight:800;color:${color};text-shadow:0 0 8px rgba(0,0,0,.45);animation:battleDamagePop .85s ease-out both;">${sign}${escapeHtml(popup.value)}${label}</div>`; }).join('')}</div>`; }
function renderEnemyTargetBadge(unit) { const selectedMember = battleUiState.targetPickerMember; const isSelected = selectedMember && battleUiState.partyCommands[selectedMember]?.targetId === unit.id; return isSelected ? `<div style="position:absolute;top:10px;left:10px;padding:4px 8px;border-radius:999px;background:#38bdf8;color:#07203a;font-size:11px;font-weight:800;">選択中</div>` : ''; }
function renderEnemyIntent(enemy) { if (!enemy.alive || !enemy.nextIntent) return '<p class="muted" style="margin-top:8px;">敵行動予告：なし</p>'; const typeLabel = enemy.nextIntent.type === 'attack' ? '通常' : enemy.nextIntent.type === 'skill' ? 'スキル' : '必殺'; const danger = enemy.nextIntent.isBossDanger ? '<span style="color:#f87171;font-weight:800;">危険攻撃予告</span>' : ''; return `<p class="muted" style="margin-top:8px;">敵行動予告：${escapeHtml(typeLabel)} / ${escapeHtml(enemy.nextIntent.name)} ${danger}</p>`; }
function renderBattleBurstFx(runtime) { if (!runtime?.burstFx) return ''; return `<div style="position:sticky;top:0;z-index:5;margin-bottom:8px;padding:12px 14px;border-radius:16px;background:linear-gradient(90deg, rgba(255,216,106,.28), rgba(248,113,113,.18));border:1px solid rgba(255,216,106,.45);text-align:center;font-weight:800;letter-spacing:.04em;animation:battleBurstGlow .9s ease-out both;">${escapeHtml(runtime.burstFx.text)}</div>`; }
function renderBattleVictoryFx(runtime) { if (!runtime?.victoryFx) return ''; return `<div style="margin:0 0 12px;padding:16px;border-radius:18px;background:linear-gradient(135deg, rgba(16,185,129,.30), rgba(34,197,94,.18));border:1px solid rgba(134,239,172,.45);text-align:center;font-size:24px;font-weight:900;letter-spacing:.08em;animation:battleVictoryGlow .45s ease-out both;">${escapeHtml(runtime.victoryFx.text)}</div>`; }
function renderBattleUnitBox(unit, isEnemy = false) {
  const hitStyle = unit.hitFlashUntil && Date.now() < unit.hitFlashUntil ? 'animation:battleHitShake .28s ease;' : '';
  const isSelected = isEnemy && battleUiState.targetPickerMember && battleUiState.partyCommands[battleUiState.targetPickerMember]?.targetId === unit.id;
  const selectedOutline = isSelected ? 'box-shadow:0 0 0 2px #38bdf8,0 10px 24px rgba(0,0,0,.25);border-color:#38bdf8;' : '';
  const defeatedStyle = unit.defeatedFlashUntil && Date.now() < unit.defeatedFlashUntil ? 'filter:grayscale(.15) brightness(1.12);' : '';
  const clickAttr = isEnemy && unit.alive ? `data-enemy-target="${escapeHtml(unit.id)}"` : '';
  return `<div class="info-card battle-unit-card" ${clickAttr} style="position:relative;margin-top:10px;opacity:${unit.alive ? 1 : 0.58};cursor:${isEnemy && unit.alive ? 'pointer' : 'default'};${hitStyle}${selectedOutline}${defeatedStyle}">${isEnemy ? renderEnemyTargetBadge(unit) : ''}<h5 style="margin:0 0 8px;">${escapeHtml(unit.name)}</h5><p class="muted" style="margin:0;">HP ${escapeHtml(unit.hp)} / ${escapeHtml(unit.maxHp)} / ATK ${escapeHtml(unit.atk)}</p><p class="muted" style="margin:6px 0 0;">ゲージ ${escapeHtml(unit.gauge)} / 100 ${unit.guarding && !isEnemy ? '/ 防御中' : ''} ${unit.taunt > 0 ? '/ 挑発' : ''}</p><div style="height:10px;border-radius:999px;background:#1f2c54;margin-top:8px;overflow:hidden;"><div style="height:100%;width:${escapeHtml(Math.max(0, Math.min(100, (unit.hp / Math.max(1, unit.maxHp)) * 100)))}%;background:${isEnemy ? 'linear-gradient(90deg,#fb7185,#f43f5e)' : 'linear-gradient(90deg,#60a5fa,#38bdf8)'};"></div></div>${renderDamagePopups(unit)}${isEnemy ? renderEnemyIntent(unit) : ''}${isEnemy && unit.alive ? '<div style="margin-top:8px;font-size:11px;color:#94a3b8;">敵HPバーをクリックしてターゲット設定</div>' : ''}</div>`;
}
function renderTargetAssist(memberId) { const enemies = getTargetableEnemies(); if (!enemies.length) return '<p class="muted">敵なし</p>'; const targetId = battleUiState.partyCommands[memberId]?.targetId || enemies[0]?.id || ''; const targetName = getUnitById(battleUiState.runtime?.enemies || [], targetId)?.name || '未選択'; const active = battleUiState.targetPickerMember === memberId; return `<div style="margin-top:8px;"><button class="text-button battle-pick-target ${active ? 'is-selected' : ''}" data-pick-target="${escapeHtml(memberId)}">${escapeHtml(active ? 'ターゲット指定中' : 'このキャラのターゲットを選ぶ')}</button><p class="muted" style="margin-top:8px;">現在ターゲット：${escapeHtml(targetName)}</p></div>`; }
function renderBattleCommandControls(runtime) { const protagonistButtons = `<div class="button-group" style="max-width:none;flex-direction:row;flex-wrap:wrap;"><button class="text-button battle-protagonist-command ${battleUiState.protagonistCommand === 'attack-order' ? 'is-selected' : ''}" data-protagonist-command="attack-order">攻撃指示 (+5%)</button><button class="text-button battle-protagonist-command ${battleUiState.protagonistCommand === 'defense-order' ? 'is-selected' : ''}" data-protagonist-command="defense-order">防御指示 (10%軽減)</button><button class="text-button battle-protagonist-command ${battleUiState.protagonistCommand === 'focus-order' ? 'is-selected' : ''}" data-protagonist-command="focus-order">集中指示 (ゲージ+5)</button><button class="text-button battle-protagonist-command ${battleUiState.protagonistCommand === 'wait' ? 'is-selected' : ''}" data-protagonist-command="wait">待機</button></div>`; const members = getAliveUnits(runtime.party.filter((unit) => unit.id !== 'protagonist')); return `<div class="info-card" style="margin-top:12px;"><h4 style="margin-top:0;">主人公コマンド</h4>${protagonistButtons}<p class="muted" style="margin-top:10px;">通常攻撃 +20 / スキル +5 / 被ダメ +10 / 防御 +10 / 100で必殺可</p></div>${members.map((unit) => { const cmd = battleUiState.partyCommands[unit.id] || { action:'attack', targetId:'' }; const targetRequired = !(cmd.action === 'guard' || (unit.combat?.role === 'aoe_support' && (cmd.action === 'skill' || cmd.action === 'burst'))); return `<div class="info-card" style="margin-top:12px;"><h4 style="margin-top:0;">${escapeHtml(unit.name)} の行動</h4><p class="muted">役割：${escapeHtml(unit.combat?.role || '-')} / ゲージ ${escapeHtml(unit.gauge)} / 100</p><div class="button-group" style="max-width:none;flex-direction:row;flex-wrap:wrap;"><button class="text-button battle-party-command ${cmd.action === 'attack' ? 'is-selected' : ''}" data-party-id="${escapeHtml(unit.id)}" data-party-command="attack">通常攻撃</button><button class="text-button battle-party-command ${cmd.action === 'skill' ? 'is-selected' : ''}" data-party-id="${escapeHtml(unit.id)}" data-party-command="skill">スキル</button><button class="text-button battle-party-command ${cmd.action === 'burst' ? 'is-selected' : ''}" data-party-id="${escapeHtml(unit.id)}" data-party-command="burst" ${unit.gauge >= 100 ? '' : 'disabled'}>必殺技</button><button class="text-button battle-party-command ${cmd.action === 'guard' ? 'is-selected' : ''}" data-party-id="${escapeHtml(unit.id)}" data-party-command="guard">防御</button></div>${targetRequired ? renderTargetAssist(unit.id) : '<p class="muted" style="margin-top:8px;">この行動はターゲット指定不要</p>'}<p class="muted" style="margin-top:8px;">スキル：${escapeHtml(unit.combat?.skill?.description || '-')}</p></div>`; }).join('')}`; }
function renderBattleLog() { if (!battleUiState.turnLogs.length) return '<p class="muted">まだ戦闘ログはありません。「この行動で1ターン進む」を押してください。</p>'; return battleUiState.turnLogs.map((turn) => `<div class="info-card" style="margin-top:8px;background:#0f1630;"><ul>${turn.map((line) => `<li>${escapeHtml(line)}</li>`).join('')}</ul></div>`).join(''); }
function renderBattleResultPanel() { if (!battleUiState.result) return ''; const r = battleUiState.result; const color = r.status === 'victory' ? '#7cf3d0' : '#fda4af'; return `<div class="info-card" style="margin-top:12px;border-color:${color};"><h4 style="margin-top:0;color:${color};">${escapeHtml(r.title)}</h4><p class="muted">獲得報酬：マテリアルコア ${escapeHtml(r.rewards.materialCore)} / EXP ${escapeHtml(r.rewards.exp)}</p><ul>${r.lines.map((line) => `<li>${escapeHtml(line)}</li>`).join('')}</ul></div>`; }
function attachBattleUiEvents() { document.querySelectorAll('[data-protagonist-command]').forEach((button) => button.addEventListener('click', () => { battleUiState.protagonistCommand = button.getAttribute('data-protagonist-command'); renderBattleUi(); })); document.querySelectorAll('[data-party-command]').forEach((button) => button.addEventListener('click', () => { const id = button.getAttribute('data-party-id'); const cmd = button.getAttribute('data-party-command'); if (!battleUiState.partyCommands[id]) battleUiState.partyCommands[id] = { action:'attack', targetId:'' }; battleUiState.partyCommands[id].action = cmd; if (cmd !== 'guard') battleUiState.targetPickerMember = id; renderBattleUi(); })); document.querySelectorAll('[data-pick-target]').forEach((button) => button.addEventListener('click', () => { battleUiState.targetPickerMember = button.getAttribute('data-pick-target'); renderBattleUi(); })); document.querySelectorAll('[data-enemy-target]').forEach((card) => card.addEventListener('click', () => { const enemyId = card.getAttribute('data-enemy-target'); const memberId = battleUiState.targetPickerMember; if (!memberId || !battleUiState.partyCommands[memberId]) return; battleUiState.partyCommands[memberId].targetId = enemyId; renderBattleUi(); })); document.getElementById('battle-execute-turn')?.addEventListener('click', executeBattleTurn); document.getElementById('battle-reset')?.addEventListener('click', resetBattle); document.getElementById('battle-close')?.addEventListener('click', () => { battleUiState.currentBattleId = null; battleUiState.runtime = null; battleUiState.turnCount = 0; battleUiState.turnLogs = []; battleUiState.result = null; renderBattleUi(); }); }
function renderBattleUi() { ensureBattleFxStyles(); const card = document.getElementById('battle-ui-card'); if (!card) return; const battle = getBattleById(battleUiState.currentBattleId); const runtime = battleUiState.runtime; if (!battle || !runtime) { card.innerHTML = '<h3>戦闘本実装 v1.3</h3><p class="muted">「バトルUIを開く」を押すと、ここに戦闘UIが表示されます。</p>'; return; } cleanBattleTransientEffects(runtime); card.innerHTML = `<h3>${escapeHtml(battle.title)}</h3><p class="muted">戦闘本実装 v1.3：ダメージ色分け（通常 / クリティカル / ガード軽減 / 回復） / 敵行動予告（通常 / スキル / 必殺 / ボス危険攻撃予告） / 敵HPバークリックターゲット指定。</p>${renderBattleBurstFx(runtime)}${battleUiState.result?.status === 'victory' ? renderBattleVictoryFx(runtime) : ''}<div class="info-card" style="margin-top:12px;"><h4 style="margin-top:0;">味方ユニット</h4>${runtime.party.map((unit) => renderBattleUnitBox(unit, false)).join('')}</div><div class="info-card" style="margin-top:12px;"><h4 style="margin-top:0;">敵ユニット（HPバークリックでターゲット選択）</h4>${runtime.enemies.map((unit) => renderBattleUnitBox(unit, true)).join('')}</div>${renderBattleCommandControls(runtime)}<div class="info-card" style="margin-top:12px;"><h4 style="margin-top:0;">戦闘ログ</h4>${renderBattleLog()}</div>${renderBattleResultPanel()}<div class="button-group" style="margin-top:18px;max-width:none;flex-direction:row;flex-wrap:wrap;"><button class="text-button" id="battle-execute-turn" ${battleUiState.result ? 'disabled' : ''}>この行動で1ターン進む</button><button class="text-button" id="battle-reset">バトルをリセット</button><button class="text-button" id="battle-close">閉じる</button></div>`; attachBattleUiEvents(); }

// -------------------------
// 冒険 / 編成 / ナビ
// -------------------------
function openBattlePreview(battleId) { const battle = getBattleById(battleId); const readerCard = document.getElementById('story-reader-card'); if (!battle || !readerCard) return; const enemyList = (battle.enemyGroup || []).map((enemy) => `${getEnemyTemplateById(enemy.enemyId)?.name || enemy.enemyId} (${enemy.instanceId})`); readerCard.innerHTML = `<h3>${escapeHtml(battle.title)}</h3><p class="muted">${escapeHtml(battle.id)} / ${escapeHtml(battle.battleType)}</p><div class="info-card" style="margin-top:16px;"><h3 style="margin-top:0;">敵編成</h3><ul>${enemyList.map((name) => `<li>${escapeHtml(name)}</li>`).join('')}</ul><p class="muted">初回報酬：コア ${escapeHtml(battle.firstClearReward?.materialCore ?? 0)} / EXP ${escapeHtml(battle.firstClearReward?.exp ?? 0)}</p><p class="muted">再挑戦報酬：EXP ${escapeHtml(battle.repeatReward?.exp ?? 0)}</p></div><div class="button-group" style="margin-top:18px;max-width:none;flex-direction:row;"><button class="text-button" id="battle-close-button">閉じる</button></div>`; document.getElementById('battle-close-button')?.addEventListener('click', () => { storyReaderState.currentStoryId = null; storyReaderState.currentSceneIndex = 0; renderStoryReader(); }); }
function getStoryUnlockText(story, characterMap) { const ids = story.unlockCharacters || []; if (!ids.length) return ''; const names = ids.map((id) => characterMap.get(id)?.name || id); return `加入: ${names.join(' / ')}`; }
function attachAdventureButtons() { document.querySelectorAll('.story-open-button').forEach((button) => button.addEventListener('click', () => openStoryReader(button.getAttribute('data-story-id')))); document.querySelectorAll('.battle-preview-button').forEach((button) => button.addEventListener('click', () => openBattlePreview(button.getAttribute('data-battle-id')))); document.querySelectorAll('.battle-open-button').forEach((button) => button.addEventListener('click', () => openBattleUi(button.getAttribute('data-battle-id')))); }
function renderAdventureSection() { const screen = document.getElementById('screen-adventure'); if (!screen || !gameData.story || !gameData.battles) return; const container = screen.querySelector('.screen-inner'); if (!container) return; clearDynamicCards(container); const stories = gameData.story.stories || []; const battles = gameData.battles.battles || []; const chapterTitle = gameData.story.meta?.chapterTitle || '第1章'; const characterMap = new Map(getCharactersList().map((char) => [char.id, char])); const nodeOrder = ['story_1_1', 'story_1_2', 'battle_1_1', 'story_1_3', 'battle_1_2', 'battle_1_3']; const storyMap = new Map(stories.map((i) => [i.id, i])); const battleMap = new Map(battles.map((i) => [i.id, i])); const resourceCard = createInfoCard(); resourceCard.innerHTML = renderResourceSummaryCard('現在の所持数'); const timelineCard = createInfoCard(); timelineCard.innerHTML = `<h3>${escapeHtml(chapterTitle)}</h3><ol class="story-list">${nodeOrder.map((id) => { const story = storyMap.get(id); const battle = battleMap.get(id); if (story) { const unlockText = getStoryUnlockText(story, characterMap); return `<li><strong>ストーリー</strong>：${escapeHtml(story.title)} <span class="muted">(${escapeHtml(story.id)})</span><br>${unlockText ? `<span class="muted">${escapeHtml(unlockText)}</span><br>` : ''}<button class="text-button story-open-button" data-story-id="${escapeHtml(story.id)}">本文を読む</button></li>`; } if (battle) { const reward = `初回: コア ${battle.firstClearReward?.materialCore ?? 0} / EXP ${battle.firstClearReward?.exp ?? 0}`; const repeat = `再挑戦: EXP ${battle.repeatReward?.exp ?? 0}`; const cleared = progressState.clearedBattles.includes(battle.id) ? ' / クリア済み' : ''; return `<li><strong>バトル</strong>：${escapeHtml(battle.title)} <span class="muted">(${escapeHtml(battle.id)}${escapeHtml(cleared)})</span><br><span class="muted">${escapeHtml(reward)}</span><br><span class="muted">${escapeHtml(repeat)}</span><br><button class="text-button battle-preview-button" data-battle-id="${escapeHtml(battle.id)}">バトル情報</button> <button class="text-button battle-open-button" data-battle-id="${escapeHtml(battle.id)}">バトルUIを開く</button></li>`; } return `<li>${escapeHtml(id)}</li>`; }).join('')}</ol>`; const reader = createInfoCard('story-reader-card'); reader.innerHTML = '<h3>ストーリー本文ビューア</h3><p class="muted">「本文を読む」を押すとここに表示されます。</p>'; const battleCard = createInfoCard('battle-ui-card'); battleCard.innerHTML = '<h3>戦闘本実装 v1.3</h3><p class="muted">「バトルUIを開く」を押すと、ここに戦闘UIが表示されます。</p>'; container.appendChild(resourceCard); container.appendChild(timelineCard); container.appendChild(reader); container.appendChild(battleCard); attachAdventureButtons(); }
function getAvailableWeaponsForSlot(slotId) { return getWeaponsList().filter((weapon) => { if (!canEquipWeaponToSlot(weapon, slotId)) return false; const usage = getEquippedWeaponUsageMap(); const owned = getOwnedWeaponCount(weapon.id); const current = formationState.equippedWeapons[slotId] === weapon.id ? 1 : 0; return owned - ((usage.get(weapon.id) || 0) - current) > 0; }); }
function renderFormationSection() { const screen = document.getElementById('screen-formation'); if (!screen || !gameData.characters || !gameData.weapons) return; const container = screen.querySelector('.screen-inner'); if (!container) return; clearDynamicCards(container); const resourceCard = createInfoCard(); resourceCard.innerHTML = renderResourceSummaryCard('現在の所持数'); const equipCard = createInfoCard(); const slots = ['protagonist', 'char_towa', 'char_hinano', 'char_suzu']; equipCard.innerHTML = `<h3>編成</h3>${slots.map((slotId) => { const current = formationState.equippedWeapons[slotId] || ''; const options = ['<option value="">未装備</option>', ...getAvailableWeaponsForSlot(slotId).map((weapon) => `<option value="${escapeHtml(weapon.id)}" ${weapon.id === current ? 'selected' : ''}>${escapeHtml(weapon.name)} [${escapeHtml(getWeaponTypeDisplay(weapon))} / 所持 ${escapeHtml(getOwnedWeaponCount(weapon.id))} / +${escapeHtml(getWeaponEnhanceLevel(weapon.id))}]</option>`)].join(''); const stats = computeFinalStatsForSlot(slotId, formationState.equippedWeapons); return `<div class="info-card" style="margin-top:12px;"><h4 style="margin-top:0;">${escapeHtml(getSlotDisplayName(slotId))}</h4><select data-equip-slot="${escapeHtml(slotId)}" style="width:100%;padding:10px;border-radius:12px;border:1px solid #2d3966;background:#0f1630;color:#eef2ff;">${options}</select><p class="muted" style="margin-top:8px;">最終HP ${escapeHtml(stats.finalHp)} / 最終ATK ${escapeHtml(stats.finalAtk)}</p></div>`; }).join('')}`; const enhanceCard = createInfoCard(); enhanceCard.innerHTML = `<h3>武器強化</h3>${getWeaponsList().filter((weapon) => getOwnedWeaponCount(weapon.id) > 0).map((weapon) => { const ew = getEffectiveWeaponStats(weapon); const nextCost = getWeaponEnhanceCost(ew.level); return `<div class="info-card" style="margin-top:12px;"><strong>${escapeHtml(weapon.name)}</strong> <span class="muted">(+${escapeHtml(ew.level)} / 所持 ${escapeHtml(getOwnedWeaponCount(weapon.id))})</span><br><span class="muted">HP ${escapeHtml(ew.hp)} / ATK ${escapeHtml(ew.atk)}</span><br><button class="text-button" data-weapon-enhance="${escapeHtml(weapon.id)}" ${canEnhanceWeapon(weapon.id) ? '' : 'disabled'}>強化する（${escapeHtml(nextCost)} コア）</button></div>`; }).join('') || '<p class="muted">所持武器なし</p>'}`; container.appendChild(resourceCard); container.appendChild(equipCard); container.appendChild(enhanceCard); attachFormationEvents(); }
function attachFormationEvents() { document.querySelectorAll('[data-equip-slot]').forEach((select) => select.addEventListener('change', () => { formationState.equippedWeapons[select.getAttribute('data-equip-slot')] = select.value; sanitizeEquippedWeapons(); saveGameState(); renderFormationSection(); })); document.querySelectorAll('[data-weapon-enhance]').forEach((button) => button.addEventListener('click', () => tryEnhanceWeapon(button.getAttribute('data-weapon-enhance')))); }

// -------------------------
// ナビ / 起動
// -------------------------
function setupNavigation() { document.querySelector('[data-action="start"]')?.addEventListener('click', () => showScreen('menu')); document.querySelector('[data-action="load"]')?.addEventListener('click', () => { const loaded = loadSaveData(); if (loaded) { sanitizeOwnedWeapons(); sanitizeWeaponEnhancements(); sanitizeProtectedWeapons(); sanitizeEquippedWeapons(); rerenderAllSections(); alert('保存済みデータを読み込みました。'); showScreen('menu'); } else { alert('保存データがありません。'); } }); document.querySelector('[data-action="settings"]')?.addEventListener('click', () => alert('設定画面は後続実装予定です。')); document.querySelectorAll('[data-screen]').forEach((button) => button.addEventListener('click', () => showScreen(button.getAttribute('data-screen')))); document.querySelectorAll('[data-back]').forEach((button) => button.addEventListener('click', () => showScreen(button.getAttribute('data-back')))); }
async function bootstrapGameData() { try { const [storyRes, charRes, battleRes, weaponRes] = await Promise.allSettled([loadJson('story.json'), loadJson('characters.json'), loadJson('battles.json'), loadJson('weapons.json')]); gameData.story = storyRes.status === 'fulfilled' ? storyRes.value : { meta: { chapterTitle: '第1章' }, stories: [] }; gameData.characters = charRes.status === 'fulfilled' ? charRes.value : { meta: {}, characters: [] }; gameData.battles = battleRes.status === 'fulfilled' ? battleRes.value : { meta: {}, battles: [], enemyTemplates: [] }; gameData.weapons = weaponRes.status === 'fulfilled' ? weaponRes.value : { meta: {}, weapons: [] }; loadSaveData(); return true; } catch (error) { console.error(error); renderLoadError(error); return false; } }
function renderLoadError(error) { ['screen-adventure', 'screen-formation', 'screen-gacha'].map((id) => document.getElementById(id)).forEach((screen) => { if (!screen) return; const container = screen.querySelector('.screen-inner'); if (!container) return; clearDynamicCards(container); const card = createInfoCard(); card.innerHTML = `<h3>データ読み込みエラー</h3><p class="muted">${escapeHtml(error.message)}</p><p class="muted">ローカルサーバーまたは Cloudflare Pages 上で確認してください。</p>`; container.appendChild(card); }); }

document.addEventListener('DOMContentLoaded', () => { setupNavigation(); bootstrapGameData().then((ok) => { if (!ok) return; initializeStarterWeaponsIfNeeded(); sanitizeOwnedWeapons(); sanitizeWeaponEnhancements(); sanitizeProtectedWeapons(); sanitizeEquippedWeapons(); saveGameState(); rerenderAllSections(); }); });
