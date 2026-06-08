// ナイト・オール・スクール
// 初期メニュー切り替え用スクリプト

const screens = {
  title: document.getElementById('screen-title'),
  menu: document.getElementById('screen-menu'),
  adventure: document.getElementById('screen-adventure'),
  formation: document.getElementById('screen-formation'),
  bond: document.getElementById('screen-bond'),
  gacha: document.getElementById('screen-gacha')
};

function showScreen(name) {
  Object.values(screens).forEach((screen) => {
    screen.classList.remove('active');
  });

  if (screens[name]) {
    screens[name].classList.add('active');
  }
}

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
