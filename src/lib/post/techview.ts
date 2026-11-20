// 投稿アプリの「技術リスト」タブ（技法の編集と、カテゴリ・研究分野の編集）
import {
  addField,
  allCategories,
  deleteCategory,
  deleteField,
  loadFields,
  moveCategory,
  moveField,
  renameField,
  saveCategory,
  type Field,
} from './categories';
import type { Settings } from './storage';
import { deleteTechnique, loadTechniques, moveTechnique, saveTechnique, sortTechniques, type Technique } from './techniques';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

interface Options {
  /** ビルド時に埋め込んだ研究分野とカテゴリ（GitHub から読み直すまでの仮） */
  fields: Field[];
  needSettings: () => Settings;
  describeError: (e: unknown) => string;
  /** 技術リストやカテゴリが変わったとき（投稿画面の技法ボタンを作り直す） */
  onChanged: (list: Technique[], fields: Field[]) => void;
}

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> = {}) =>
  Object.assign(document.createElement(tag), props);

export function initTechniqueView({ fields: initialFields, needSettings, describeError, onChanged }: Options) {
  const listEl = $('tech-list');
  const errorEl = $('tech-error');
  const statusEl = $('tech-status');
  const intro = $('tech-intro');
  const addBtn = $<HTMLButtonElement>('tech-add');
  const modeBtn = $<HTMLButtonElement>('tech-mode');
  const addFieldBtn = $<HTMLButtonElement>('field-add');

  // 技法のダイアログ
  const dialog = $<HTMLDialogElement>('tech-dialog');
  const title = $('tech-dialog-title');
  const nameInput = $<HTMLInputElement>('tech-name');
  const categoryInput = $<HTMLSelectElement>('tech-category');
  const memoInput = $<HTMLTextAreaElement>('tech-memo');
  const renameNote = $('tech-rename-note');
  const dialogError = $('tech-dialog-error');
  const deleteBtn = $<HTMLButtonElement>('tech-delete');

  // カテゴリのダイアログ
  const catDialog = $<HTMLDialogElement>('cat-dialog');
  const catTitle = $('cat-dialog-title');
  const catName = $<HTMLInputElement>('cat-name');
  const catField = $<HTMLSelectElement>('cat-field');
  const catNote = $('cat-rename-note');
  const catError = $('cat-dialog-error');
  const catDelete = $<HTMLButtonElement>('cat-delete');

  let fields: Field[] = initialFields;
  let all: Technique[] | null = null;
  let editing: Technique | null = null;
  let editingCat: { name: string; field: string } | null = null;
  let mode: 'techniques' | 'categories' = 'techniques';
  let busy = false;

  const categories = () => allCategories(fields);
  const showError = (target: HTMLElement, message: string) => {
    target.textContent = message;
    target.hidden = !message;
  };
  const dialogButtons = () => document.querySelectorAll<HTMLButtonElement>('#tech-dialog button, #cat-dialog button, #tech-mode, #tech-add, #field-add');

  /** GitHub への操作を1つ実行する（同時に2つは動かさない） */
  const run = async (label: string, fn: () => Promise<string | void>, errorTarget = errorEl) => {
    if (busy) return false;
    busy = true;
    listEl.querySelectorAll('button').forEach((b) => (b.disabled = true));
    dialogButtons().forEach((b) => (b.disabled = true));
    showError(errorTarget, '');
    showError(errorEl, '');
    try {
      const done = await fn();
      if (done) statusEl.textContent = done;
      return true;
    } catch (e) {
      statusEl.textContent = '';
      showError(errorTarget, `❌ ${label}できませんでした。${describeError(e)}`);
      return false;
    } finally {
      busy = false;
      dialogButtons().forEach((b) => (b.disabled = false));
      render();
    }
  };

  const reload = async () => {
    const { repo, token } = needSettings();
    [fields, all] = await Promise.all([loadFields(repo, token), loadTechniques(repo, token)]);
    onChanged(sortTechniques(all, categories()), fields);
  };

  // ---- 表示 ----
  const mkBtn = (text: string, label: string, onClick: () => void, cls = 'post-icon-mini', disabled = false) => {
    const b = el('button', { type: 'button', className: cls, textContent: text, disabled: disabled || busy });
    b.setAttribute('aria-label', label);
    b.addEventListener('click', onClick);
    return b;
  };
  const row = (mainChildren: HTMLElement[], buttons: HTMLElement[]) => {
    const li = el('li', { className: 'post-past-item' });
    const main = el('div', { className: 'post-past-main' });
    main.append(...mainChildren);
    const actions = el('div', { className: 'post-past-actions' });
    actions.append(...buttons);
    li.append(main, actions);
    return li;
  };

  const renderTechniques = () => {
    const sorted = sortTechniques(all!, categories());
    const sectionFor = (category: string) => {
      const group = sorted.filter((t) => t.category === category);
      const section = el('section', { className: 'post-tech-section' });
      section.append(el('h3', { textContent: `${category}（${group.length}）` }));
      const ul = el('ul', { className: 'post-past-list' });
      group.forEach((t, i) => {
        const main = [el('p', { className: 'post-tech-name', textContent: t.name })];
        if (t.memo) main.push(el('p', { className: 'post-tech-memo', textContent: t.memo.split('\n')[0] }));
        ul.append(
          row(main, [
            mkBtn('↑', `${t.name}を上へ`, () => move(t, -1), 'post-icon-mini', i === 0),
            mkBtn('↓', `${t.name}を下へ`, () => move(t, 1), 'post-icon-mini', i === group.length - 1),
            mkBtn('編集', `${t.name}を編集`, () => openDialog(t), 'post-btn'),
          ]),
        );
      });
      section.append(ul);
      return section;
    };
    // 研究分野ごとの見出しの下に、カテゴリを並べる
    listEl.replaceChildren(
      ...fields.flatMap((f) => [el('h2', { className: 'post-field-heading', textContent: f.name }), ...f.categories.map(sectionFor)]),
    );
  };

  const renderCategories = () => {
    listEl.replaceChildren(
      ...fields.map((f, fi) => {
        const section = el('section', { className: 'post-tech-section post-cat-field' });
        const head = el('div', { className: 'post-cat-head' });
        head.append(
          el('h2', { className: 'post-field-heading', textContent: f.name }),
          mkBtn('↑', `${f.name}を上へ`, () => doMoveField(f, -1), 'post-icon-mini', fi === 0),
          mkBtn('↓', `${f.name}を下へ`, () => doMoveField(f, 1), 'post-icon-mini', fi === fields.length - 1),
          mkBtn('名前', `${f.name}の名前を変える`, () => doRenameField(f), 'post-btn'),
          mkBtn('削除', `${f.name}を削除`, () => doDeleteField(f), 'post-btn'),
        );
        const ul = el('ul', { className: 'post-past-list' });
        f.categories.forEach((c, i) => {
          const count = all!.filter((t) => t.category === c).length;
          ul.append(
            row(
              [el('p', { className: 'post-tech-name', textContent: c }), el('p', { className: 'post-tech-memo', textContent: `技法 ${count}個` })],
              [
                mkBtn('↑', `${c}を上へ`, () => doMoveCategory(c, -1), 'post-icon-mini', i === 0),
                mkBtn('↓', `${c}を下へ`, () => doMoveCategory(c, 1), 'post-icon-mini', i === f.categories.length - 1),
                mkBtn('編集', `${c}を編集`, () => openCatDialog({ name: c, field: f.name }), 'post-btn'),
              ],
            ),
          );
        });
        const addCat = mkBtn('＋ カテゴリを追加', `${f.name}にカテゴリを追加`, () => openCatDialog(null, f.name), 'post-btn post-cat-add');
        section.append(head, ul, addCat);
        return section;
      }),
    );
  };

  const render = () => {
    if (!all) return;
    const cats = mode === 'categories';
    intro.textContent = cats
      ? '研究分野とカテゴリの追加・名前の変更・並べ替え・削除ができます。カテゴリ名を変えると、そのカテゴリの技法も自動で書き換えます。'
      : '技法の追加・名前の変更・並べ替え・削除ができます。名前を変えると、その技法を使っている制作ログも自動で書き換えます。';
    modeBtn.textContent = cats ? '← 技法の一覧に戻る' : 'カテゴリ・研究分野を編集';
    addBtn.hidden = cats;
    addFieldBtn.hidden = !cats;
    if (cats) renderCategories();
    else renderTechniques();
  };

  modeBtn.addEventListener('click', () => {
    mode = mode === 'techniques' ? 'categories' : 'techniques';
    statusEl.textContent = '';
    showError(errorEl, '');
    render();
  });

  // ---- 技法 ----
  const move = (t: Technique, step: -1 | 1) =>
    run('並べ替え', async () => {
      const { repo, token } = needSettings();
      statusEl.textContent = '並べ替えています…';
      if (await moveTechnique(repo, token, all!, categories(), t, step)) await reload();
      return '✅ 並べ替えました。数分でサイトに反映されます。';
    });

  const fillCategorySelect = (select: HTMLSelectElement) => {
    select.replaceChildren(
      ...fields.map((f) => {
        const g = el('optgroup', { label: f.name });
        g.append(...f.categories.map((c) => el('option', { value: c, textContent: c })));
        return g;
      }),
    );
  };

  const openDialog = (t: Technique | null) => {
    editing = t;
    fillCategorySelect(categoryInput);
    title.textContent = t ? '技法を編集' : '技法を追加';
    nameInput.value = t?.name ?? '';
    categoryInput.value = t?.category ?? categories()[0];
    memoInput.value = t?.memo ?? '';
    deleteBtn.hidden = !t;
    renameNote.hidden = !t;
    showError(dialogError, '');
    dialog.showModal();
  };

  addBtn.addEventListener('click', () => {
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

  // ---- 研究分野 ----
  const doMoveField = (f: Field, step: -1 | 1) =>
    run('並べ替え', async () => {
      const { repo, token } = needSettings();
      if (await moveField(repo, token, fields, f.name, step)) await reload();
      return '✅ 並べ替えました。数分でサイトに反映されます。';
    });

  const doRenameField = (f: Field) => {
    const name = window.prompt('研究分野の新しい名前', f.name);
    if (name === null) return;
    run('名前の変更', async () => {
      const { repo, token } = needSettings();
      if (!(await renameField(repo, token, fields, f.name, name))) return;
      await reload();
      return `✅ 研究分野を「${name.trim()}」に変えました。数分でサイトに反映されます。`;
    });
  };

  const doDeleteField = (f: Field) => {
    if (!window.confirm(`研究分野「${f.name}」を削除します。よろしいですか？`)) return;
    run('削除', async () => {
      const { repo, token } = needSettings();
      await deleteField(repo, token, fields, f.name);
      await reload();
      return `🗑 研究分野「${f.name}」を削除しました。数分でサイトに反映されます。`;
    });
  };

  addFieldBtn.addEventListener('click', () => {
    const name = window.prompt('新しい研究分野の名前（例：ウィッグ研究）');
    if (name === null) return;
    run('追加', async () => {
      const { repo, token } = needSettings();
      await addField(repo, token, fields, name);
      await reload();
      return `✅ 研究分野「${name.trim()}」を追加しました。カテゴリを足すと技法を登録できます。`;
    });
  });

  // ---- カテゴリ ----
  const doMoveCategory = (name: string, step: -1 | 1) =>
    run('並べ替え', async () => {
      const { repo, token } = needSettings();
      if (await moveCategory(repo, token, fields, name, step)) await reload();
      return '✅ 並べ替えました。数分でサイトに反映されます。';
    });

  const openCatDialog = (c: { name: string; field: string } | null, field?: string) => {
    editingCat = c;
    catField.replaceChildren(...fields.map((f) => el('option', { value: f.name, textContent: f.name })));
    catTitle.textContent = c ? 'カテゴリを編集' : 'カテゴリを追加';
    catName.value = c?.name ?? '';
    catField.value = c?.field ?? field ?? fields[0]?.name ?? '';
    catDelete.hidden = !c;
    catNote.hidden = !c;
    showError(catError, '');
    catDialog.showModal();
  };
  $('cat-cancel').addEventListener('click', () => catDialog.close());

  $<HTMLFormElement>('cat-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = { name: catName.value.trim(), field: catField.value };
    const original = editingCat;
    const ok = await run(
      '保存',
      async () => {
        const { repo, token } = needSettings();
        statusEl.textContent = '保存しています…';
        const rewritten = await saveCategory(repo, token, fields, all!, original, input);
        await reload();
        return (
          `✅ カテゴリ「${input.name}」を${original ? '更新' : '追加'}しました。` +
          (rewritten ? `技法${rewritten}個のカテゴリも書き換えました。` : '') +
          '数分でサイトに反映されます。'
        );
      },
      catError,
    );
    if (ok) catDialog.close();
  });

  catDelete.addEventListener('click', async () => {
    const c = editingCat;
    if (!c || !window.confirm(`カテゴリ「${c.name}」を削除します。よろしいですか？`)) return;
    const ok = await run(
      '削除',
      async () => {
        const { repo, token } = needSettings();
        await deleteCategory(repo, token, fields, all!, c.name);
        await reload();
        return `🗑 カテゴリ「${c.name}」を削除しました。数分でサイトに反映されます。`;
      },
      catError,
    );
    if (ok) catDialog.close();
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
