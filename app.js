// ナイト・オール・スクール
// 統合版 MVP
// - ストーリー / バトル / 編成 / ガチャ / 武器強化 / 売却
// - ガチャ結果カード：NEW / 重複 判定、キャラ別「装備する」、強化する、売却する、お気に入り
// - 追加機能:
//   1) 装備後の最終HP / 最終ATK をリアルタイム比較表示
//   2) 一括操作（全部売却 / ★2以上だけロック / お気に入り登録）
//   3) ガチャ演出強化（カードめくり / 順番公開 / ★3フラッシュ / NEW発光）

const STORAGE_KEY = 'night-all-school-save-v14';
const WEAPON_ENHANCE_MAX = 10;
const WEAPON_ENHANCE_RATE = 0.10;
const WEAPON_ENHANCE_BASE_COST = 10;
const GACHA_SINGLE_COST = 50;
const GACHA_TEN_COST = 500;
const GACHA_RARITY_WEIGHTS = { 1: 70, 2: 25, 3: 5 };
const GACHA_LOG_MAX = 30;
const SELL_VALUES = { 1: 5, 2: 15, 3: 50 };

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
const formationState = {
  equippedWeapons: { protagonist: '', char_towa: '', char_hinano: '', char_suzu: '' }
};
const progressState = { clearedBattles: [] };
const resourceState = { materialCore: 0, exp: 0 };
const weaponState = {
  enhancements: {},
  ownedWeapons: {},
  lockedWeapons: {},
  favoriteWeapons: {}
};
const gachaState = {
  logs: [],
  lastResults: [],
  revealCount: 0,
  revealTimer: null
};
const battleUiState = {
  currentBattleId: null,
  protagonistAction: 'wait',
  partyChoices: {
    char_towa: { useSkill: false, useBurst: false, action: 'attack' },
    char_hinano: { useSkill: false, useBurst: false, action: 'attack' },
    char_suzu: { useSkill: false, useBurst: false, action: 'attack' }
  },
  turnCount: 0,
  turnLog: [],
  runtime: null,
  result: null
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

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function createInfoCard(id = '') {
  const card = document.createElement('div');
  card.className = 'info-card dynamic-card';
  if (id) card.id = id;
  return card;
}

function clearDynamicCards(container) {
  container.querySelectorAll('.dynamic-card').forEach((card) => card.remove());
}

function showScreen(name) {
  Object.values(screens).forEach((screen) => {
    if (screen) screen.classList.remove('active');
  });
  if (screens[name]) screens[name].classList.add('active');
}

async function loadJson(path) {
  const response = await fetch(path, { cache: 'no-store' });
  if (!response.ok) throw new Error(`${path} の読み込みに失敗しました (${response.status})`);
  return response.json();
}

function renderResourceSummaryCard(title = '現在の所持数') {
  return `
    <h3>${escapeHtml(title)}</h3>
    <div class="status-row"><span>マテリアルコア</span><strong>${escapeHtml(resourceState.materialCore)}</strong></div>
    <div class="status-row"><span>EXP</span><strong>${escapeHtml(resourceState.exp)}</strong></div>
    <p class="muted" style="margin-top: 12px;">勝利報酬・武器強化・ガチャ結果・売却結果は localStorage に保存されます。</p>
  `;
}

function rerenderAllSections() {
  renderAdventureSection();
  renderFormationSection();
  renderGachaSection();
}

function stopRevealTimer() {
  if (gachaState.revealTimer) {
    clearInterval(gachaState.revealTimer);
    gachaState.revealTimer = null;
  }
}

function ensureGachaFxStyles() {
  if (document.getElementById('gacha-fx-style')) return;
  const style = document.createElement('style');
  style.id = 'gacha-fx-style';
  style.textContent = `
    @keyframes gachaFlipIn {
      0% { transform: rotateY(90deg) scale(0.92); opacity: 0; }
      100% { transform: rotateY(0deg) scale(1); opacity: 1; }
    }
    @keyframes gachaFlash {
      0% { opacity: 0; }
      10% { opacity: 0.86; }
      100% { opacity: 0; }
    }
    @keyframes gachaNewPulse {
      0%, 100% { box-shadow: 0 0 0 rgba(34,197,94,0.0), 0 8px 20px rgba(0,0,0,0.25); }
      50% { box-shadow: 0 0 24px rgba(34,197,94,0.45), 0 8px 20px rgba(0,0,0,0.25); }
    }
  `;
  document.head.appendChild(style);
}

function triggerRareFlash() {
  ensureGachaFxStyles();
  let overlay = document.getElementById('gacha-flash-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'gacha-flash-overlay';
    overlay.style.position = 'fixed';
    overlay.style.inset = '0';
    overlay.style.pointerEvents = 'none';
    overlay.style.zIndex = '9999';
    overlay.style.background = 'radial-gradient(circle, rgba(255,239,180,0.92) 0%, rgba(255,216,106,0.48) 38%, rgba(255,216,106,0.05) 78%, rgba(255,216,106,0) 100%)';
    overlay.style.opacity = '0';
    document.body.appendChild(overlay);
  }
  overlay.style.animation = 'none';
  void overlay.offsetWidth;
  overlay.style.animation = 'gachaFlash 0.65s ease-out';
}

function getRarityColor(rarity) {
  if (rarity === 3) return '#ffd86a';
  if (rarity === 2) return '#8fd4ff';
  return '#c7d2fe';
}

function getRarityBg(rarity) {
  if (rarity === 3) return 'radial-gradient(circle at top, rgba(255,216,106,0.22), rgba(9,13,28,1) 72%)';
  if (rarity === 2) return 'radial-gradient(circle at top, rgba(143,212,255,0.18), rgba(9,13,28,1) 72%)';
  return 'linear-gradient(180deg, rgba(15,22,48,1) 0%, rgba(9,13,28,1) 100%)';
}

function getRarityLabel(rarity) {
  return `★${rarity || 1}`;
}

function getCharactersList() {
  return gameData.characters?.characters || [];
}

function getWeaponsList() {
  return gameData.weapons?.weapons || [];
}

function getWeaponById(weaponId) {
  return getWeaponsList().find((weapon) => weapon.id === weaponId) || null;
}

function getWeaponTypeMap() {
  return new Map(Object.entries(gameData.weapons?.meta?.weaponTypeRules || {}));
}

function getWeaponTypeDisplay(weapon) {
  if (!weapon) return '未設定';
  const typeMap = getWeaponTypeMap();
  return weapon.weaponTypeDisplay || typeMap.get(weapon.weaponType)?.displayName || weapon.weaponType;
}

function getCharacterById(charId) {
  return getCharactersList().find((char) => char.id === charId) || null;
}

function getSlotDisplayName(slotId) {
  if (slotId === 'protagonist') return '主人公';
  return getCharacterById(slotId)?.name || slotId;
}

// -------------------------
// セーブ / ロード
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
      version: 'mvp-v2.2',
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
    console.error('saveGameState error:', error);
    if (showMessage) alert('保存に失敗しました。ブラウザ設定を確認してください。');
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
    resourceState.materialCore = Number(parsed?.resources?.materialCore ?? defaults.resources.materialCore) || 0;
    resourceState.exp = Number(parsed?.resources?.exp ?? defaults.resources.exp) || 0;
    weaponState.enhancements = parsed?.weaponEnhancements && typeof parsed.weaponEnhancements === 'object' ? { ...parsed.weaponEnhancements } : {};
    weaponState.ownedWeapons = parsed?.ownedWeapons && typeof parsed.ownedWeapons === 'object' ? { ...parsed.ownedWeapons } : {};
    weaponState.lockedWeapons = parsed?.lockedWeapons && typeof parsed.lockedWeapons === 'object' ? { ...parsed.lockedWeapons } : {};
    weaponState.favoriteWeapons = parsed?.favoriteWeapons && typeof parsed.favoriteWeapons === 'object' ? { ...parsed.favoriteWeapons } : {};
    gachaState.logs = Array.isArray(parsed?.gachaLogs) ? parsed.gachaLogs.slice(0, GACHA_LOG_MAX) : [];
    gachaState.lastResults = Array.isArray(parsed?.lastGachaResults) ? parsed.lastGachaResults.slice(0, 10) : [];
    gachaState.revealCount = clamp(Number(parsed?.gachaRevealCount ?? defaults.gachaRevealCount) || 0, 0, 10);
    return true;
  } catch (error) {
    console.error('loadSaveData error:', error);
    return false;
  }
}

function resetFormationState() {
  formationState.equippedWeapons = { ...getDefaultSaveState().equippedWeapons };
}

function sanitizeWeaponEnhancements() {
  const validSet = new Set(getWeaponsList().map((weapon) => weapon.id));
  const nextState = {};
  Object.entries(weaponState.enhancements).forEach(([weaponId, level]) => {
    if (!validSet.has(weaponId)) return;
    nextState[weaponId] = clamp(Number(level) || 0, 0, WEAPON_ENHANCE_MAX);
  });
  weaponState.enhancements = nextState;
}

