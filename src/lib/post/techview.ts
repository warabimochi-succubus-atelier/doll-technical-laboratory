// 投稿アプリの「技術リスト」タブ
import type { Settings } from './storage';
import { deleteTechnique, loadTechniques, moveTechnique, saveTechnique, sortTechniques, type Technique } from './techniques';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

interface Options {
  categories: readonly string[];
  needSettings: () => Settings;
  describeError: (e: unknown) => string;
  /** 技術リストが変わったとき（投稿画面の技法ボタンを作り直す） */
  onChanged: (list: Technique[]) => void;
}

export function initTechniqueView({ categories, needSettings, describeError, onChanged }: Options) {
  const listEl = $('tech-list');
  const errorEl = $('tech-error');
  const statusEl = $('tech-status');
  const dialog = $<HTMLDialogElement>('tech-dialog');
  const title = $('tech-dialog-title');
  const nameInput = $<HTMLInputElement>('tech-name');
  const categoryInput = $<HTMLSelectElement>('tech-category');
  const memoInput = $<HTMLTextAreaElement>('tech-memo');
  const renameNote = $('tech-rename-note');
  const dialogError = $('tech-dialog-error');
  const saveBtn = $<HTMLButtonElement>('tech-save');
  const deleteBtn = $<HTMLButtonElement>('tech-delete');

  let all: Technique[] | null = null;
  let editing: Technique | null = null;
  let busy = false;

  const showError = (el: HTMLElement, message: string) => {
    el.textContent = message;
    el.hidden = !message;
  };

  const run = async (label: string, fn: () => Promise<string | void>, errorTarget = errorEl) => {
    if (busy) return false;
    busy = true;
    listEl.querySelectorAll('button').forEach((b) => (b.disabled = true));
    saveBtn.disabled = deleteBtn.disabled = true;
    showError(errorTarget, '');
    try {
      const done = await fn();
      if (done) statusEl.textContent = done;
      return true;
    } catch (e) {
      showError(errorTarget, `❌ ${label}できませんでした。${describeError(e)}`);
      return false;
    } finally {
      busy = false;
      saveBtn.disabled = deleteBtn.disabled = false;
      render();
    }
  };

  const reload = async () => {
    const { repo, token } = needSettings();
    all = await loadTechniques(repo, token);
    onChanged(sortTechniques(all, categories));
  };

  const render = () => {
    if (!all) return;
    const sorted = sortTechniques(all, categories);
    listEl.replaceChildren(
      ...categories.map((category) => {
        const group = sorted.filter((t) => t.category === category);
        const section = Object.assign(document.createElement('section'), { className: 'post-tech-section' });
        section.append(Object.assign(document.createElement('h2'), { textContent: `${category}（${group.length}）` }));
        const ul = Object.assign(document.createElement('ul'), { className: 'post-past-list' });
        group.forEach((t, i) => {
          const li = Object.assign(document.createElement('li'), { className: 'post-past-item' });
          const main = Object.assign(document.createElement('div'), { className: 'post-past-main' });
          main.append(Object.assign(document.createElement('p'), { className: 'post-tech-name', textContent: t.name }));
          if (t.memo) main.append(Object.assign(document.createElement('p'), { className: 'post-tech-memo', textContent: t.memo.split('\n')[0] }));
          const mk = (text: string, label: string, onClick: () => void, cls = 'post-icon-mini') => {
            const b = Object.assign(document.createElement('button'), { type: 'button', className: cls, textContent: text });
            b.setAttribute('aria-label', label);
            b.addEventListener('click', onClick);
            return b;
          };
          const up = mk('↑', `${t.name}を上へ`, () => move(t, -1));
          const down = mk('↓', `${t.name}を下へ`, () => move(t, 1));
          up.disabled = i === 0 || busy;
          down.disabled = i === group.length - 1 || busy;
          const edit = mk('編集', `${t.name}を編集`, () => openDialog(t), 'post-btn');
          edit.disabled = busy;
          const actions = Object.assign(document.createElement('div'), { className: 'post-past-actions' });
          actions.append(up, down, edit);
          li.append(main, actions);
          ul.append(li);
        });
        section.append(ul);
        return section;
      }),
    );
  };

  const move = (t: Technique, step: -1 | 1) =>
    run('並べ替え', async () => {
      const { repo, token } = needSettings();
      statusEl.textContent = '並べ替えています…';
      if (await moveTechnique(repo, token, all!, categories, t, step)) await reload();
      return '✅ 並べ替えました。数分でサイトに反映されます。';
    });

  const openDialog = (t: Technique | null) => {
    editing = t;
    title.textContent = t ? '技法を編集' : '技法を追加';
    nameInput.value = t?.name ?? '';
    categoryInput.value = t?.category ?? categories[0];
    memoInput.value = t?.memo ?? '';
    deleteBtn.hidden = !t;
    renameNote.hidden = !t;
    showError(dialogError, '');
    dialog.showModal();
  };

  $('tech-add').addEventListener('click', () => {
    try {
      needSettings();
      openDialog(null);
    } catch (e) {
      showError(errorEl, describeError(e));
    }
  });
  $('tech-cancel').addEventListener('click', () => dialog.close());

  $<HTMLFormElement>('tech-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = { name: nameInput.value.trim(), category: categoryInput.value, memo: memoInput.value };
    const original = editing;
    const ok = await run(
      '保存',
      async () => {
        const { repo, token } = needSettings();
        statusEl.textContent = '保存しています…';
        const rewritten = await saveTechnique(repo, token, all!, original, input);
        await reload();
        return (
          `✅ 「${input.name}」を${original ? '更新' : '追加'}しました。` +
          (rewritten ? `制作ログ${rewritten}件の技法名も書き換えました。` : '') +
          '数分でサイトに反映されます。'
        );
      },
      dialogError,
    );
    if (ok) dialog.close();
  });

  deleteBtn.addEventListener('click', async () => {
    const t = editing;
    if (!t || !window.confirm(`「${t.name}」を技術リストから削除します。よろしいですか？`)) return;
    const ok = await run(
      '削除',
      async () => {
        const { repo, token } = needSettings();
        statusEl.textContent = '削除しています…';
        await deleteTechnique(repo, token, t);
        await reload();
        return `🗑 「${t.name}」を削除しました。数分でサイトに反映されます。`;
      },
      dialogError,
    );
    if (ok) dialog.close();
  });

  /** タブを開いたときに呼ぶ（初回だけ GitHub から読む） */
  return async function show() {
    if (all) return render();
    showError(errorEl, '');
    statusEl.textContent = '読み込んでいます…';
    try {
      await reload();
      statusEl.textContent = '';
      render();
    } catch (e) {
      statusEl.textContent = '';
      showError(errorEl, describeError(e));
    }
  };
}
