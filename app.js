// ナイト・オール・スクール
// MVPプロトタイプ統合版
// - 画面遷移
// - story / characters / battles / weapons 読み込み
// - 冒険画面：ストーリー本文 / バトル情報 / バトル最小UI
// - 編成画面：装備UI / 最終HP・ATK / localStorage保存
// - バトル最小UI：1ターン分の簡易実行（HP減少あり）
// - 勝利 / 敗北判定と報酬表示

const STORAGE_KEY = 'night-all-school-save-v3';

const screens = {
  title: document.getElementById('screen-title'),
  menu: document.getElementById('screen-menu'),
  adventure: document.getElementById('screen-adventure'),
  formation: document.getElementById('screen-formation'),
  bond: document.getElementById('screen-bond'),
  gacha: document.getElementById('screen-gacha')
};

const gameData = {
  story: null,
  characters: null,
  battles: null,
  weapons: null
};

const storyReaderState = {
  currentStoryId: null,
  currentSceneIndex: 0
};

const formationState = {
  equippedWeapons: {
    protagonist: '',
    char_towa: '',
    char_hinano: '',
    char_suzu: ''
  }
};

const progressState = {
  clearedBattles: []
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
// 基本ユーティリティ
// -------------------------

function escapeHtml(value) {
  return String(value)
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

// -------------------------
// セーブ / ロード
// -------------------------

function getDefaultSaveState() {
  return {
    equippedWeapons: {
      protagonist: '',
      char_towa: '',
      char_hinano: '',
      char_suzu: ''
    },
    clearedBattles: []
  };
}

function saveGameState(showMessage = false) {
  try {
    const payload = {
      version: 'mvp-v1.2',
      savedAt: new Date().toISOString(),
      equippedWeapons: formationState.equippedWeapons,
      clearedBattles: progressState.clearedBattles
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

    formationState.equippedWeapons = {
      ...defaults.equippedWeapons,
      ...(parsed?.equippedWeapons || {})
    };
    progressState.clearedBattles = Array.isArray(parsed?.clearedBattles)
      ? [...parsed.clearedBattles]
      : [];
    return true;
  } catch (error) {
    console.error('loadSaveData error:', error);
    return false;
  }
}

function resetFormationState() {
  formationState.equippedWeapons = { ...getDefaultSaveState().equippedWeapons };
}

function sanitizeEquippedWeapons() {
  const weapons = gameData.weapons?.weapons || [];
  const weaponSet = new Set(weapons.map((weapon) => weapon.id));

  Object.keys(formationState.equippedWeapons).forEach((slotId) => {
    const weaponId = formationState.equippedWeapons[slotId];
    if (!weaponId) return;
    if (!weaponSet.has(weaponId)) {
      formationState.equippedWeapons[slotId] = '';
      return;
    }

    if (slotId === 'protagonist') return;

    const character = (gameData.characters?.characters || []).find((char) => char.id === slotId);
    const weapon = weapons.find((item) => item.id === weaponId);
    if (!character || !weapon) {
      formationState.equippedWeapons[slotId] = '';
      return;
    }

    const affinity = character.weaponAffinity || [];
    if (affinity.length && !affinity.includes(weapon.weaponType)) {
      formationState.equippedWeapons[slotId] = '';
    }
  });
}

// -------------------------
// ナビゲーション
// -------------------------

function setupNavigation() {
  document.querySelector('[data-action="start"]')?.addEventListener('click', () => {
    showScreen('menu');
  });

  document.querySelector('[data-action="load"]')?.addEventListener('click', () => {
    const loaded = loadSaveData();
    if (loaded) {
      sanitizeEquippedWeapons();
      renderFormationSection();
      alert('保存済みデータを読み込みました。');
      showScreen('menu');
    } else {
      alert('保存データがありません。');
    }
  });

  document.querySelector('[data-action="settings"]')?.addEventListener('click', () => {
    alert('設定画面 は後続実装予定です。');
  });

  document.querySelectorAll('[data-screen]').forEach((button) => {
    button.addEventListener('click', () => {
      const target = button.getAttribute('data-screen');
      showScreen(target);
    });
  });

  document.querySelectorAll('[data-back]').forEach((button) => {
    button.addEventListener('click', () => {
      const target = button.getAttribute('data-back');
      showScreen(target);
    });
  });
}

// -------------------------
// データ読み込み
// -------------------------

async function bootstrapGameData() {
  try {
    const [story, characters, battles, weapons] = await Promise.all([
      loadJson('story.json'),
      loadJson('characters.json'),
      loadJson('battles.json'),
      loadJson('weapons.json')
    ]);

    gameData.story = story;
    gameData.characters = characters;
    gameData.battles = battles;
    gameData.weapons = weapons;

    loadSaveData();
    sanitizeEquippedWeapons();

    renderAdventureSection();
    renderFormationSection();
  } catch (error) {
    console.error(error);
    renderLoadError(error);
  }
}

function renderLoadError(error) {
  const targets = [document.getElementById('screen-adventure'), document.getElementById('screen-formation')];
  targets.forEach((screen) => {
    if (!screen) return;
    const container = screen.querySelector('.screen-inner');
    if (!container) return;
    clearDynamicCards(container);

    const errorCard = createInfoCard();
    errorCard.innerHTML = `
      <h3>データ読み込みエラー</h3>
      <p class="muted">JSON の読み込みに失敗しました。</p>
      <p class="muted">${escapeHtml(error.message)}</p>
      <p class="muted">※ index.html を直接ダブルクリックすると fetch が失敗することがあります。ローカルサーバーまたは Cloudflare Pages 上で確認してください。</p>
    `;
    container.appendChild(errorCard);
  });
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
  const characterMap = new Map((gameData.characters?.characters || []).map((c) => [c.id, c]));
  const nodeOrder = ['story_1_1', 'story_1_2', 'battle_1_1', 'story_1_3', 'battle_1_2', 'battle_1_3'];
  const storyMap = new Map(stories.map((item) => [item.id, item]));
  const battleMap = new Map(battles.map((item) => [item.id, item]));

  const timelineCard = createInfoCard();
  timelineCard.innerHTML = `
    <h3>${escapeHtml(chapterTitle)}</h3>
    <ol class="story-list">
      ${nodeOrder.map((nodeId) => {
        const story = storyMap.get(nodeId);
        const battle = battleMap.get(nodeId);

        if (story) {
          const unlockText = getStoryUnlockText(story, characterMap);
          return `
            <li>
              <strong>ストーリー</strong>：${escapeHtml(story.title)}
              <span class="muted">(${escapeHtml(story.id)})</span><br>
              ${unlockText ? `<span class="muted">${escapeHtml(unlockText)}</span><br>` : ''}
              <button class="text-button story-open-button" data-story-id="${escapeHtml(story.id)}">本文を読む</button>
            </li>
          `;
        }

        if (battle) {
          const reward = battle.firstClearReward
            ? `初回: コア ${battle.firstClearReward.materialCore ?? 0} / EXP ${battle.firstClearReward.exp ?? 0}`
            : '報酬未設定';
          const repeat = battle.repeatReward ? `再挑戦: EXP ${battle.repeatReward.exp ?? 0}` : '';
          const clearedMark = progressState.clearedBattles.includes(battle.id) ? ' / クリア済み' : '';
          return `
            <li>
              <strong>バトル</strong>：${escapeHtml(battle.title)}
              <span class="muted">(${escapeHtml(battle.id)}${escapeHtml(clearedMark)})</span><br>
              <span class="muted">${escapeHtml(reward)}</span>
              ${repeat ? `<br><span class="muted">${escapeHtml(repeat)}</span>` : ''}
              <br>
              <button class="text-button battle-preview-button" data-battle-id="${escapeHtml(battle.id)}">バトル情報</button>
              <button class="text-button battle-open-button" data-battle-id="${escapeHtml(battle.id)}">バトルUIを開く</button>
            </li>
          `;
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
      <li>第1章クリア：マテリアルコア 50個</li>
      <li>再挑戦報酬：経験値のみ</li>
    </ul>
  `;

  const readerCard = createInfoCard('story-reader-card');
  readerCard.innerHTML = `
    <h3>ストーリー本文ビューア</h3>
    <p class="muted">「本文を読む」を押すと、ここに本文が表示されます。</p>
  `;

  const battleUiCard = createInfoCard('battle-ui-card');
  battleUiCard.innerHTML = `
    <h3>バトル最小UI</h3>
    <p class="muted">「バトルUIを開く」を押すと、ここに主人公 / 味方 / 敵 / 行動ボタンの最小UIが表示されます。</p>
  `;

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
  document.querySelectorAll('.story-open-button').forEach((button) => {
    button.addEventListener('click', () => openStoryReader(button.getAttribute('data-story-id')));
  });
  document.querySelectorAll('.battle-preview-button').forEach((button) => {
    button.addEventListener('click', () => openBattlePreview(button.getAttribute('data-battle-id')));
  });
  document.querySelectorAll('.battle-open-button').forEach((button) => {
    button.addEventListener('click', () => openBattleUi(button.getAttribute('data-battle-id')));
  });
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
    readerCard.innerHTML = `
      <h3>ストーリー本文ビューア</h3>
      <p class="muted">「本文を読む」を押すと、ここに本文が表示されます。</p>
    `;
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
    <div class="status-row"><span>種類</span><strong>${escapeHtml(scene.speakerType || 'dialogue')}</strong></div>
    <div class="status-row"><span>背景</span><strong>${escapeHtml(scene.bg || '未設定')}</strong></div>
    <div class="status-row"><span>BGM</span><strong>${escapeHtml(scene.bgm || '未設定')}</strong></div>
    <div class="status-row"><span>SE</span><strong>${escapeHtml(scene.sfx || 'なし')}</strong></div>
    <div class="status-row"><span>感情</span><strong>${escapeHtml(scene.emotion || 'normal')}</strong></div>
    <div class="info-card" style="margin-top: 16px;">
      <p style="white-space: pre-wrap; margin: 0;">${escapeHtml(scene.text || '')}</p>
    </div>
    <div class="button-group" style="margin-top: 18px; max-width: none; flex-direction: row; flex-wrap: wrap;">
      <button class="text-button" id="story-prev-button">前へ</button>
      <button class="text-button" id="story-next-button">次へ</button>
      <button class="text-button" id="story-close-button">閉じる</button>
    </div>
  `;

  document.getElementById('story-prev-button')?.addEventListener('click', () => {
    storyReaderState.currentSceneIndex = Math.max(0, storyReaderState.currentSceneIndex - 1);
    renderStoryReader();
  });
  document.getElementById('story-next-button')?.addEventListener('click', () => {
    storyReaderState.currentSceneIndex = Math.min(Math.max(0, maxIndex), storyReaderState.currentSceneIndex + 1);
    renderStoryReader();
  });
  document.getElementById('story-close-button')?.addEventListener('click', () => {
    storyReaderState.currentStoryId = null;
    storyReaderState.currentSceneIndex = 0;
    renderStoryReader();
  });
}

// -------------------------
// バトル情報プレビュー
// -------------------------

function openBattlePreview(battleId) {
  const battle = (gameData.battles?.battles || []).find((item) => item.id === battleId);
  const readerCard = document.getElementById('story-reader-card');
  if (!battle || !readerCard) return;

  const enemyTemplates = new Map((gameData.battles?.enemyTemplates || []).map((enemy) => [enemy.id, enemy]));
  const enemyList = (battle.enemyGroup || []).map((enemy) => {
    const tmpl = enemyTemplates.get(enemy.enemyId);
    return `${tmpl?.name || enemy.enemyId} (${enemy.instanceId})`;
  });

  readerCard.innerHTML = `
    <h3>${escapeHtml(battle.title)}</h3>
    <p class="muted">${escapeHtml(battle.id)} / ${escapeHtml(battle.battleType)}</p>
    <div class="status-row"><span>推奨レベル</span><strong>${escapeHtml(battle.recommendedLevel ?? '-')}</strong></div>
    <div class="status-row"><span>難易度</span><strong>${escapeHtml(battle.difficulty ?? '-')}</strong></div>
    <div class="info-card" style="margin-top: 16px;">
      <h3 style="margin-top: 0;">敵編成</h3>
      <ul>${enemyList.map((name) => `<li>${escapeHtml(name)}</li>`).join('')}</ul>
      <p class="muted">初回報酬：コア ${escapeHtml(battle.firstClearReward?.materialCore ?? 0)} / EXP ${escapeHtml(battle.firstClearReward?.exp ?? 0)}</p>
      <p class="muted">再挑戦報酬：EXP ${escapeHtml(battle.repeatReward?.exp ?? 0)}</p>
    </div>
    <div class="button-group" style="margin-top: 18px; max-width: none; flex-direction: row;">
      <button class="text-button" id="battle-close-button">閉じる</button>
    </div>
  `;

  document.getElementById('battle-close-button')?.addEventListener('click', () => {
    storyReaderState.currentStoryId = null;
    storyReaderState.currentSceneIndex = 0;
    renderStoryReader();
  });
}

// -------------------------
// 編成画面
// -------------------------

function getAvailableWeaponsForSlot(slot, weapons) {
  if (slot.id === 'protagonist' || !slot.affinity || !slot.affinity.length) return weapons;
  return weapons.filter((weapon) => slot.affinity.includes(weapon.weaponType));
}

function renderSelectedWeaponSummary(weapon) {
  const skills = (weapon.partySkills || []).map((skill) => `${skill.displayName}（${skill.tierLabel}）`).join(' / ') || 'なし';
  return `
    <p style="margin: 0;"><strong>${escapeHtml(weapon.name)}</strong></p>
    <p class="muted" style="margin: 6px 0 0;">HP ${escapeHtml(weapon.baseStats?.hp ?? 0)} / ATK ${escapeHtml(weapon.baseStats?.atk ?? 0)}</p>
    <p class="muted" style="margin: 6px 0 0;">スキル：${escapeHtml(skills)}</p>
  `;
}

function renderEquipmentUi(characters, weapons, weaponTypeMap) {
  const slots = [
    { id: 'protagonist', name: '主人公', affinity: null },
    ...characters.map((char) => ({ id: char.id, name: char.name, affinity: char.weaponAffinity || [] }))
  ];

  return `
    <h3>装備設定</h3>
    <p class="muted">主人公 / トワ / ヒナノ / スズ の4枠に武器を設定できます。主人公は全武器、メンバーは適性武器のみ表示しています。</p>
    ${slots.map((slot) => {
      const currentWeaponId = formationState.equippedWeapons[slot.id] || '';
      const availableWeapons = getAvailableWeaponsForSlot(slot, weapons);
      const selectedWeapon = weapons.find((weapon) => weapon.id === currentWeaponId);
      const options = [
        `<option value="">未装備</option>`,
        ...availableWeapons.map((weapon) => {
          const selected = weapon.id === currentWeaponId ? 'selected' : '';
          const typeDisplay = weapon.weaponTypeDisplay || weaponTypeMap.get(weapon.weaponType)?.displayName || weapon.weaponType;
          return `<option value="${escapeHtml(weapon.id)}" ${selected}>${escapeHtml(weapon.name)} [${escapeHtml(typeDisplay)}]</option>`;
        })
      ].join('');

      return `
        <div class="info-card" style="margin-top: 12px;">
          <h4 style="margin-top: 0; margin-bottom: 8px;">${escapeHtml(slot.name)} の装備枠</h4>
          <label class="muted" for="equip-${escapeHtml(slot.id)}">武器を選択</label><br>
          <select id="equip-${escapeHtml(slot.id)}" data-equip-slot="${escapeHtml(slot.id)}" style="width: 100%; margin-top: 8px; padding: 10px; border-radius: 12px; border: 1px solid #2d3966; background: #0f1630; color: #eef2ff;">
            ${options}
          </select>
          <div style="margin-top: 10px;">
            ${selectedWeapon ? renderSelectedWeaponSummary(selectedWeapon) : '<p class="muted">未装備です。</p>'}
          </div>
        </div>
      `;
    }).join('')}
  `;
}

function getEquippedWeaponObjects(weapons) {
  return Object.values(formationState.equippedWeapons)
    .map((weaponId) => weapons.find((weapon) => weapon.id === weaponId))
    .filter(Boolean);
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
    result[skillType].small = result[skillType].small % 2;
    result[skillType].middle += smallToMiddle;

    const middleToLarge = Math.floor(result[skillType].middle / 2);
    result[skillType].middle = result[skillType].middle % 2;
    result[skillType].large += middleToLarge;
  });

  return result;
}

function computeAggregatedSkillRate(skillType, tiers) {
  const defs = gameData.weapons?.meta?.partySkillDefs?.[skillType]?.tiers;
  if (!defs) return 0;
  return (tiers.small * (defs.small?.value || 0)) +
         (tiers.middle * (defs.middle?.value || 0)) +
         (tiers.large * (defs.large?.value || 0));
}

function renderPartySkillSummary(weapons) {
  const equipped = getEquippedWeaponObjects(weapons);
  const equippedList = equipped.length
    ? `<ul>${equipped.map((weapon) => `<li>${escapeHtml(weapon.name)} (${escapeHtml(weapon.id)})</li>`).join('')}</ul>`
    : '<p class="muted">まだ武器が装備されていません。</p>';

  const aggregated = aggregatePartySkills(equipped);
  const summaryItems = Object.entries(aggregated).map(([skillType, tiers]) => {
    const parts = [];
    if (tiers.large > 0) parts.push(`大 × ${tiers.large}`);
    if (tiers.middle > 0) parts.push(`中 × ${tiers.middle}`);
    if (tiers.small > 0) parts.push(`小 × ${tiers.small}`);
    const totalRate = computeAggregatedSkillRate(skillType, tiers);
    const name = skillType === 'atkUp' ? '攻撃力アップ' : skillType === 'hpUp' ? '体力アップ' : skillType;
    return `
      <li>
        <strong>${escapeHtml(name)}</strong>：${escapeHtml(parts.join(' / ') || 'なし')}
        <br><span class="muted">最終効果量：${escapeHtml(Math.round(totalRate * 100))}%</span>
      </li>
    `;
  }).join('');

  return `
    <h3>装備中のパーティスキル合計</h3>
    <p class="muted">同じスキルは同段階2つで1段階上へ昇格する前提で集計しています。</p>
    <h4>現在の装備</h4>
    ${equippedList}
    <h4>集計結果</h4>
    ${summaryItems ? `<ul>${summaryItems}</ul>` : '<p class="muted">有効なパーティスキルはありません。</p>'}
  `;
}

function renderFinalStatsSummary(characters, weapons) {
  const slots = [
    { id: 'protagonist', name: '主人公', character: null },
    ...characters.map((char) => ({ id: char.id, name: char.name, character: char }))
  ];

  const equipped = getEquippedWeaponObjects(weapons);
  const aggregated = aggregatePartySkills(equipped);
  const atkBonusRate = computeAggregatedSkillRate('atkUp', aggregated.atkUp || { small: 0, middle: 0, large: 0 });
  const hpBonusRate = computeAggregatedSkillRate('hpUp', aggregated.hpUp || { small: 0, middle: 0, large: 0 });

  return `
    <h3>最終HP / 最終ATK</h3>
    <p class="muted">現在は「基礎値 + 武器値」に、装備中のパーティスキル（HPアップ / ATKアップ）を適用した暫定表示です。女神 / 友情 / 聖獣補正はまだ反映していません。</p>
    <p class="muted">現在のパーティ補正：HP +${escapeHtml(Math.round(hpBonusRate * 100))}% / ATK +${escapeHtml(Math.round(atkBonusRate * 100))}%</p>
    <ul>
      ${slots.map((slot) => {
        const weapon = weapons.find((item) => item.id === formationState.equippedWeapons[slot.id]);
        const baseHp = slot.character?.displayStats?.baseHp ?? 0;
        const baseAtk = slot.character?.displayStats?.baseAtk ?? 0;
        const weaponHp = weapon?.baseStats?.hp ?? 0;
        const weaponAtk = weapon?.baseStats?.atk ?? 0;
        const finalHp = Math.floor((baseHp + weaponHp) * (1 + hpBonusRate));
        const finalAtk = Math.floor((baseAtk + weaponAtk) * (1 + atkBonusRate));
        const note = slot.id === 'protagonist'
          ? '※ 主人公の基礎HP / ATK は未設定のため、武器補正 + パーティスキルのみ仮反映'
          : `基礎HP ${baseHp} + 武器HP ${weaponHp}, 基礎ATK ${baseAtk} + 武器ATK ${weaponAtk}`;
        return `
          <li>
            <strong>${escapeHtml(slot.name)}</strong>：最終HP ${escapeHtml(finalHp)} / 最終ATK ${escapeHtml(finalAtk)}
            <br><span class="muted">${escapeHtml(note)}</span>
          </li>
        `;
      }).join('')}
    </ul>
  `;
}

function renderSaveStateSummary() {
  return `
    <h3>装備状態の保存</h3>
    <p class="muted">装備変更時に自動保存されます。必要に応じて手動保存 / 読み込み / リセットもできます。</p>
    <div class="button-group" style="max-width: none; flex-direction: row; flex-wrap: wrap; margin-top: 12px;">
      <button class="text-button" id="save-formation-button">いまの装備を保存</button>
      <button class="text-button" id="load-formation-button">保存した装備を読み込む</button>
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
      saveFormationState();
      renderFormationSection();
    });
  });
}