function sanitizeOwnedWeapons() {
  const validSet = new Set(getWeaponsList().map((weapon) => weapon.id));
  const nextState = {};
  Object.entries(weaponState.ownedWeapons).forEach(([weaponId, count]) => {
    if (!validSet.has(weaponId)) return;
    nextState[weaponId] = Math.max(0, Math.floor(Number(count) || 0));
  });
  weaponState.ownedWeapons = nextState;
}

function sanitizeProtectedWeapons() {
  const validSet = new Set(getWeaponsList().map((weapon) => weapon.id));
  const nextLocked = {};
  const nextFav = {};
  Object.entries(weaponState.lockedWeapons).forEach(([weaponId, locked]) => {
    if (validSet.has(weaponId) && locked) nextLocked[weaponId] = true;
  });
  Object.entries(weaponState.favoriteWeapons).forEach(([weaponId, marked]) => {
    if (validSet.has(weaponId) && marked) nextFav[weaponId] = true;
  });
  weaponState.lockedWeapons = nextLocked;
  weaponState.favoriteWeapons = nextFav;
}

function initializeStarterWeaponsIfNeeded() {
  const currentTotal = Object.values(weaponState.ownedWeapons).reduce((sum, count) => sum + (Number(count) || 0), 0);
  if (currentTotal > 0) return;
  const weapons = [...getWeaponsList()];
  if (!weapons.length) return;
  weapons.sort((a, b) => {
    if ((a.rarity || 1) !== (b.rarity || 1)) return (a.rarity || 1) - (b.rarity || 1);
    return String(a.id).localeCompare(String(b.id));
  });
  weapons.slice(0, Math.min(4, weapons.length)).forEach((weapon) => {
    weaponState.ownedWeapons[weapon.id] = 1;
  });
}

// -------------------------
// 武器所持 / 強化 / 売却 / 保護
// -------------------------

function addRewards(materialCore = 0, exp = 0) {
  resourceState.materialCore += Number(materialCore) || 0;
  resourceState.exp += Number(exp) || 0;
}

function getOwnedWeaponCount(weaponId) {
  return Math.max(0, Math.floor(Number(weaponState.ownedWeapons[weaponId] || 0)));
}

function addOwnedWeapon(weaponId, count = 1) {
  weaponState.ownedWeapons[weaponId] = getOwnedWeaponCount(weaponId) + Math.max(1, Math.floor(Number(count) || 1));
}

function isWeaponLocked(weaponId) {
  return !!weaponState.lockedWeapons[weaponId];
}

function isWeaponFavorite(weaponId) {
  return !!weaponState.favoriteWeapons[weaponId];
}

function isWeaponProtected(weaponId) {
  return isWeaponLocked(weaponId) || isWeaponFavorite(weaponId);
}

function setWeaponLocked(weaponId, value) {
  if (value) weaponState.lockedWeapons[weaponId] = true;
  else delete weaponState.lockedWeapons[weaponId];
}

function setWeaponFavorite(weaponId, value) {
  if (value) weaponState.favoriteWeapons[weaponId] = true;
  else delete weaponState.favoriteWeapons[weaponId];
}

function toggleFavoriteFromGachaResult(index) {
  const result = gachaState.lastResults[index];
  if (!result) return;
  const weaponId = result.weaponId;
  const next = !isWeaponFavorite(weaponId);
  setWeaponFavorite(weaponId, next);
  if (next) setWeaponLocked(weaponId, true);
  saveGameState();
  rerenderAllSections();
  alert(next ? `${result.name} をお気に入り登録しました。売却保護も有効です。` : `${result.name} のお気に入りを解除しました。`);
  showScreen('gacha');
}

function lockHighRarityWeapons() {
  let count = 0;
  getWeaponsList().forEach((weapon) => {
    if ((weapon.rarity || 1) >= 2 && getOwnedWeaponCount(weapon.id) > 0 && !isWeaponLocked(weapon.id)) {
      setWeaponLocked(weapon.id, true);
      count += 1;
    }
  });
  saveGameState();
  rerenderAllSections();
  alert(count > 0 ? `★2以上の武器を ${count} 件ロックしました。` : 'ロック対象の★2以上武器はありません。');
  showScreen('gacha');
}

function getEquippedWeaponUsageMap() {
  const map = new Map();
  Object.values(formationState.equippedWeapons).forEach((weaponId) => {
    if (!weaponId) return;
    map.set(weaponId, (map.get(weaponId) || 0) + 1);
  });
  return map;
}

function canEquipWeaponToSlot(weapon, slotId) {
  if (!weapon || !slotId) return false;
  if (slotId === 'protagonist') return true;
  const char = getCharacterById(slotId);
  if (!char) return false;
  const affinity = char.weaponAffinity || [];
  return !affinity.length || affinity.includes(weapon.weaponType);
}

