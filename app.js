// ナイト・オール・スクール
// 初期メニュー切り替え + story.json / characters.json 読み込み版

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
  characters: null
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
    const [story, characters] = await Promise.all([
      loadJson('story.json'),
      loadJson('characters.json')
    ]);

    gameData.story = story;
    gameData.characters = characters;

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

  const errorCard = document.createElement('div');
  errorCard.className = 'info-card dynamic-card';
  errorCard.innerHTML = `
    <h3>データ読み込みエラー</h3>
    <p class="muted">story.json または characters.json の読み込みに失敗しました。</p>
    <p class="muted">${escapeHtml(error.message)}</p>
    <p class="muted">※ index.html を直接ダブルクリックすると fetch が失敗することがあります。ローカルサーバーまたは Cloudflare Pages 上で確認してください。</p>
  `;
  container.appendChild(errorCard);
}

function renderAdventureSection() {
  const adventureScreen = document.getElementById('screen-adventure');
  if (!adventureScreen || !gameData.story) return;

  const container = adventureScreen.querySelector('.screen-inner');
  if (!container) return;

  const oldCards = container.querySelectorAll('.dynamic-card');
  oldCards.forEach((card) => card.remove());

  const stories = gameData.story.stories || [];
  const chapterTitle = gameData.story.meta?.chapterTitle || '第1章';

  const listCard = document.createElement('div');
  listCard.className = 'info-card dynamic-card';

  const items = stories.map((story) => {
    const kindLabel = story.id.startsWith('battle_') || story.type === 'battle' ? 'バトル' : 'ストーリー';
    return `<li><strong>${kindLabel}</strong>：${escapeHtml(story.title)} <span class="muted">(${escapeHtml(story.id)})</span></li>`;
  }).join('');

  listCard.innerHTML = `
    <h3>${escapeHtml(chapterTitle)}</h3>
    <ol class="story-list">${items}</ol>
    <p class="muted">story.json を読み込んで一覧を自動生成しています。</p>
  `;

  const unlockCard = document.createElement('div');
  unlockCard.className = 'info-card dynamic-card';

  const unlockStory = stories.find((s) => s.id === 'story_1_2');
  const unlockIds = unlockStory?.unlockCharacters || [];
  const characterMap = new Map((gameData.characters?.characters || []).map((c) => [c.id, c]));
  const names = unlockIds.map((id) => characterMap.get(id)?.name || id);

  unlockCard.innerHTML = `
    <h3>第1章の加入メンバー</h3>
    <p><strong>解放タイミング：</strong> ストーリー1-2 読了時</p>
    <ul>${names.map((name) => `<li>${escapeHtml(name)}</li>`).join('')}</ul>
  `;

  container.appendChild(listCard);
  container.appendChild(unlockCard);
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