function attachSaveButtons() {
  document.getElementById('save-formation-button')?.addEventListener('click', () => saveFormationState(true));
  document.getElementById('load-formation-button')?.addEventListener('click', () => {
    const loaded = loadSaveData();
    if (loaded) {
      sanitizeEquippedWeapons();
      renderFormationSection();
      alert('保存済みの装備状態を読み込みました。');
    } else {
      alert('保存データがありません。');
    }
  });
  document.getElementById('reset-formation-button')?.addEventListener('click', () => {
    resetFormationState();
    saveFormationState();
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

  const characters = gameData.characters.characters || [];
  const weapons = gameData.weapons.weapons || [];
  const weaponTypeMap = new Map(Object.entries(gameData.weapons.meta?.weaponTypeRules || {}));

  const statsCard = createInfoCard();
  statsCard.innerHTML = `
    <h3>初期ステータス</h3>
    <ul>
      ${characters.map((char) => `<li><strong>${escapeHtml(char.name)}</strong>：HP ${escapeHtml(char.displayStats?.baseHp ?? '-')} / ATK ${escapeHtml(char.displayStats?.baseAtk ?? '-')}</li>`).join('')}
    </ul>
    <p class="muted">characters.json の displayStats を表示しています。</p>
  `;

  const skillCard = createInfoCard();
  skillCard.innerHTML = `
    <h3>スキル解放ルール</h3>
    <ul>
      <li>Lv1：スキル1</li>
      <li>Lv30：スキル2</li>
      <li>Lv50：スキル3</li>
      <li>Lv75：スキル4</li>
      <li>必殺技：初期から使用可</li>
    </ul>
  `;

  const equipmentCard = createInfoCard();
  equipmentCard.innerHTML = renderEquipmentUi(characters, weapons, weaponTypeMap);

  const finalStatsCard = createInfoCard();
  finalStatsCard.innerHTML = renderFinalStatsSummary(characters, weapons);

  const totalSkillCard = createInfoCard();
  totalSkillCard.innerHTML = renderPartySkillSummary(weapons);

  const saveCard = createInfoCard();
  saveCard.innerHTML = renderSaveStateSummary();

  const grouped = groupWeaponsByRarity(weapons);
  const weaponListCard = createInfoCard();
  weaponListCard.innerHTML = `
    <h3>武器一覧（weapons.json 読み込み）</h3>
    ${renderWeaponGroupHtml(grouped[1] || [], 1, weaponTypeMap)}
    ${renderWeaponGroupHtml(grouped[2] || [], 2, weaponTypeMap)}
    ${renderWeaponGroupHtml(grouped[3] || [], 3, weaponTypeMap)}
    <p class="muted">武器は主人公 + メンバー3人の合計4本装備、パーティスキルは全体へ適用されます。</p>
  `;

  container.appendChild(statsCard);
  container.appendChild(skillCard);
  container.appendChild(equipmentCard);
  container.appendChild(finalStatsCard);
  container.appendChild(totalSkillCard);
  container.appendChild(saveCard);
  container.appendChild(weaponListCard);

  attachEquipmentEvents(weapons);
  attachSaveButtons();
}

function groupWeaponsByRarity(weapons) {
  return weapons.reduce((acc, weapon) => {
    const rarity = weapon.rarity || 1;
    if (!acc[rarity]) acc[rarity] = [];
    acc[rarity].push(weapon);
    return acc;
  }, {});
}

function renderWeaponGroupHtml(weapons, rarity, weaponTypeMap) {
  if (!weapons.length) return `<h4>★${rarity}</h4><p class="muted">データなし</p>`;

  return `
    <h4>★${rarity}</h4>
    <ul>
      ${weapons.map((weapon) => {
        const typeDisplay = weapon.weaponTypeDisplay || weaponTypeMap.get(weapon.weaponType)?.displayName || weapon.weaponType;
        const hp = weapon.baseStats?.hp ?? 0;
        const atk = weapon.baseStats?.atk ?? 0;
        const skills = (weapon.partySkills || []).map((skill) => `${skill.displayName}（${skill.tierLabel}）`).join(' / ') || 'なし';
        return `
          <li>
            <strong>${escapeHtml(weapon.name)}</strong>
            <span class="muted">[${escapeHtml(typeDisplay)} / ${escapeHtml(weapon.id)}]</span><br>
            <span class="muted">HP ${escapeHtml(hp)} / ATK ${escapeHtml(atk)}</span><br>
            <span class="muted">スキル：${escapeHtml(skills)}</span>
          </li>
        `;
      }).join('')}
    </ul>
  `;
}

// -------------------------
// バトル最小UI + 1ターン実行
// -------------------------

function createBattleRuntime(battle) {
  const characters = gameData.characters?.characters || [];
  const weapons = gameData.weapons?.weapons || [];
  const enemyTemplates = new Map((gameData.battles?.enemyTemplates || []).map((enemy) => [enemy.id, enemy]));

  const party = [];

  const protagonistWeapon = weapons.find((item) => item.id === formationState.equippedWeapons.protagonist);
  const equipped = getEquippedWeaponObjects(weapons);
  const aggregated = aggregatePartySkills(equipped);
  const atkBonusRate = computeAggregatedSkillRate('atkUp', aggregated.atkUp || { small: 0, middle: 0, large: 0 });
  const hpBonusRate = computeAggregatedSkillRate('hpUp', aggregated.hpUp || { small: 0, middle: 0, large: 0 });
  const protagonistBaseHp = 1;
  const protagonistBaseAtk = 1;
  const protagonistHp = Math.max(1, Math.floor((protagonistBaseHp + (protagonistWeapon?.baseStats?.hp ?? 0)) * (1 + hpBonusRate)));
  const protagonistAtk = Math.max(1, Math.floor((protagonistBaseAtk + (protagonistWeapon?.baseStats?.atk ?? 0)) * (1 + atkBonusRate)));

  party.push({
    id: 'protagonist',
    name: '主人公',
    currentHp: protagonistHp,
    maxHp: protagonistHp,
    atk: protagonistAtk,
    guarding: false,
    alive: true,
    gauge: 0
  });

  characters.forEach((char) => {
    const result = computeUnitFinalStats(char, char.id, weapons);
    party.push({
      id: char.id,
      name: char.name,
      currentHp: Math.max(1, result.finalHp),
      maxHp: Math.max(1, result.finalHp),
      atk: Math.max(1, result.finalAtk),
      guarding: false,
      alive: true,
      gauge: 0
    });
  });

  const enemies = (battle.enemyGroup || []).map((enemyRef) => {
    const tmpl = enemyTemplates.get(enemyRef.enemyId);
    const hp = Math.max(1, tmpl?.displayStats?.hp ?? 1);
    const atk = Math.max(1, tmpl?.displayStats?.atk ?? 1);
    return {
      id: enemyRef.instanceId,
      templateId: enemyRef.enemyId,
      name: tmpl?.name || enemyRef.enemyId,
      currentHp: hp,
      maxHp: hp,
      atk,
      alive: true,
      normalAttackName: tmpl?.normalAttack?.name || '通常攻撃',
      firstSkillName: tmpl?.skills?.[0]?.name || null
    };
  });

  return { party, enemies };
}

function openBattleUi(battleId) {
  const battle = (gameData.battles?.battles || []).find((item) => item.id === battleId);
  if (!battle) return;

  battleUiState.currentBattleId = battleId;
  battleUiState.protagonistAction = 'wait';
  battleUiState.turnCount = 0;
  battleUiState.turnLog = [];
  battleUiState.runtime = createBattleRuntime(battle);
  battleUiState.result = null;
  battleUiState.partyChoices = {
    char_towa: { useSkill: false, useBurst: false, action: 'attack' },
    char_hinano: { useSkill: false, useBurst: false, action: 'attack' },
    char_suzu: { useSkill: false, useBurst: false, action: 'attack' }
  };

  renderBattleUi();
}

function getAliveTarget(units) {
  return units.find((unit) => unit.alive && unit.currentHp > 0) || null;
}

function applyDamage(target, damage) {
  if (!target || !target.alive) return 0;
  const before = target.currentHp;
  target.currentHp = Math.max(0, target.currentHp - damage);
  if (target.currentHp <= 0) {
    target.alive = false;
    target.currentHp = 0;
  }
  return before - target.currentHp;
}

function calculateSimpleDamage(atk, options = {}) {
  let damage = Math.max(1, Math.floor(atk));
  if (options.useSkill) damage = Math.max(1, Math.floor(damage * 1.2));
  if (options.useBurst) damage = Math.max(1, Math.floor(damage * 1.7));
  if (options.targetGuarding) damage = Math.max(1, Math.floor(damage * 0.2));
  return damage;
}

function buildBattleRewardResult(battle, isVictory) {
  if (!isVictory) {
    return {
      status: 'defeat',
      title: '敗北',
      lines: ['報酬はありません。装備や行動を見直して再挑戦しましょう。'],
      rewards: { materialCore: 0, exp: 0 },
      newlyCleared: false
    };
  }

  const newlyCleared = !progressState.clearedBattles.includes(battle.id);
  let materialCore = 0;
  let exp = 0;
  const lines = [];

  if (newlyCleared) {
    materialCore += battle.firstClearReward?.materialCore ?? 0;
    exp += battle.firstClearReward?.exp ?? 0;
    lines.push(`初回クリア報酬：マテリアルコア ${battle.firstClearReward?.materialCore ?? 0} / EXP ${battle.firstClearReward?.exp ?? 0}`);

    if (battle.chapterClearReward?.materialCore) {
      materialCore += battle.chapterClearReward.materialCore;
      lines.push(`章クリア報酬：マテリアルコア ${battle.chapterClearReward.materialCore}`);
    }

    progressState.clearedBattles.push(battle.id);
    saveGameState();
  } else {
    exp += battle.repeatReward?.exp ?? 0;
    lines.push(`再挑戦報酬：EXP ${battle.repeatReward?.exp ?? 0}`);
  }

  lines.push('※ 現在は報酬表示のみです。所持コアや経験値プールへの本保存は後続実装です。');

  return {
    status: 'victory',
    title: '勝利',
    lines,
    rewards: { materialCore, exp },
    newlyCleared
  };
}

function simulateBattleTurn() {
  const battle = (gameData.battles?.battles || []).find((item) => item.id === battleUiState.currentBattleId);
  const runtime = battleUiState.runtime;
  if (!battle || !runtime) return;
  if (battleUiState.result) return;

  battleUiState.turnCount += 1;
  const lines = [];

  runtime.party.forEach((unit) => {
    unit.guarding = false;
  });

  if (battleUiState.protagonistAction === 'skill') {
    lines.push('主人公は司令スキルを発動した。');
  } else {
    lines.push('主人公は待機した。');
  }

  ['char_towa', 'char_hinano', 'char_suzu'].forEach((memberId) => {
    const choice = battleUiState.partyChoices[memberId];
    const actor = runtime.party.find((unit) => unit.id === memberId);
    if (!choice || !actor || !actor.alive) return;

    if (choice.action === 'guard') {
      actor.guarding = true;
      lines.push(`${actor.name} は防御を選択し、被ダメージを大きく軽減する構えを取った。`);
      return;
    }

    const target = getAliveTarget(runtime.enemies);
    if (!target) {
      lines.push(`${actor.name} は攻撃対象がいないため行動を終了した。`);
      return;
    }

    const modifierText = [];
    if (choice.useSkill) modifierText.push('スキル');
    if (choice.useBurst) modifierText.push('必殺');
    const damage = calculateSimpleDamage(actor.atk, { useSkill: choice.useSkill, useBurst: choice.useBurst, targetGuarding: false });
    const actual = applyDamage(target, damage);
    const prefix = modifierText.length ? `${modifierText.join(' + ')}付きの攻撃` : '通常攻撃';
    lines.push(`${actor.name} は ${prefix} で ${target.name} に ${actual} ダメージ。`);
    if (!target.alive) lines.push(`${target.name} は撃破された。`);
  });

  runtime.enemies.forEach((enemy, index) => {
    if (!enemy.alive) return;

    const target = getAliveTarget(runtime.party);
    if (!target) {
      lines.push(`${enemy.name} は攻撃対象がいない。`);
      return;
    }

    const useSkill = (battleUiState.turnCount + index) % 2 === 0 && !!enemy.firstSkillName;
    const damage = calculateSimpleDamage(enemy.atk, { useSkill, useBurst: false, targetGuarding: target.guarding });
    const actual = applyDamage(target, damage);
    const actionName = useSkill ? enemy.firstSkillName : enemy.normalAttackName;
    lines.push(`${enemy.name} は ${actionName} で ${target.name} に ${actual} ダメージ。`);
    if (target.guarding) lines.push(`${target.name} は防御中だったためダメージを軽減した。`);
    if (!target.alive) lines.push(`${target.name} は戦闘不能になった。`);
  });

  const allEnemiesDown = runtime.enemies.every((enemy) => !enemy.alive);
  const allPartyDown = runtime.party.every((unit) => !unit.alive);

  if (allEnemiesDown) {
    lines.push('敵が全滅した。味方の勝利。');
    battleUiState.result = buildBattleRewardResult(battle, true);
    lines.push(...battleUiState.result.lines);
    renderAdventureSection();
  } else if (allPartyDown) {
    lines.push('味方が全滅した。敗北。');
    battleUiState.result = buildBattleRewardResult(battle, false);
    lines.push(...battleUiState.result.lines);
  } else {
    lines.push('ターン終了。次ターンへ。');
  }

  lines.push('※ 現在は簡易ダメージ版です。CT・必殺ゲージ・状態異常・厳密な防御計算は未実装です。');

  battleUiState.turnLog.unshift({ turn: battleUiState.turnCount, lines });
  battleUiState.turnLog = battleUiState.turnLog.slice(0, 8);
}

function renderBattleResultPanel() {
  if (!battleUiState.result) return '';

  const result = battleUiState.result;
  const color = result.status === 'victory' ? '#7cf3d0' : '#ff8f8f';
  return `
    <div class="info-card" style="margin-top: 12px; border-color: ${color};">
      <h4 style="margin-top: 0; color: ${color};">${escapeHtml(result.title)}</h4>
      <p class="muted">獲得報酬：マテリアルコア ${escapeHtml(result.rewards.materialCore)} / EXP ${escapeHtml(result.rewards.exp)}</p>
      <ul>${result.lines.map((line) => `<li>${escapeHtml(line)}</li>`).join('')}</ul>
    </div>
  `;
}

function renderBattleUi() {
  const battleUiCard = document.getElementById('battle-ui-card');
  if (!battleUiCard) return;

  const battle = (gameData.battles?.battles || []).find((item) => item.id === battleUiState.currentBattleId);
  const runtime = battleUiState.runtime;
  if (!battle || !runtime) {
    battleUiCard.innerHTML = `
      <h3>バトル最小UI</h3>
      <p class="muted">「バトルUIを開く」を押すと、ここに主人公 / 味方 / 敵 / 行動ボタンの最小UIが表示されます。</p>
    `;
    return;
  }

  const characters = gameData.characters?.characters || [];
  const weapons = gameData.weapons?.weapons || [];

  const playerUnitRows = [
    renderBattleProtagonistRow(runtime.party.find((unit) => unit.id === 'protagonist'), weapons),
    ...characters.map((char) => renderBattleMemberRow(char, weapons, runtime.party.find((unit) => unit.id === char.id)))
  ].join('');

  const enemyRows = runtime.enemies.map((enemy) => renderEnemyRowFromRuntime(enemy)).join('');

  battleUiCard.innerHTML = `
    <h3>バトル最小UI：${escapeHtml(battle.title)}</h3>
    <p class="muted">主人公 → 味方（編成順）→ 敵 の流れを確認するための最小UIです。今回は 1ターン分の簡易ダメージ実行と、勝敗後の報酬表示まで行います。</p>

    <div class="info-card" style="margin-top: 12px;">
      <h4 style="margin-top: 0;">味方ユニット</h4>
      ${playerUnitRows}
    </div>

    <div class="info-card" style="margin-top: 12px;">
      <h4 style="margin-top: 0;">敵ユニット</h4>
      ${enemyRows}
    </div>

    <div class="info-card" style="margin-top: 12px;">
      <h4 style="margin-top: 0;">現在の行動プレビュー</h4>
      ${renderBattleChoiceSummary()}
    </div>

    <div class="info-card" style="margin-top: 12px;">
      <h4 style="margin-top: 0;">1ターン分の実行ログ</h4>
      ${renderBattleLog()}
    </div>

    ${renderBattleResultPanel()}

    <div class="button-group" style="margin-top: 18px; max-width: none; flex-direction: row; flex-wrap: wrap;">
      <button class="text-button" id="battle-apply-plan" ${battleUiState.result ? 'disabled' : ''}>この行動で1ターン進む</button>
      <button class="text-button" id="battle-reset-plan">バトルをリセット</button>
      <button class="text-button" id="battle-close-ui">バトルUIを閉じる</button>
    </div>
  `;

  attachBattleUiEvents();
}

function renderBattleProtagonistRow(protagonist, weapons) {
  const weapon = weapons.find((item) => item.id === formationState.equippedWeapons.protagonist);
  const skills = weapon ? (weapon.partySkills || []).map((skill) => `${skill.displayName}（${skill.tierLabel}）`).join(' / ') : '未装備';
  const hp = protagonist?.currentHp ?? 0;
  const maxHp = protagonist?.maxHp ?? 0;
  const atk = protagonist?.atk ?? 0;

  return `
    <div class="info-card" style="margin-top: 10px;">
      <h5 style="margin: 0 0 8px;">主人公</h5>
      <p class="muted" style="margin: 0 0 8px;">HP ${escapeHtml(hp)} / ${escapeHtml(maxHp)} / ATK ${escapeHtml(atk)}</p>
      <p class="muted" style="margin: 0 0 8px;">装備スキル：${escapeHtml(skills)}</p>
      <div class="button-group" style="max-width: none; flex-direction: row; flex-wrap: wrap; margin-top: 8px;">
        <button class="text-button battle-protagonist-action ${battleUiState.protagonistAction === 'skill' ? 'is-selected' : ''}" data-protagonist-action="skill">スキル発動</button>
        <button class="text-button battle-protagonist-action ${battleUiState.protagonistAction === 'wait' ? 'is-selected' : ''}" data-protagonist-action="wait">待機</button>
      </div>
    </div>
  `;
}

function renderBattleMemberRow(char, weapons, runtimeUnit) {
  const choice = battleUiState.partyChoices[char.id] || { useSkill: false, useBurst: false, action: 'attack' };
  const currentHp = runtimeUnit?.currentHp ?? 0;
  const maxHp = runtimeUnit?.maxHp ?? 0;
  const atk = runtimeUnit?.atk ?? 0;
  const weapon = weapons.find((item) => item.id === formationState.equippedWeapons[char.id]);

  return `
    <div class="info-card" style="margin-top: 10px;">
      <h5 style="margin: 0 0 8px;">${escapeHtml(char.name)}</h5>
      <p class="muted" style="margin: 0 0 8px;">HP ${escapeHtml(currentHp)} / ${escapeHtml(maxHp)} / ATK ${escapeHtml(atk)}</p>
      <p class="muted" style="margin: 0 0 8px;">装備：${escapeHtml(weapon?.name || '未装備')}</p>
      <div class="button-group" style="max-width: none; flex-direction: row; flex-wrap: wrap; margin-top: 8px;">
        <button class="text-button battle-member-toggle ${choice.useSkill ? 'is-selected' : ''}" data-member-id="${escapeHtml(char.id)}" data-toggle-type="skill">スキル ${choice.useSkill ? 'ON' : 'OFF'}</button>
        <button class="text-button battle-member-toggle ${choice.useBurst ? 'is-selected' : ''}" data-member-id="${escapeHtml(char.id)}" data-toggle-type="burst">必殺 ${choice.useBurst ? 'ON' : 'OFF'}</button>
        <button class="text-button battle-member-action ${choice.action === 'attack' ? 'is-selected' : ''}" data-member-id="${escapeHtml(char.id)}" data-action-type="attack">攻撃</button>
        <button class="text-button battle-member-action ${choice.action === 'guard' ? 'is-selected' : ''}" data-member-id="${escapeHtml(char.id)}" data-action-type="guard">防御</button>
      </div>
    </div>
  `;
}

function renderEnemyRowFromRuntime(enemy) {
  return `
    <div class="info-card" style="margin-top: 10px;">
      <h5 style="margin: 0 0 8px;">${escapeHtml(enemy.name)} <span class="muted">(${escapeHtml(enemy.id)})</span></h5>
      <p class="muted" style="margin: 0 0 6px;">HP ${escapeHtml(enemy.currentHp)} / ${escapeHtml(enemy.maxHp)} / ATK ${escapeHtml(enemy.atk)}</p>
      <p class="muted" style="margin: 0;">通常：${escapeHtml(enemy.normalAttackName)} / スキル：${escapeHtml(enemy.firstSkillName || 'なし')}</p>
    </div>
  `;
}

function renderBattleChoiceSummary() {
  const list = [`<li><strong>主人公</strong>：${battleUiState.protagonistAction === 'skill' ? 'スキル発動' : '待機'}</li>`];

  Object.entries(battleUiState.partyChoices).forEach(([memberId, choice]) => {
    const char = (gameData.characters?.characters || []).find((item) => item.id === memberId);
    const name = char?.name || memberId;
    list.push(`<li><strong>${escapeHtml(name)}</strong>：${escapeHtml(choice.useSkill ? 'スキルON' : 'スキルOFF')} / ${escapeHtml(choice.useBurst ? '必殺ON' : '必殺OFF')} / ${escapeHtml(choice.action === 'guard' ? '防御' : '攻撃')}</li>`);
  });

  return `<ul>${list.join('')}</ul>`;
}

function renderBattleLog() {
  if (!battleUiState.turnLog.length) {
    return '<p class="muted">まだ実行ログはありません。「この行動で1ターン進む」を押すと、1ターン分の簡易実行ログが表示されます。</p>';
  }

  return battleUiState.turnLog.map((turn) => `
    <div class="info-card" style="margin-top: 8px; background: #0f1630;">
      <h5 style="margin: 0 0 8px;">ターン ${escapeHtml(turn.turn)}</h5>
      <ul>${turn.lines.map((line) => `<li>${escapeHtml(line)}</li>`).join('')}</ul>
    </div>
  `).join('');
}

function attachBattleUiEvents() {
  document.querySelectorAll('[data-protagonist-action]').forEach((button) => {
    button.addEventListener('click', () => {
      battleUiState.protagonistAction = button.getAttribute('data-protagonist-action');
      renderBattleUi();
    });
  });

  document.querySelectorAll('[data-toggle-type]').forEach((button) => {
    button.addEventListener('click', () => {
      const memberId = button.getAttribute('data-member-id');
      const toggleType = button.getAttribute('data-toggle-type');
      if (!battleUiState.partyChoices[memberId]) return;
      if (toggleType === 'skill') battleUiState.partyChoices[memberId].useSkill = !battleUiState.partyChoices[memberId].useSkill;
      if (toggleType === 'burst') battleUiState.partyChoices[memberId].useBurst = !battleUiState.partyChoices[memberId].useBurst;
      renderBattleUi();
    });
  });

  document.querySelectorAll('[data-action-type]').forEach((button) => {
    button.addEventListener('click', () => {
      const memberId = button.getAttribute('data-member-id');
      const actionType = button.getAttribute('data-action-type');
      if (!battleUiState.partyChoices[memberId]) return;
      battleUiState.partyChoices[memberId].action = actionType;
      renderBattleUi();
    });
  });

  document.getElementById('battle-apply-plan')?.addEventListener('click', () => {
    simulateBattleTurn();
    renderBattleUi();
  });

  document.getElementById('battle-reset-plan')?.addEventListener('click', () => {
    if (!battleUiState.currentBattleId) return;
    openBattleUi(battleUiState.currentBattleId);
  });

  document.getElementById('battle-close-ui')?.addEventListener('click', () => {
    battleUiState.currentBattleId = null;
    battleUiState.turnCount = 0;
    battleUiState.turnLog = [];
    battleUiState.runtime = null;
    battleUiState.result = null;
    const battleUiCard = document.getElementById('battle-ui-card');
    if (battleUiCard) {
      battleUiCard.innerHTML = `
        <h3>バトル最小UI</h3>
        <p class="muted">「バトルUIを開く」を押すと、ここに主人公 / 味方 / 敵 / 行動ボタンの最小UIが表示されます。</p>
      `;
    }
  });
}

// -------------------------
// 補助関数（戦闘用最終値計算）
// -------------------------

function computeUnitFinalStats(char, slotId, weapons) {
  const weapon = weapons.find((item) => item.id === formationState.equippedWeapons[slotId]);
  const equipped = getEquippedWeaponObjects(weapons);
  const aggregated = aggregatePartySkills(equipped);
  const atkBonusRate = computeAggregatedSkillRate('atkUp', aggregated.atkUp || { small: 0, middle: 0, large: 0 });
  const hpBonusRate = computeAggregatedSkillRate('hpUp', aggregated.hpUp || { small: 0, middle: 0, large: 0 });

  const baseHp = char?.displayStats?.baseHp ?? 0;
  const baseAtk = char?.displayStats?.baseAtk ?? 0;
  const weaponHp = weapon?.baseStats?.hp ?? 0;
  const weaponAtk = weapon?.baseStats?.atk ?? 0;

  return {
    finalHp: Math.floor((baseHp + weaponHp) * (1 + hpBonusRate)),
    finalAtk: Math.floor((baseAtk + weaponAtk) * (1 + atkBonusRate)),
    weaponName: weapon?.name || ''
  };
}

// -------------------------
// 開始
// -------------------------

document.addEventListener('DOMContentLoaded', () => {
  setupNavigation();
  bootstrapGameData();
});