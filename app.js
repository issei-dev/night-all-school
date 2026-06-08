// ナイト・オール・スクール
// 初期メニュー切り替え + story.json / characters.json / battles.json 読み込み版

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
  battles: null
};

function showScreen(name) {
  Object.values(screens).forEach((screen) => {
    if (screen) {
      screen.classList.remove('active');
    }
  });

  if (screens[name]) {
    screens[name].classList.add('active');
  }
}

function setupNavigation() {
  document.querySelector('[data-action="start"]')?.addEventListener('click', () => {
    showScreen('menu');
  });

  document.querySelector('[data-action="load"]')?.addEventListener('click', () => {
    alert('つづきから はセーブ実装後に接続します。');
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

async function loadJson(path) {
  const response = await fetch(path, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`${path} の読み込みに失敗しました (${response.status})`);
  }
  return response.json();
}

async function bootstrapGameData() {
  try {
    const [story, characters, battles] = await Promise.all([
      loadJson('story.json'),
      loadJson('characters.json'),
      loadJson('battles.json')
    ]);

    gameData.story = story;
    gameData.characters = characters;
    gameData.battles = battles;

    renderAdventureSection();
    renderFormationSection();
  } catch (error) {
    console.error(error);
    renderLoadError(error);
  }
}

function renderLoadError(error) {
  const adventureScreen = document.getElementById('screen-adventure');
  if (!adventureScreen) return;

  const container = adventureScreen.querySelector('.screen-inner');
  if (!container) return;

  const oldCards = container.querySelectorAll('.dynamic-card');
  oldCards.forEach((card) => card.remove());

  const errorCard = document.createElement('div');
  errorCard.className = 'info-card dynamic-card';
  errorCard.innerHTML = `
    <h3>データ読み込みエラー</h3>
    <p class="muted">story.json / characters.json / battles.json のいずれかの読み込みに失敗しました。</p>
    <p class="muted">${escapeHtml(error.message)}</p>
    <p class="muted">※ index.html を直接ダブルクリックすると fetch が失敗することがあります。ローカルサーバーまたは Cloudflare Pages 上で確認してください。</p>
  `;
  container.appendChild(errorCard);
}

function renderAdventureSection() {
  const adventureScreen = document.getElementById('screen-adventure');
  if (!adventureScreen || !gameData.story || !gameData.battles) return;

  const container = adventureScreen.querySelector('.screen-inner');
  if (!container) return;

  const oldCards = container.querySelectorAll('.dynamic-card');
  oldCards.forEach((card) => card.remove());

  const stories = gameData.story.stories || [];
  const battles = gameData.battles.battles || [];
  const chapterTitle = gameData.story.meta?.chapterTitle || '第1章';
  const characterMap = new Map((gameData.characters?.characters || []).map((c) => [c.id, c]));

  const nodeOrder = [
    'story_1_1',
    'story_1_2',
    'battle_1_1',
    'story_1_3',
    'battle_1_2',
    'battle_1_3'
  ];

  const storyMap = new Map(stories.map((item) => [item.id, item]));
  const battleMap = new Map(battles.map((item) => [item.id, item]));

  const timelineItems = nodeOrder.map((nodeId) => {
    const story = storyMap.get(nodeId);
    const battle = battleMap.get(nodeId);

    if (story) {
      return {
        id: story.id,
        kind: 'ストーリー',
        title: story.title,
        reward: null,
        note: getStoryUnlockText(story, characterMap)
      };
    }

    if (battle) {
      const reward = battle.firstClearReward
        ? `初回: コア ${battle.firstClearReward.materialCore ?? 0} / EXP ${battle.firstClearReward.exp ?? 0}`
        : '報酬未設定';
      const repeat = battle.repeatReward
        ? `再挑戦: EXP ${battle.repeatReward.exp ?? 0}`
        : '';
      return {
        id: battle.id,
        kind: 'バトル',
        title: battle.title,
        reward,
        note: repeat
      };
    }

    return {
      id: nodeId,
      kind: '未設定',
      title: '未設定ノード',
      reward: null,
      note: ''
    };
  });

  const timelineCard = document.createElement('div');
  timelineCard.className = 'info-card dynamic-card';
  timelineCard.innerHTML = `
    <h3>${escapeHtml(chapterTitle)}</h3>
    <ol class="story-list">
      ${timelineItems.map((item) => `
        <li>
          <strong>${escapeHtml(item.kind)}</strong>：${escapeHtml(item.title)}
          <span class="muted">(${escapeHtml(item.id)})</span>
          ${item.reward ? `<br><span class="muted">${escapeHtml(item.reward)}</span>` : ''}
          ${item.note ? `<br><span class="muted">${escapeHtml(item.note)}</span>` : ''}
        </li>
      `).join('')}
    </ol>
    <p class="muted">story.json と battles.json を読み込んで、冒険の進行順を自動表示しています。</p>
  `;

  const chapterRewardCard = document.createElement('div');
  chapterRewardCard.className = 'info-card dynamic-card';
  chapterRewardCard.innerHTML = `
    <h3>第1章の報酬</h3>
    <ul>
      <li>各バトル初回クリア：マテリアルコア 5個</li>
      <li>第1章クリア：マテリアルコア 50個</li>
      <li>再挑戦報酬：経験値のみ</li>
    </ul>
  `;

  container.appendChild(timelineCard);
  container.appendChild(chapterRewardCard);
}

function getStoryUnlockText(story, characterMap) {
  const unlockIds = story.unlockCharacters || [];
  if (!unlockIds.length) {
    return '';
  }

  const names = unlockIds.map((id) => characterMap.get(id)?.name || id);
  return `加入: ${names.join(' / ')}`;
}

function renderFormationSection() {
  const formationScreen = document.getElementById('screen-formation');
  if (!formationScreen || !gameData.characters) return;

  const container = formationScreen.querySelector('.screen-inner');
  if (!container) return;

  const oldCards = container.querySelectorAll('.dynamic-card');
  oldCards.forEach((card) => card.remove());

  const characters = gameData.characters.characters || [];

  const statsCard = document.createElement('article');
  statsCard.className = 'info-card dynamic-card';

  const rows = characters.map((char) => {
    const hp = char.displayStats?.baseHp ?? '-';
    const atk = char.displayStats?.baseAtk ?? '-';
    return `<li><strong>${escapeHtml(char.name)}</strong>：HP ${hp} / ATK ${atk}</li>`;
  }).join('');

  statsCard.innerHTML = `
    <h3>初期ステータス</h3>
    <ul>${rows}</ul>
    <p class="muted">characters.json の displayStats を表示しています。</p>
  `;

  const skillCard = document.createElement('article');
  skillCard.className = 'info-card dynamic-card';
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

  container.appendChild(statsCard);
  container.appendChild(skillCard);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

document.addEventListener('DOMContentLoaded', () => {
  setupNavigation();
  bootstrapGameData();
});