function sanitizeEquippedWeapons() {
  const weapons = getWeaponsList();
  const weaponSet = new Set(weapons.map((weapon) => weapon.id));
  Object.keys(formationState.equippedWeapons).forEach((slotId) => {
    const weaponId = formationState.equippedWeapons[slotId];
    if (!weaponId || !weaponSet.has(weaponId)) {
      formationState.equippedWeapons[slotId] = '';
      return;
    }
    const weapon = getWeaponById(weaponId);
    if (!canEquipWeaponToSlot(weapon, slotId)) {
      formationState.equippedWeapons[slotId] = '';
    }
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
  const owned = getOwnedWeaponCount(weaponId);
  const equippedCount = getEquippedWeaponUsageMap().get(weaponId) || 0;
  const keepMinimum = Math.max(1, equippedCount);
  return Math.max(0, owned - keepMinimum);
}

function getWeaponSellValue(weapon) {
  if (!weapon) return 0;
  return SELL_VALUES[weapon.rarity || 1] || 0;
}

function getBulkSellTargets(options = {}) {
  const { rarity = null } = options;
  const targets = [];
  getWeaponsList().forEach((weapon) => {
    if (rarity && (weapon.rarity || 1) !== rarity) return;
    const sellable = getSellableWeaponCount(weapon.id);
    if (sellable > 0) {
      targets.push({ weapon, count: sellable, totalGain: sellable * getWeaponSellValue(weapon) });
    }
  });
  return targets;
}

function executeBulkSell(options = {}) {
  const targets = getBulkSellTargets(options);
  if (!targets.length) {
    alert(options.rarity === 1 ? '売却できる★1重複武器がありません。' : '売却できる重複武器がありません。');
    return;
  }
  let gain = 0;
  let soldCount = 0;
  targets.forEach(({ weapon, count, totalGain }) => {
    weaponState.ownedWeapons[weapon.id] = getOwnedWeaponCount(weapon.id) - count;
    gain += totalGain;
    soldCount += count;
  });
  resourceState.materialCore += gain;
  saveGameState();
  rerenderAllSections();
  const label = options.rarity === 1 ? '★1重複一括売却' : '全部売却';
  alert(`${label} を実行しました。\n売却本数：${soldCount}\n獲得コア：${gain}`);
  showScreen('gacha');
}

function trySellDuplicateWeapon(weaponId) {
  const weapon = getWeaponById(weaponId);
  if (!weapon) {
    alert('武器データが見つかりません。');
    return;
  }
  const sellable = getSellableWeaponCount(weaponId);
  if (sellable <= 0) {
    alert('この武器は売却できる重複分がありません。装備中の本数・最低1本・ロック/お気に入り保護を確認してください。');
    return;
  }
  const gain = getWeaponSellValue(weapon);
  weaponState.ownedWeapons[weaponId] = getOwnedWeaponCount(weaponId) - 1;
  resourceState.materialCore += gain;
  saveGameState();
  rerenderAllSections();
  alert(`${weapon.name} を1本売却し、マテリアルコア ${gain} を獲得しました。`);
  showScreen('gacha');
}

function getWeaponEnhanceLevel(weaponId) {
  return clamp(Number(weaponState.enhancements[weaponId] || 0), 0, WEAPON_ENHANCE_MAX);
}

function getWeaponEnhanceCost(level) {
  return (level + 1) * WEAPON_ENHANCE_BASE_COST;
}

function getEffectiveWeaponStats(weapon) {
  if (!weapon) return { hp: 0, atk: 0, level: 0, rate: 0 };
  const level = getWeaponEnhanceLevel(weapon.id);
  const rate = 1 + (level * WEAPON_ENHANCE_RATE);
  return {
    hp: Math.floor((weapon.baseStats?.hp ?? 0) * rate),
    atk: Math.floor((weapon.baseStats?.atk ?? 0) * rate),
    level,
    rate
  };
}

function canEnhanceWeapon(weaponId) {
  const weapon = getWeaponById(weaponId);
  if (!weapon) return false;
  if (getOwnedWeaponCount(weaponId) <= 0) return false;
  const level = getWeaponEnhanceLevel(weaponId);
  if (level >= WEAPON_ENHANCE_MAX) return false;
  return resourceState.materialCore >= getWeaponEnhanceCost(level);
}

function tryEnhanceWeapon(weaponId) {
  const weapon = getWeaponById(weaponId);
  if (!weapon) {
    alert('武器データが見つかりません。');
    return false;
  }
  if (getOwnedWeaponCount(weaponId) <= 0) {
    alert('この武器をまだ所持していません。');
    return false;
  }
  const level = getWeaponEnhanceLevel(weaponId);
  if (level >= WEAPON_ENHANCE_MAX) {
    alert('この武器は最大強化済みです。');
    return false;
  }
  const cost = getWeaponEnhanceCost(level);
  if (resourceState.materialCore < cost) {
    alert(`マテリアルコアが不足しています。必要数：${cost}`);
    return false;
  }
  resourceState.materialCore -= cost;
  weaponState.enhancements[weaponId] = level + 1;
  saveGameState();
  rerenderAllSections();
  alert(`${weapon.name} を +${level + 1} に強化しました。`);
  return true;
}

function enhanceWeaponFromGachaResult(index) {
  const result = gachaState.lastResults[index];
  if (!result) return;
  const ok = tryEnhanceWeapon(result.weaponId);
  if (ok) showScreen('gacha');
}

function equipWeaponToSlot(slotId, weaponId) {
  const weapon = getWeaponById(weaponId);
  if (!weapon) {
    alert('武器データが見つかりません。');
    return false;
  }
  if (!canEquipWeaponToSlot(weapon, slotId)) {
    alert(`${weapon.name} は ${getSlotDisplayName(slotId)} に装備できません。`);
    return false;
  }
  formationState.equippedWeapons[slotId] = weapon.id;
  sanitizeEquippedWeapons();
  saveGameState();
  rerenderAllSections();
  return true;
}

function equipWeaponToSlotFromGachaResult(index, slotId) {
  const result = gachaState.lastResults[index];
  if (!result) return;
  const ok = equipWeaponToSlot(slotId, result.weaponId);
  if (!ok) return;
  const weapon = getWeaponById(result.weaponId);
  alert(`${weapon?.name || result.name} を ${getSlotDisplayName(slotId)} に装備しました。`);
  showScreen('gacha');
}

function sellWeaponFromGachaResult(index) {
  const result = gachaState.lastResults[index];
  if (!result) return;
  trySellDuplicateWeapon(result.weaponId);
}

function canSellWeaponFromResult(result) {
  return getSellableWeaponCount(result.weaponId) > 0;
}

// -------------------------
// 最終値・比較表示
// -------------------------

function getEquippedWeaponObjectsFromMap(equipMap, weapons) {
  return Object.values(equipMap).map((weaponId) => weapons.find((weapon) => weapon.id === weaponId)).filter(Boolean);
}

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
  Object.keys(result).forEach((skillType) => {
    const smallToMiddle = Math.floor(result[skillType].small / 2);
    result[skillType].small %= 2;
    result[skillType].middle += smallToMiddle;
    const middleToLarge = Math.floor(result[skillType].middle / 2);
    result[skillType].middle %= 2;
    result[skillType].large += middleToLarge;
  });
  return result;
}

function computeAggregatedSkillRate(skillType, tiers) {
  const defs = gameData.weapons?.meta?.partySkillDefs?.[skillType]?.tiers;
  if (!defs) return 0;
  return (tiers.small * (defs.small?.value || 0)) + (tiers.middle * (defs.middle?.value || 0)) + (tiers.large * (defs.large?.value || 0));
}

function computeFinalStatsForSlot(slotId, equipMap) {
  const weapons = getWeaponsList();
  const equipped = getEquippedWeaponObjectsFromMap(equipMap, weapons);
  const aggregated = aggregatePartySkills(equipped);
  const atkBonusRate = computeAggregatedSkillRate('atkUp', aggregated.atkUp || { small: 0, middle: 0, large: 0 });
  const hpBonusRate = computeAggregatedSkillRate('hpUp', aggregated.hpUp || { small: 0, middle: 0, large: 0 });
  const weapon = getWeaponById(equipMap[slotId]);
  const enhanced = getEffectiveWeaponStats(weapon);

  if (slotId === 'protagonist') {
    const finalHp = Math.floor((1 + enhanced.hp) * (1 + hpBonusRate));
    const finalAtk = Math.floor((1 + enhanced.atk) * (1 + atkBonusRate));
    return { finalHp, finalAtk, weaponName: weapon?.name || '未装備' };
  }

  const char = getCharacterById(slotId);
  const baseHp = char?.displayStats?.baseHp ?? 0;
  const baseAtk = char?.displayStats?.baseAtk ?? 0;
  return {
    finalHp: Math.floor((baseHp + enhanced.hp) * (1 + hpBonusRate)),
    finalAtk: Math.floor((baseAtk + enhanced.atk) * (1 + atkBonusRate)),
    weaponName: weapon?.name || '未装備'
  };
}

function buildEquipComparison(slotId, newWeaponId) {
  const currentMap = { ...formationState.equippedWeapons };
  const nextMap = { ...formationState.equippedWeapons, [slotId]: newWeaponId };
  const currentStats = computeFinalStatsForSlot(slotId, currentMap);
  const nextStats = computeFinalStatsForSlot(slotId, nextMap);
  return {
    slotName: getSlotDisplayName(slotId),
    currentName: currentStats.weaponName,
    newName: getWeaponById(newWeaponId)?.name || '未設定',
    currentHp: currentStats.finalHp,
    currentAtk: currentStats.finalAtk,
    newHp: nextStats.finalHp,
    newAtk: nextStats.finalAtk,
    hpDiff: nextStats.finalHp - currentStats.finalHp,
    atkDiff: nextStats.finalAtk - currentStats.finalAtk
  };
}

function renderComparisonHtml(result) {
  const weapon = getWeaponById(result.weaponId);
  if (!weapon) return '<p class="muted">比較データなし</p>';
  const targets = [
    { slotId: 'protagonist', label: '主人公' },
    { slotId: 'char_towa', label: 'トワ' },
    { slotId: 'char_hinano', label: 'ヒナノ' },
    { slotId: 'char_suzu', label: 'スズ' }
  ];
  const rows = targets.map((target) => {
    if (!canEquipWeaponToSlot(weapon, target.slotId)) {
      return `<li><strong>${escapeHtml(target.label)}</strong>：<span class="muted">装備不可</span></li>`;
    }
    const cmp = buildEquipComparison(target.slotId, result.weaponId);
    const hpPrefix = cmp.hpDiff > 0 ? '+' : '';
    const atkPrefix = cmp.atkDiff > 0 ? '+' : '';
    return `
      <li>
        <strong>${escapeHtml(target.label)}</strong>：${escapeHtml(cmp.currentName)} → ${escapeHtml(cmp.newName)}
        <br><span class="muted">最終HP ${escapeHtml(cmp.currentHp)} → ${escapeHtml(cmp.newHp)} (${escapeHtml(hpPrefix + cmp.hpDiff)}) / 最終ATK ${escapeHtml(cmp.currentAtk)} → ${escapeHtml(cmp.newAtk)} (${escapeHtml(atkPrefix + cmp.atkDiff)})</span>
      </li>
    `;
  }).join('');
  return `<div class="info-card" style="margin-top: 10px; background: rgba(15,22,48,0.65);"><h4 style="margin-top: 0; font-size: 13px;">装備後の最終値比較</h4><ul style="margin: 8px 0 0; padding-left: 18px;">${rows}</ul></div>`;
}

// -------------------------
// ガチャ
// -------------------------

function getWeaponsByRarity(rarity) {
  return getWeaponsList().filter((weapon) => (weapon.rarity || 1) === rarity);
}

function getWeightedRarity(weights) {
  const total = Object.values(weights).reduce((sum, value) => sum + value, 0);
  let roll = Math.random() * total;
  for (const [rarity, weight] of Object.entries(weights)) {
    roll -= weight;
    if (roll <= 0) return Number(rarity);
  }
  return 1;
}

function drawWeaponWithMinimum(minRarity = 1) {
  const adjusted = {};
  Object.entries(GACHA_RARITY_WEIGHTS).forEach(([rarity, weight]) => {
    if (Number(rarity) >= minRarity) adjusted[rarity] = weight;
  });
  const rarity = getWeightedRarity(Object.keys(adjusted).length ? adjusted : GACHA_RARITY_WEIGHTS);
  let pool = getWeaponsByRarity(rarity).filter((weapon) => (weapon.rarity || 1) >= minRarity);
  if (!pool.length) pool = getWeaponsList().filter((weapon) => (weapon.rarity || 1) >= minRarity);
  if (!pool.length) pool = getWeaponsList();
  if (!pool.length) return null;
  return pool[Math.floor(Math.random() * pool.length)] || null;
}

function createResultEntry(weapon, ownershipTracker, source, guaranteed = false) {
  const beforeCount = Math.max(0, Math.floor(Number(ownershipTracker[weapon.id] || 0)));
  ownershipTracker[weapon.id] = beforeCount + 1;
  addOwnedWeapon(weapon.id, 1);
  const result = {
    weaponId: weapon.id,
    name: weapon.name,
    rarity: weapon.rarity || 1,
    source,
    isNew: beforeCount === 0,
    guaranteed,
    weaponType: weapon.weaponType,
    at: new Date().toISOString()
  };
  gachaState.logs.unshift(result);
  gachaState.logs = gachaState.logs.slice(0, GACHA_LOG_MAX);
  return result;
}

function formatGachaResultText(results) {
  return results.map((item, index) => `${index + 1}. ★${item.rarity || 1} ${item.name}${item.isNew ? ' [NEW]' : ' [重複]'}`).join('\n');
}

function resetRevealForResults(results) {
  stopRevealTimer();
  gachaState.lastResults = results;
  gachaState.revealCount = 0;
}

function revealResultAtIndex(index) {
  const result = gachaState.lastResults[index];
  if (!result) return;
  const oldCount = gachaState.revealCount;
  if (index + 1 <= oldCount) return;
  gachaState.revealCount = index + 1;
  if (result.rarity >= 3) triggerRareFlash();
  saveGameState();
  renderGachaSection();
}

function revealNextCard() {
  if (!gachaState.lastResults.length) return;
  const nextIndex = clamp(gachaState.revealCount, 0, gachaState.lastResults.length - 1);
  revealResultAtIndex(nextIndex);
  if (gachaState.revealCount >= gachaState.lastResults.length) stopRevealTimer();
}

function revealSingleCard(index) {
  revealResultAtIndex(index);
}

function revealAllCards() {
  if (!gachaState.lastResults.length) return;
  gachaState.lastResults.forEach((result, index) => {
    if (index >= gachaState.revealCount && result.rarity >= 3) triggerRareFlash();
  });
  gachaState.revealCount = gachaState.lastResults.length;
  stopRevealTimer();
  saveGameState();
  renderGachaSection();
}

function startSequentialReveal() {
  if (!gachaState.lastResults.length) return;
  stopRevealTimer();
  gachaState.revealTimer = setInterval(() => {
    if (gachaState.revealCount >= gachaState.lastResults.length) {
      stopRevealTimer();
      return;
    }
    revealNextCard();
  }, 360);
}

function runSingleGacha() {
  if (!getWeaponsList().length) {
    alert('武器データがありません。');
    return;
  }
  if (resourceState.materialCore < GACHA_SINGLE_COST) {
    alert(`マテリアルコアが不足しています。必要数：${GACHA_SINGLE_COST}`);
    return;
  }
  resourceState.materialCore -= GACHA_SINGLE_COST;
  const picked = drawWeaponWithMinimum(1);
  if (!picked) {
    alert('ガチャ結果の生成に失敗しました。');
    return;
  }
  const ownershipTracker = { ...weaponState.ownedWeapons };
  const result = createResultEntry(picked, ownershipTracker, 'single', false);
  resetRevealForResults([result]);
  saveGameState();
  rerenderAllSections();
  alert(`シングルガチャ結果\n\n★${result.rarity} ${result.name}${result.isNew ? ' [NEW]' : ' [重複]'}`);
  showScreen('gacha');
}

function runTenGacha() {
  if (!getWeaponsList().length) {
    alert('武器データがありません。');
    return;
  }
  if (resourceState.materialCore < GACHA_TEN_COST) {
    alert(`マテリアルコアが不足しています。必要数：${GACHA_TEN_COST}`);
    return;
  }
  resourceState.materialCore -= GACHA_TEN_COST;
  const ownershipTracker = { ...weaponState.ownedWeapons };
  const results = [];
  for (let i = 0; i < 9; i += 1) {
    const picked = drawWeaponWithMinimum(1);
    if (picked) results.push(createResultEntry(picked, ownershipTracker, 'ten', false));
  }
  const guaranteedWeapon = drawWeaponWithMinimum(2) || drawWeaponWithMinimum(1);
  if (guaranteedWeapon) {
    results.push(createResultEntry(guaranteedWeapon, ownershipTracker, 'ten', true));
  }
  resetRevealForResults(results);
  saveGameState();
  rerenderAllSections();
  alert(`10連ガチャ結果（10枠目は★2以上保証）\n\n${formatGachaResultText(results)}`);
  showScreen('gacha');
}

function renderGachaLog() {
  if (!gachaState.logs.length) {
    return '<p class="muted">まだガチャ結果はありません。シングルまたは10連ガチャを回して武器を入手できます。</p>';
  }
  return `<ul>${gachaState.logs.map((log) => `<li><strong>★${escapeHtml(log.rarity)}</strong> ${escapeHtml(log.name)} <span class="muted">(${escapeHtml(log.weaponId)} / ${escapeHtml(log.source === 'ten' ? '10連' : '単発')} / ${escapeHtml(log.isNew ? 'NEW' : '重複')})</span></li>`).join('')}</ul>`;
}

function renderEquipButtonsHtml(result, index) {
  const weapon = getWeaponById(result.weaponId);
  const targets = [
    { slotId: 'protagonist', label: '主人公' },
    { slotId: 'char_towa', label: 'トワ' },
    { slotId: 'char_hinano', label: 'ヒナノ' },
    { slotId: 'char_suzu', label: 'スズ' }
  ];
  return `
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px; width: 100%;">
      ${targets.map((target) => {
        const disabled = canEquipWeaponToSlot(weapon, target.slotId) ? '' : 'disabled';
        return `<button class="text-button gacha-card-equip" data-gacha-equip-index="${escapeHtml(index)}" data-gacha-equip-slot="${escapeHtml(target.slotId)}" ${disabled}>${escapeHtml(target.label)} に装備</button>`;
      }).join('')}
    </div>
  `;
}

function renderHiddenGachaCard(result, index) {
  const rarityColor = getRarityColor(result.rarity);
  const isRare = result.rarity >= 3;
  const hiddenGlow = isRare ? `0 0 24px rgba(255,216,106,0.35)` : `0 0 14px rgba(143,212,255,0.18)`;
  return `
    <div style="border: 1px dashed ${rarityColor}; border-radius: 16px; padding: 14px; background: linear-gradient(180deg, rgba(7,10,22,1) 0%, rgba(4,6,13,1) 100%); min-height: 310px; display: flex; flex-direction: column; justify-content: center; align-items: center; box-shadow: ${hiddenGlow}; text-align: center;">
      <div style="font-size: 20px; letter-spacing: 0.08em; color: ${rarityColor}; font-weight: 800;">REVEAL</div>
      <div style="font-size: 12px; color: #94a3b8; margin-top: 10px;">${escapeHtml(index + 1)} 枠目</div>
      <button class="text-button gacha-card-reveal-one" data-gacha-reveal-index="${escapeHtml(index)}" style="margin-top: 18px;">めくる</button>
    </div>
  `;
}

function renderRevealedGachaCard(result, index) {
  const rarityColor = getRarityColor(result.rarity);
  const badgeBg = result.isNew ? '#22c55e' : '#64748b';
  const guaranteeBadge = result.guaranteed ? '<div style="font-size: 11px; color: #fde68a; margin-top: 6px;">保証枠</div>' : '';
  const weapon = getWeaponById(result.weaponId);
  const sellValue = getWeaponSellValue(weapon);
  const canSell = canSellWeaponFromResult(result);
  const enhanceLevel = getWeaponEnhanceLevel(result.weaponId);
  const enhanceCost = getWeaponEnhanceCost(enhanceLevel);
  const canEnhance = canEnhanceWeapon(result.weaponId);
  const enhanceLabel = enhanceLevel >= WEAPON_ENHANCE_MAX ? '強化最大' : `強化する（${enhanceCost} コア）`;
  const protectedLabel = isWeaponProtected(result.weaponId)
    ? `<div style="font-size: 11px; color: #facc15; margin-top: 6px;">${isWeaponFavorite(result.weaponId) ? 'お気に入り' : 'ロック中'}</div>`
    : '';
  const extraGlow = result.rarity === 3
    ? '0 0 28px rgba(255,216,106,0.55), 0 8px 26px rgba(0,0,0,0.35)'
    : result.isNew
      ? '0 0 20px rgba(34,197,94,0.35), 0 8px 20px rgba(0,0,0,0.25)'
      : '0 8px 20px rgba(0,0,0,0.25)';
  const newSpark = result.isNew ? `<div style="font-size: 11px; color: #86efac; margin-top: 6px;">NEWエフェクト</div>` : '';
  const favLabel = isWeaponFavorite(result.weaponId) ? '★ お気に入り解除' : '☆ お気に入り登録';
  return `
    <div style="border: 1px solid ${rarityColor}; border-radius: 16px; padding: 14px; background: ${getRarityBg(result.rarity)}; min-height: 420px; display: flex; flex-direction: column; justify-content: space-between; box-shadow: ${extraGlow}; animation: gachaFlipIn 0.45s ease; ${result.isNew ? 'animation: gachaFlipIn 0.45s ease, gachaNewPulse 1.4s ease-in-out infinite;' : ''}">
      <div>
        <div style="display: flex; justify-content: space-between; align-items: center; gap: 8px;">
          <span style="font-size: 13px; color: ${rarityColor}; font-weight: 800; text-shadow: ${result.rarity === 3 ? '0 0 10px rgba(255,216,106,0.55)' : 'none'};">${getRarityLabel(result.rarity)}</span>
          <span style="font-size: 11px; padding: 4px 8px; border-radius: 999px; background: ${badgeBg}; color: white; box-shadow: ${result.isNew ? '0 0 10px rgba(34,197,94,0.55)' : 'none'};">${escapeHtml(result.isNew ? 'NEW' : '重複')}</span>
        </div>
        <div style="font-size: 12px; color: #94a3b8; margin-top: 6px;">${escapeHtml(index + 1)} 枠目</div>
        <div style="margin-top: 14px; font-size: 18px; font-weight: 800; line-height: 1.4; ${result.rarity === 3 ? 'color: #fff6cf;' : ''}">${escapeHtml(result.name)}</div>
        <div style="margin-top: 8px; font-size: 12px; color: #cbd5e1;">${escapeHtml(result.weaponId)} / ${escapeHtml(getWeaponTypeDisplay(weapon))} / 強化 +${escapeHtml(enhanceLevel)}</div>
        ${guaranteeBadge}
        ${newSpark}
        ${protectedLabel}
        ${renderComparisonHtml(result)}
      </div>
      <div style="display: flex; flex-direction: column; gap: 8px; margin-top: 14px;">
        ${renderEquipButtonsHtml(result, index)}
        <button class="text-button gacha-card-enhance" data-gacha-enhance-index="${escapeHtml(index)}" ${canEnhance ? '' : 'disabled'}>${escapeHtml(enhanceLabel)}</button>
        <button class="text-button gacha-card-favorite" data-gacha-favorite-index="${escapeHtml(index)}">${escapeHtml(favLabel)}</button>
        <button class="text-button gacha-card-sell" data-gacha-sell-index="${escapeHtml(index)}" ${canSell ? '' : 'disabled'}>売却する（${escapeHtml(sellValue)} コア）</button>
      </div>
    </div>
  `;
}

function renderLastGachaResults() {
  ensureGachaFxStyles();
  if (!gachaState.lastResults.length) {
    return '<p class="muted">まだ最新の結果はありません。</p>';
  }
  const cards = gachaState.lastResults.map((result, index) => {
    const revealed = index < gachaState.revealCount;
    return revealed ? renderRevealedGachaCard(result, index) : renderHiddenGachaCard(result, index);
  }).join('');
  const cols = gachaState.lastResults.length >= 10 ? 'repeat(5, minmax(0, 1fr))' : 'repeat(auto-fit, minmax(220px, 1fr))';
  return `
    <div class="button-group" style="max-width: none; flex-direction: row; flex-wrap: wrap; margin-bottom: 12px;">
      <button class="text-button" id="gacha-reveal-next" ${gachaState.revealCount >= gachaState.lastResults.length ? 'disabled' : ''}>1枚ずつめくる</button>
      <button class="text-button" id="gacha-reveal-auto" ${gachaState.revealCount >= gachaState.lastResults.length ? 'disabled' : ''}>順番にめくる</button>
      <button class="text-button" id="gacha-reveal-all" ${gachaState.revealCount >= gachaState.lastResults.length ? 'disabled' : ''}>すべてめくる</button>
    </div>
    <div style="display: grid; grid-template-columns: ${cols}; gap: 12px; margin-top: 8px;">${cards}</div>
  `;
}

function renderOwnedWeaponsSummary(weapons, weaponTypeMap) {
  const ownedWeapons = weapons.filter((weapon) => getOwnedWeaponCount(weapon.id) > 0);
  if (!ownedWeapons.length) return '<p class="muted">まだ武器を所持していません。ガチャを回して武器を入手しましょう。</p>';
  const grouped = {};
  ownedWeapons.forEach((weapon) => {
    const rarity = weapon.rarity || 1;
    if (!grouped[rarity]) grouped[rarity] = [];
    grouped[rarity].push(weapon);
  });
  return [1,2,3].map((rarity) => {
    const list = grouped[rarity] || [];
    if (!list.length) return `<h4>★${rarity}</h4><p class="muted">なし</p>`;
    return `
      <h4>★${rarity}</h4>
      <ul>
        ${list.map((weapon) => {
          const typeDisplay = weapon.weaponTypeDisplay || weaponTypeMap.get(weapon.weaponType)?.displayName || weapon.weaponType;
          const enhance = getWeaponEnhanceLevel(weapon.id);
          const sellable = getSellableWeaponCount(weapon.id);
          const sellValue = getWeaponSellValue(weapon);
          const disabled = sellable <= 0 ? 'disabled' : '';
          const marks = `${isWeaponFavorite(weapon.id) ? ' / お気に入り' : ''}${isWeaponLocked(weapon.id) ? ' / ロック' : ''}`;
          return `
            <li style="margin-bottom: 10px;">
              <strong>${escapeHtml(weapon.name)}</strong>
              <span class="muted">[${escapeHtml(typeDisplay)} / 所持 ${escapeHtml(getOwnedWeaponCount(weapon.id))} / +${escapeHtml(enhance)}${escapeHtml(marks)}]</span><br>
              <span class="muted">売却可能数：${escapeHtml(sellable)} / 売却額：1本 ${escapeHtml(sellValue)} コア</span><br>
              <button class="text-button weapon-sell-button" data-weapon-sell="${escapeHtml(weapon.id)}" ${disabled}>重複1本を売却する</button>
            </li>
          `;
        }).join('')}
      </ul>
    `;
  }).join('');
}

function attachGachaEvents() {
  document.getElementById('gacha-single-button')?.addEventListener('click', () => runSingleGacha());
  document.getElementById('gacha-ten-button')?.addEventListener('click', () => runTenGacha());
  document.getElementById('gacha-reveal-next')?.addEventListener('click', () => revealNextCard());
  document.getElementById('gacha-reveal-auto')?.addEventListener('click', () => startSequentialReveal());
  document.getElementById('gacha-reveal-all')?.addEventListener('click', () => revealAllCards());
  document.getElementById('gacha-bulk-sell-star1')?.addEventListener('click', () => executeBulkSell({ rarity: 1 }));
  document.getElementById('gacha-bulk-sell-all')?.addEventListener('click', () => executeBulkSell({}));
  document.getElementById('gacha-lock-high-rarity')?.addEventListener('click', () => lockHighRarityWeapons());
  document.querySelectorAll('[data-gacha-reveal-index]').forEach((button) => {
    button.addEventListener('click', () => revealSingleCard(Number(button.getAttribute('data-gacha-reveal-index'))));
  });
  document.querySelectorAll('[data-weapon-sell]').forEach((button) => {
    button.addEventListener('click', () => trySellDuplicateWeapon(button.getAttribute('data-weapon-sell')));
  });
  document.querySelectorAll('[data-gacha-equip-index]').forEach((button) => {
    const index = Number(button.getAttribute('data-gacha-equip-index'));
    const slotId = button.getAttribute('data-gacha-equip-slot');
    button.addEventListener('click', () => equipWeaponToSlotFromGachaResult(index, slotId));
  });
  document.querySelectorAll('[data-gacha-enhance-index]').forEach((button) => {
    const index = Number(button.getAttribute('data-gacha-enhance-index'));
    button.addEventListener('click', () => enhanceWeaponFromGachaResult(index));
  });
  document.querySelectorAll('[data-gacha-favorite-index]').forEach((button) => {
    const index = Number(button.getAttribute('data-gacha-favorite-index'));
    button.addEventListener('click', () => toggleFavoriteFromGachaResult(index));
  });
  document.querySelectorAll('[data-gacha-sell-index]').forEach((button) => {
    button.addEventListener('click', () => sellWeaponFromGachaResult(Number(button.getAttribute('data-gacha-sell-index'))));
  });
}

function renderGachaSection() {
  const gachaScreen = document.getElementById('screen-gacha');
  if (!gachaScreen || !gameData.weapons) return;
  const container = gachaScreen.querySelector('.screen-inner');
  if (!container) return;
  clearDynamicCards(container);

  const weapons = getWeaponsList();
  const weaponTypeMap = getWeaponTypeMap();
  const bulkStar1Targets = getBulkSellTargets({ rarity: 1 });
  const bulkAllTargets = getBulkSellTargets({});
  const bulkStar1Count = bulkStar1Targets.reduce((sum, item) => sum + item.count, 0);
  const bulkStar1Gain = bulkStar1Targets.reduce((sum, item) => sum + item.totalGain, 0);
  const bulkAllCount = bulkAllTargets.reduce((sum, item) => sum + item.count, 0);
  const bulkAllGain = bulkAllTargets.reduce((sum, item) => sum + item.totalGain, 0);
  const favoriteCount = Object.keys(weaponState.favoriteWeapons).length;
  const lockedCount = Object.keys(weaponState.lockedWeapons).length;

  const resourceCard = createInfoCard();
  resourceCard.innerHTML = renderResourceSummaryCard('ガチャ・売却に使う所持数');

  const gachaCard = createInfoCard();
  gachaCard.innerHTML = `
    <h3>武器ガチャ（仮）</h3>
    <p class="muted">シングルガチャは ${GACHA_SINGLE_COST} コア、10連ガチャは ${GACHA_TEN_COST} コアです。</p>
    <ul>
      <li>通常確率：★1 70% / ★2 25% / ★3 5%</li>
      <li>10連の10枠目は <strong>★2以上1枠保証（仮）</strong></li>
    </ul>
    <div class="button-group" style="max-width: none; flex-direction: row; flex-wrap: wrap;">
      <button class="text-button" id="gacha-single-button" ${resourceState.materialCore < GACHA_SINGLE_COST ? 'disabled' : ''}>シングルガチャ（${GACHA_SINGLE_COST} コア）</button>
      <button class="text-button" id="gacha-ten-button" ${resourceState.materialCore < GACHA_TEN_COST ? 'disabled' : ''}>10連ガチャ（${GACHA_TEN_COST} コア）</button>
    </div>
    <p class="muted" style="margin-top: 12px;">現在は仮仕様です。重複した武器は売却してコアに戻せます。</p>
  `;

  const latestCard = createInfoCard();
  latestCard.innerHTML = `<h3>最新のガチャ結果</h3><p class="muted">カード内で NEW / 重複 を区別し、その場で <strong>装備後の最終HP / 最終ATK 比較表示 / キャラ別装備 / 強化 / お気に入り / 売却</strong> を実行できます。未公開カードは「めくる」で順番に表示できます。</p>${renderLastGachaResults()}`;

  const bulkCard = createInfoCard();
  bulkCard.innerHTML = `
    <h3>一括操作</h3>
    <div class="status-row"><span>★1重複 売却対象</span><strong>${escapeHtml(bulkStar1Count)} 本 / ${escapeHtml(bulkStar1Gain)} コア</strong></div>
    <div class="status-row"><span>全部売却 対象</span><strong>${escapeHtml(bulkAllCount)} 本 / ${escapeHtml(bulkAllGain)} コア</strong></div>
    <div class="status-row"><span>ロック数 / お気に入り数</span><strong>${escapeHtml(lockedCount)} / ${escapeHtml(favoriteCount)}</strong></div>
    <div class="button-group" style="max-width: none; flex-direction: row; flex-wrap: wrap; margin-top: 12px;">
      <button class="text-button" id="gacha-bulk-sell-star1" ${bulkStar1Count > 0 ? '' : 'disabled'}>★1重複を一括売却</button>
      <button class="text-button" id="gacha-bulk-sell-all" ${bulkAllCount > 0 ? '' : 'disabled'}>全部売却（売却可能分）</button>
      <button class="text-button" id="gacha-lock-high-rarity">★2以上だけロック</button>
    </div>
    <p class="muted" style="margin-top: 12px;">ロック済み・お気に入り済み武器は個別売却 / 一括売却の対象外になります。</p>
  `;

  const logCard = createInfoCard();
  logCard.innerHTML = `<h3>最近のガチャ履歴</h3>${renderGachaLog()}`;

  const ownedCard = createInfoCard();
  ownedCard.innerHTML = `
    <h3>所持武器一覧 / 重複売却</h3>
    <p class="muted">所持武器と重複売却の詳細です。</p>
    ${renderOwnedWeaponsSummary(weapons, weaponTypeMap)}
  `;

  container.appendChild(resourceCard);
  container.appendChild(gachaCard);
  container.appendChild(latestCard);
  container.appendChild(bulkCard);
  container.appendChild(logCard);
  container.appendChild(ownedCard);
  attachGachaEvents();
}

// -------------------------
// 冒険画面
// -------------------------

function renderAdventureSection() {
  const adventureScreen = document.getElementById('screen-adventure');
  if (!adventureScreen || !gameData.story || !gameData.battles) return;
  const container = adventureScreen.querySelector('.screen-inner');
  if (!container) return;
  clearDynamicCards(container);

  const stories = gameData.story.stories || [];
  const battles = gameData.battles.battles || [];
  const chapterTitle = gameData.story.meta?.chapterTitle || '第1章';
  const characterMap = new Map(getCharactersList().map((c) => [c.id, c]));
  const nodeOrder = ['story_1_1', 'story_1_2', 'battle_1_1', 'story_1_3', 'battle_1_2', 'battle_1_3'];
  const storyMap = new Map(stories.map((item) => [item.id, item]));
  const battleMap = new Map(battles.map((item) => [item.id, item]));

  const resourceCard = createInfoCard();
  resourceCard.innerHTML = renderResourceSummaryCard('現在の所持数');

  const timelineCard = createInfoCard();
  timelineCard.innerHTML = `
    <h3>${escapeHtml(chapterTitle)}</h3>
    <ol class="story-list">
      ${nodeOrder.map((nodeId) => {
        const story = storyMap.get(nodeId);
        const battle = battleMap.get(nodeId);
        if (story) {
          const unlockText = getStoryUnlockText(story, characterMap);
          return `<li><strong>ストーリー</strong>：${escapeHtml(story.title)} <span class="muted">(${escapeHtml(story.id)})</span><br>${unlockText ? `<span class="muted">${escapeHtml(unlockText)}</span><br>` : ''}<button class="text-button story-open-button" data-story-id="${escapeHtml(story.id)}">本文を読む</button></li>`;
        }
        if (battle) {
          const reward = battle.firstClearReward ? `初回: コア ${battle.firstClearReward.materialCore ?? 0} / EXP ${battle.firstClearReward.exp ?? 0}` : '報酬未設定';
          const repeat = battle.repeatReward ? `再挑戦: EXP ${battle.repeatReward.exp ?? 0}` : '';
          const clearedMark = progressState.clearedBattles.includes(battle.id) ? ' / クリア済み' : '';
          return `<li><strong>バトル</strong>：${escapeHtml(battle.title)} <span class="muted">(${escapeHtml(battle.id)}${escapeHtml(clearedMark)})</span><br><span class="muted">${escapeHtml(reward)}</span>${repeat ? `<br><span class="muted">${escapeHtml(repeat)}</span>` : ''}<br><button class="text-button battle-preview-button" data-battle-id="${escapeHtml(battle.id)}">バトル情報</button> <button class="text-button battle-open-button" data-battle-id="${escapeHtml(battle.id)}">バトルUIを開く</button></li>`;
        }
        return `<li><strong>未設定</strong>：${escapeHtml(nodeId)}</li>`;
      }).join('')}
    </ol>
    <p class="muted">story.json と battles.json を読み込んで、冒険の進行順を自動表示しています。</p>
  `;

  const rewardCard = createInfoCard();
  rewardCard.innerHTML = `
    <h3>第1章の報酬</h3>
    <ul>
      <li>各バトル初回クリア：マテリアルコア 5個</li>
      <li>再挑戦報酬：経験値のみ</li>
      <li>ガチャや武器強化にコアを使えます</li>
    </ul>
  `;

  const readerCard = createInfoCard('story-reader-card');
  readerCard.innerHTML = '<h3>ストーリー本文ビューア</h3><p class="muted">「本文を読む」を押すと、ここに本文が表示されます。</p>';
  const battleUiCard = createInfoCard('battle-ui-card');
  battleUiCard.innerHTML = '<h3>バトル最小UI</h3><p class="muted">「バトルUIを開く」を押すと、ここに主人公 / 味方 / 敵 / 行動ボタンの最小UIが表示されます。</p>';

  container.appendChild(resourceCard);
  container.appendChild(timelineCard);
  container.appendChild(rewardCard);
  container.appendChild(readerCard);
  container.appendChild(battleUiCard);
  attachAdventureButtons();
}

function getStoryUnlockText(story, characterMap) {
  const unlockIds = story.unlockCharacters || [];
  if (!unlockIds.length) return '';
  const names = unlockIds.map((id) => characterMap.get(id)?.name || id);
  return `加入: ${names.join(' / ')}`;
}

function attachAdventureButtons() {
  document.querySelectorAll('.story-open-button').forEach((button) => button.addEventListener('click', () => openStoryReader(button.getAttribute('data-story-id'))));
  document.querySelectorAll('.battle-preview-button').forEach((button) => button.addEventListener('click', () => openBattlePreview(button.getAttribute('data-battle-id'))));
  document.querySelectorAll('.battle-open-button').forEach((button) => button.addEventListener('click', () => openBattleUi(button.getAttribute('data-battle-id'))));
}

// -------------------------
// ストーリー本文ビューア
// -------------------------

function openStoryReader(storyId) {
  const story = (gameData.story?.stories || []).find((item) => item.id === storyId);
  if (!story) return;
  storyReaderState.currentStoryId = storyId;
  storyReaderState.currentSceneIndex = 0;
  renderStoryReader();
}

function renderStoryReader() {
  const readerCard = document.getElementById('story-reader-card');
  if (!readerCard) return;
  const story = (gameData.story?.stories || []).find((item) => item.id === storyReaderState.currentStoryId);
  if (!story) {
    readerCard.innerHTML = '<h3>ストーリー本文ビューア</h3><p class="muted">「本文を読む」を押すと、ここに本文が表示されます。</p>';
    return;
  }
  const scenes = story.scenes || [];
  const maxIndex = scenes.length - 1;
  const currentIndex = clamp(storyReaderState.currentSceneIndex, 0, Math.max(0, maxIndex));
  storyReaderState.currentSceneIndex = currentIndex;
  const scene = scenes[currentIndex] || {};
  readerCard.innerHTML = `
    <h3>${escapeHtml(story.title)}</h3>
    <p class="muted">${escapeHtml(story.id)} / ${currentIndex + 1} / ${Math.max(1, scenes.length)}</p>
    <div class="status-row"><span>話者</span><strong>${escapeHtml(scene.speaker || 'ナレーション')}</strong></div>
    <div class="status-row"><span>背景</span><strong>${escapeHtml(scene.bg || '未設定')}</strong></div>
    <div class="status-row"><span>BGM</span><strong>${escapeHtml(scene.bgm || '未設定')}</strong></div>
    <div class="info-card" style="margin-top: 16px;"><p style="white-space: pre-wrap; margin: 0;">${escapeHtml(scene.text || '')}</p></div>
    <div class="button-group" style="margin-top: 18px; max-width: none; flex-direction: row; flex-wrap: wrap;">
      <button class="text-button" id="story-prev-button">前へ</button>
      <button class="text-button" id="story-next-button">次へ</button>
      <button class="text-button" id="story-close-button">閉じる</button>
    </div>
  `;
  document.getElementById('story-prev-button')?.addEventListener('click', () => { storyReaderState.currentSceneIndex = Math.max(0, storyReaderState.currentSceneIndex - 1); renderStoryReader(); });
  document.getElementById('story-next-button')?.addEventListener('click', () => { storyReaderState.currentSceneIndex = Math.min(Math.max(0, maxIndex), storyReaderState.currentSceneIndex + 1); renderStoryReader(); });
  document.getElementById('story-close-button')?.addEventListener('click', () => { storyReaderState.currentStoryId = null; storyReaderState.currentSceneIndex = 0; renderStoryReader(); });
}

// -------------------------
// バトル情報プレビュー
// -------------------------

function openBattlePreview(battleId) {
  const battle = (gameData.battles?.battles || []).find((item) => item.id === battleId);
  const readerCard = document.getElementById('story-reader-card');
  if (!battle || !readerCard) return;
  const enemyTemplates = new Map((gameData.battles?.enemyTemplates || []).map((enemy) => [enemy.id, enemy]));
  const enemyList = (battle.enemyGroup || []).map((enemy) => `${enemyTemplates.get(enemy.enemyId)?.name || enemy.enemyId} (${enemy.instanceId})`);
  readerCard.innerHTML = `
    <h3>${escapeHtml(battle.title)}</h3>
    <p class="muted">${escapeHtml(battle.id)} / ${escapeHtml(battle.battleType)}</p>
    <div class="info-card" style="margin-top: 16px;">
      <h3 style="margin-top: 0;">敵編成</h3>
      <ul>${enemyList.map((name) => `<li>${escapeHtml(name)}</li>`).join('')}</ul>
      <p class="muted">初回報酬：コア ${escapeHtml(battle.firstClearReward?.materialCore ?? 0)} / EXP ${escapeHtml(battle.firstClearReward?.exp ?? 0)}</p>
      <p class="muted">再挑戦報酬：EXP ${escapeHtml(battle.repeatReward?.exp ?? 0)}</p>
    </div>
    <div class="button-group" style="margin-top: 18px; max-width: none; flex-direction: row;"><button class="text-button" id="battle-close-button">閉じる</button></div>
  `;
  document.getElementById('battle-close-button')?.addEventListener('click', () => { storyReaderState.currentStoryId = null; storyReaderState.currentSceneIndex = 0; renderStoryReader(); });
}

// -------------------------
// 編成画面
// -------------------------

function getAvailableWeaponsForSlot(slot, weapons) {
  const usageMap = getEquippedWeaponUsageMap();
  return weapons.filter((weapon) => {
    if (!canEquipWeaponToSlot(weapon, slot.id)) return false;
    const owned = getOwnedWeaponCount(weapon.id);
    const currentEquipped = formationState.equippedWeapons[slot.id] === weapon.id ? 1 : 0;
    const usedElsewhere = (usageMap.get(weapon.id) || 0) - currentEquipped;
    return owned - usedElsewhere > 0;
  });
}

function renderSelectedWeaponSummary(weapon) {
  const skills = (weapon.partySkills || []).map((skill) => `${skill.displayName}（${skill.tierLabel}）`).join(' / ') || 'なし';
  const enhanced = getEffectiveWeaponStats(weapon);
  return `
    <p style="margin: 0;"><strong>${escapeHtml(weapon.name)}</strong> <span class="muted">(+${escapeHtml(enhanced.level)})</span></p>
    <p class="muted" style="margin: 6px 0 0;">HP ${escapeHtml(enhanced.hp)} / ATK ${escapeHtml(enhanced.atk)}</p>
    <p class="muted" style="margin: 6px 0 0;">スキル：${escapeHtml(skills)}</p>
  `;
}

function renderEquipmentUi(characters, weapons, weaponTypeMap) {
  const slots = [{ id: 'protagonist', name: '主人公' }, ...characters.map((char) => ({ id: char.id, name: char.name }))];
  return `
    <h3>装備設定</h3>
    <p class="muted">主人公 / トワ / ヒナノ / スズ の4枠に、所持している武器だけ装備できます。</p>
    ${slots.map((slot) => {
      const currentWeaponId = formationState.equippedWeapons[slot.id] || '';
      const availableWeapons = getAvailableWeaponsForSlot(slot, weapons);
      const selectedWeapon = getWeaponById(currentWeaponId);
      const options = [`<option value="">未装備</option>`, ...availableWeapons.map((weapon) => {
        const selected = weapon.id === currentWeaponId ? 'selected' : '';
        const typeDisplay = weapon.weaponTypeDisplay || weaponTypeMap.get(weapon.weaponType)?.displayName || weapon.weaponType;
        const level = getWeaponEnhanceLevel(weapon.id);
        return `<option value="${escapeHtml(weapon.id)}" ${selected}>${escapeHtml(weapon.name)} [${escapeHtml(typeDisplay)} / 所持 ${escapeHtml(getOwnedWeaponCount(weapon.id))} / +${escapeHtml(level)}]</option>`;
      })].join('');
      return `
        <div class="info-card" style="margin-top: 12px;">
          <h4 style="margin-top: 0; margin-bottom: 8px;">${escapeHtml(slot.name)} の装備枠</h4>
          <label class="muted" for="equip-${escapeHtml(slot.id)}">武器を選択</label><br>
          <select id="equip-${escapeHtml(slot.id)}" data-equip-slot="${escapeHtml(slot.id)}" style="width: 100%; margin-top: 8px; padding: 10px; border-radius: 12px; border: 1px solid #2d3966; background: #0f1630; color: #eef2ff;">${options}</select>
          <div style="margin-top: 10px;">${selectedWeapon ? renderSelectedWeaponSummary(selectedWeapon) : '<p class="muted">未装備です。</p>'}</div>
        </div>
      `;
    }).join('')}
  `;
}

function renderWeaponEnhanceUi(weapons, weaponTypeMap) {
  const ownedWeapons = weapons.filter((weapon) => getOwnedWeaponCount(weapon.id) > 0);
  if (!ownedWeapons.length) {
    return '<h3>武器強化（仮）</h3><p class="muted">所持武器がありません。ガチャで武器を入手するとここに表示されます。</p>';
  }
  const items = ownedWeapons.map((weapon) => {
    const typeDisplay = weapon.weaponTypeDisplay || weaponTypeMap.get(weapon.weaponType)?.displayName || weapon.weaponType;
    const enhanced = getEffectiveWeaponStats(weapon);
    const nextCost = enhanced.level >= WEAPON_ENHANCE_MAX ? null : getWeaponEnhanceCost(enhanced.level);
    const buttonLabel = enhanced.level >= WEAPON_ENHANCE_MAX ? '最大強化済み' : `強化する（${nextCost} コア）`;
    const disabled = enhanced.level >= WEAPON_ENHANCE_MAX || resourceState.materialCore < nextCost ? 'disabled' : '';
    return `
      <div class="info-card" style="margin-top: 12px;">
        <h4 style="margin-top: 0; margin-bottom: 6px;">${escapeHtml(weapon.name)} <span class="muted">[${escapeHtml(typeDisplay)} / +${escapeHtml(enhanced.level)} / 所持 ${escapeHtml(getOwnedWeaponCount(weapon.id))}]</span></h4>
        <p class="muted" style="margin: 0;">現在値：HP ${escapeHtml(enhanced.hp)} / ATK ${escapeHtml(enhanced.atk)}</p>
        <p class="muted" style="margin: 6px 0 0;">強化ルール（仮）：1レベルごとに HP / ATK が +10%、最大 +10。</p>
        <div class="button-group" style="max-width: none; flex-direction: row; margin-top: 10px;"><button class="text-button weapon-enhance-button" data-weapon-enhance="${escapeHtml(weapon.id)}" ${disabled}>${escapeHtml(buttonLabel)}</button></div>
      </div>
    `;
  }).join('');
  return `<h3>武器強化（仮）</h3><p class="muted">所持マテリアルコアを使って武器を強化できます。</p>${items}`;
}

function getEquippedWeaponObjects(weapons) {
  return Object.values(formationState.equippedWeapons).map((weaponId) => weapons.find((weapon) => weapon.id === weaponId)).filter(Boolean);
}

function renderPartySkillSummary(weapons) {
  const equipped = getEquippedWeaponObjects(weapons);
  const equippedList = equipped.length ? `<ul>${equipped.map((weapon) => `<li>${escapeHtml(weapon.name)} (+${escapeHtml(getWeaponEnhanceLevel(weapon.id))})</li>`).join('')}</ul>` : '<p class="muted">まだ武器が装備されていません。</p>';
  const aggregated = aggregatePartySkills(equipped);
  const summaryItems = Object.entries(aggregated).map(([skillType, tiers]) => {
    const parts = [];
    if (tiers.large > 0) parts.push(`大 × ${tiers.large}`);
    if (tiers.middle > 0) parts.push(`中 × ${tiers.middle}`);
    if (tiers.small > 0) parts.push(`小 × ${tiers.small}`);
    const totalRate = computeAggregatedSkillRate(skillType, tiers);
    const name = skillType === 'atkUp' ? '攻撃力アップ' : skillType === 'hpUp' ? '体力アップ' : skillType;
    return `<li><strong>${escapeHtml(name)}</strong>：${escapeHtml(parts.join(' / ') || 'なし')}<br><span class="muted">最終効果量：${escapeHtml(Math.round(totalRate * 100))}%</span></li>`;
  }).join('');
  return `<h3>装備中のパーティスキル合計</h3><p class="muted">同じスキルは同段階2つで1段階上へ昇格する前提で集計しています。</p><h4>現在の装備</h4>${equippedList}<h4>集計結果</h4>${summaryItems ? `<ul>${summaryItems}</ul>` : '<p class="muted">有効なパーティスキルはありません。</p>'}`;
}

function renderFinalStatsSummary(characters, weapons) {
  const slots = [{ id: 'protagonist', name: '主人公', character: null }, ...characters.map((char) => ({ id: char.id, name: char.name, character: char }))];
  return `
    <h3>最終HP / 最終ATK</h3>
    <p class="muted">現在装備をもとに、最終値を表示しています。</p>
    <ul>
      ${slots.map((slot) => {
        const stats = computeFinalStatsForSlot(slot.id, formationState.equippedWeapons);
        return `<li><strong>${escapeHtml(slot.name)}</strong>：最終HP ${escapeHtml(stats.finalHp)} / 最終ATK ${escapeHtml(stats.finalAtk)} <span class="muted">(${escapeHtml(stats.weaponName)})</span></li>`;
      }).join('')}
    </ul>
  `;
}

function renderSaveStateSummary() {
  return `
    <h3>データ保存</h3>
    <p class="muted">装備変更・報酬獲得・武器強化・ガチャ・売却時に自動保存されます。必要に応じて手動保存 / 読み込み / リセットもできます。</p>
    <div class="button-group" style="max-width: none; flex-direction: row; flex-wrap: wrap; margin-top: 12px;">
      <button class="text-button" id="save-formation-button">いまの状態を保存</button>
      <button class="text-button" id="load-formation-button">保存した状態を読み込む</button>
      <button class="text-button" id="reset-formation-button">装備をリセット</button>
    </div>
    <p class="muted" style="margin-top: 12px;">保存キー：${escapeHtml(STORAGE_KEY)}</p>
  `;
}

function attachEquipmentEvents(weapons) {
  document.querySelectorAll('[data-equip-slot]').forEach((select) => {
    select.addEventListener('change', () => {
      const slotId = select.getAttribute('data-equip-slot');
      formationState.equippedWeapons[slotId] = select.value;
      sanitizeEquippedWeapons();
      saveGameState();
      renderFormationSection();
    });
  });
  document.querySelectorAll('[data-weapon-enhance]').forEach((button) => {
    button.addEventListener('click', () => tryEnhanceWeapon(button.getAttribute('data-weapon-enhance')));
  });
}

function attachSaveButtons() {
  document.getElementById('save-formation-button')?.addEventListener('click', () => saveGameState(true));
  document.getElementById('load-formation-button')?.addEventListener('click', () => {
    const loaded = loadSaveData();
    if (loaded) {
      sanitizeOwnedWeapons();
      sanitizeWeaponEnhancements();
      sanitizeProtectedWeapons();
      sanitizeEquippedWeapons();
      rerenderAllSections();
      alert('保存済みデータを読み込みました。');
    } else {
      alert('保存データがありません。');
    }
  });
  document.getElementById('reset-formation-button')?.addEventListener('click', () => {
    resetFormationState();
    saveGameState();
    renderFormationSection();
    alert('装備状態をリセットしました。');
  });
}

function renderFormationSection() {
  const formationScreen = document.getElementById('screen-formation');
  if (!formationScreen || !gameData.characters || !gameData.weapons) return;
  const container = formationScreen.querySelector('.screen-inner');
  if (!container) return;
  clearDynamicCards(container);

  const characters = getCharactersList();
  const weapons = getWeaponsList();
  const weaponTypeMap = getWeaponTypeMap();

  const resourceCard = createInfoCard();
  resourceCard.innerHTML = renderResourceSummaryCard('現在の所持数');
  const statsCard = createInfoCard();
  statsCard.innerHTML = `<h3>初期ステータス</h3><ul>${characters.map((char) => `<li><strong>${escapeHtml(char.name)}</strong>：HP ${escapeHtml(char.displayStats?.baseHp ?? '-')} / ATK ${escapeHtml(char.displayStats?.baseAtk ?? '-')}</li>`).join('')}</ul><p class="muted">characters.json の displayStats を表示しています。</p>`;
  const skillCard = createInfoCard();
  skillCard.innerHTML = '<h3>スキル解放ルール</h3><ul><li>Lv1：スキル1</li><li>Lv30：スキル2</li><li>Lv50：スキル3</li><li>Lv75：スキル4</li><li>必殺技：初期から使用可</li></ul>';
  const equipmentCard = createInfoCard();
  equipmentCard.innerHTML = renderEquipmentUi(characters, weapons, weaponTypeMap);
  const finalStatsCard = createInfoCard();
  finalStatsCard.innerHTML = renderFinalStatsSummary(characters, weapons);
  const totalSkillCard = createInfoCard();
  totalSkillCard.innerHTML = renderPartySkillSummary(weapons);
  const saveCard = createInfoCard();
  saveCard.innerHTML = renderSaveStateSummary();
  const enhanceCard = createInfoCard();
  enhanceCard.innerHTML = renderWeaponEnhanceUi(weapons, weaponTypeMap);

  const ownedOnly = weapons.filter((weapon) => getOwnedWeaponCount(weapon.id) > 0);
  const grouped = { 1: [], 2: [], 3: [] };
  ownedOnly.forEach((weapon) => { grouped[weapon.rarity || 1].push(weapon); });
  const weaponListCard = createInfoCard();
  weaponListCard.innerHTML = `
    <h3>所持武器一覧</h3>
    ${renderWeaponGroupHtml(grouped[1], 1, weaponTypeMap)}
    ${renderWeaponGroupHtml(grouped[2], 2, weaponTypeMap)}
    ${renderWeaponGroupHtml(grouped[3], 3, weaponTypeMap)}
    <p class="muted">所持している武器のみ表示しています。</p>
  `;

  container.appendChild(resourceCard);
  container.appendChild(statsCard);
  container.appendChild(skillCard);
  container.appendChild(equipmentCard);
  container.appendChild(finalStatsCard);
  container.appendChild(totalSkillCard);
  container.appendChild(saveCard);
  container.appendChild(enhanceCard);
  container.appendChild(weaponListCard);

  attachEquipmentEvents(weapons);
  attachSaveButtons();
}

function renderWeaponGroupHtml(weapons, rarity, weaponTypeMap) {
  if (!weapons || !weapons.length) return `<h4>★${rarity}</h4><p class="muted">なし</p>`;
  return `
    <h4>★${rarity}</h4>
    <ul>
      ${weapons.map((weapon) => {
        const typeDisplay = weapon.weaponTypeDisplay || weaponTypeMap.get(weapon.weaponType)?.displayName || weapon.weaponType;
        const enhanced = getEffectiveWeaponStats(weapon);
        const owned = getOwnedWeaponCount(weapon.id);
        const sellable = getSellableWeaponCount(weapon.id);
        const marks = `${isWeaponFavorite(weapon.id) ? ' / お気に入り' : ''}${isWeaponLocked(weapon.id) ? ' / ロック' : ''}`;
        return `<li><strong>${escapeHtml(weapon.name)}</strong> <span class="muted">[${escapeHtml(typeDisplay)} / 所持 ${escapeHtml(owned)} / 売却可 ${escapeHtml(sellable)} / +${escapeHtml(enhanced.level)}${escapeHtml(marks)}]</span><br><span class="muted">HP ${escapeHtml(enhanced.hp)} / ATK ${escapeHtml(enhanced.atk)}</span></li>`;
      }).join('')}
    </ul>
  `;
}

// -------------------------
// 開始
// -------------------------

document.addEventListener('DOMContentLoaded', () => {
  setupNavigation();
  bootstrapGameData().then((ok) => {
    if (!ok) return;
    initializeStarterWeaponsIfNeeded();
    sanitizeOwnedWeapons();
    sanitizeWeaponEnhancements();
    sanitizeProtectedWeapons();
    sanitizeEquippedWeapons();
    saveGameState();
    rerenderAllSections();
  });
});
