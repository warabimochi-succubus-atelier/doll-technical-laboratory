// 投稿アプリの画面の動き（src/pages/post/index.astro から呼ぶ）
import {
  base64ToBytes,
  BRANCH,
  checkAccess,
  commitFiles,
  fileExists,
  getFileBase64,
  getTextFile,
  GitHubError,
  listDir,
  type NewFile,
} from './github';
import { blobToBase64, resizeToJpeg, textToBase64 } from './image';
import { buildLogMarkdown, nowInJapan, parseLogMarkdown, splitLines, type LogInput } from './markdown';
import { clearSettings, loadSettings, saveSettings, type Settings } from './storage';
import { initTechniqueView } from './techview';
import type { Field } from './categories';

export const DEFAULT_REPO = 'warabimochi-succubus-atelier/doll-technical-laboratory';
const MAX_PHOTOS = 5;
const LOGS_DIR = 'src/content/logs';
const PHOTOS_DIR = 'public/images/logs';
const PAST_PAGE = 10;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

/** エラーを利用者向けの1行にする */
export function describeError(e: unknown): string {
  if (e instanceof GitHubError) {
    if (e.status === 401) return 'トークンの有効期限が切れているか、正しくありません。設定から入れ直してください。';
    if (e.status === 403) return 'トークンの権限が足りません（Contents の書き込みが必要です）。設定から入れ直してください。';
    if (e.status === 404) return 'ファイルかリポジトリが見つかりません。すでに削除されたか、設定が違う可能性があります。';
    if (e.status === 409 || e.status === 422) return 'GitHub 側の更新とぶつかりました。もう一度お試しください。';
    return `GitHub でエラーが起きました（${e.status}${e.message ? `: ${e.message}` : ''}）。`;
  }
  if (e instanceof TypeError) return '通信できませんでした。電波のよい場所でもう一度お試しください。';
  return e instanceof Error ? e.message : '原因の分からないエラーが起きました。';
}

/** 写真：新しく選んだもの（blob）と、編集中のログにもともと付いていたもの（name） */
type Photo = { preview: string } & ({ blob: Blob; name?: undefined } | { name: string; blob?: undefined });

/** 編集中のログ */
interface Editing {
  stem: string; // ファイル名（拡張子なし）
  originalPhotos: string[];
}

export function initPostApp() {
  const siteUrl = document.body.dataset.siteUrl ?? '/';
  const form = $<HTMLFormElement>('post-form');
  const photoInput = $<HTMLInputElement>('photo-input');
  const photoList = $<HTMLUListElement>('photo-list');
  const bgRow = $('check-background-row');
  const bgCheck = $<HTMLInputElement>('check-background');
  const publicCheck = $<HTMLInputElement>('check-public');
  const title = $<HTMLInputElement>('title');
  const date = $<HTMLInputElement>('date');
  const fields = {
    doya: $<HTMLTextAreaElement>('doya'),
    gunu: $<HTMLTextAreaElement>('gunu'),
    hate: $<HTMLTextAreaElement>('hate'),
    memo: $<HTMLTextAreaElement>('memo'),
  };
  const formError = $('form-error');
  const status = $('status');
  const submit = $<HTMLButtonElement>('submit');
  const deleteBtn = $<HTMLButtonElement>('delete-log');
  const banner = $('settings-banner');
  const editingBanner = $('editing-banner');
  const editingLabel = $('editing-label');

  const tabNew = $<HTMLButtonElement>('tab-new');
  const tabPast = $<HTMLButtonElement>('tab-past');
  const pastView = $('past-view');
  const tabTech = $<HTMLButtonElement>('tab-tech');
  const techView = $('tech-view');
  // 研究分野とカテゴリ（最初はビルド時に埋め込んだもの。技術リストタブで GitHub から読み直すと差し替わる）
  let researchFields: Field[] = JSON.parse(document.body.dataset.fields ?? '[]');
  let categories = researchFields.flatMap((f) => f.categories);
  const pastList = $<HTMLUListElement>('past-list');
  const pastMore = $<HTMLButtonElement>('past-more');
  const pastError = $('past-error');

  const dialog = $<HTMLDialogElement>('settings');
  const repoInput = $<HTMLInputElement>('repo');
  const tokenInput = $<HTMLInputElement>('token');
  const settingsError = $('settings-error');

  let settings: Settings | undefined;
  let photos: Photo[] = [];
  let editing: Editing | null = null;
  let busy = false;
  let processing = 0; // 縮小中の写真の数
  let formGeneration = 0; // 入力欄をリセットするたびに増える（リセット前に始めた縮小の結果を捨てるため）
  let pastNames: string[] = [];
  let pastShown = 0;

  const showError = (el: HTMLElement, message: string) => {
    el.textContent = message;
    el.hidden = !message;
  };
  const setBusy = (b: boolean) => {
    busy = b;
    submit.disabled = b || processing > 0;
    deleteBtn.disabled = b;
  };
  /** 投稿・更新・削除のあとは一覧を読み直させる */
  const invalidatePast = () => {
    pastNames = [];
    pastShown = 0;
    pastList.replaceChildren();
    pastMore.hidden = true;
  };
  const needSettings = () => {
    if (settings) return settings;
    throw new Error('GitHub の設定がまだです。右上の ⚙ から設定してください。');
  };

  // ---- 写真 ----
  const renderPhotos = () => {
    photoList.replaceChildren(
      ...photos.map((p, i) => {
        const li = document.createElement('li');
        const img = document.createElement('img');
        img.src = p.preview;
        img.alt = `写真${i + 1}`;
        const del = document.createElement('button');
        del.type = 'button';
        del.textContent = '×';
        del.setAttribute('aria-label', `写真${i + 1}を外す`);
        del.addEventListener('click', () => {
          URL.revokeObjectURL(p.preview);
          photos.splice(i, 1);
          renderPhotos();
        });
        li.append(img, del);
        return li;
      }),
    );
    // 背景の確認は「新しく追加した写真」があるときだけ求める
    bgRow.hidden = !photos.some((p) => p.blob);
  };

  photoInput.addEventListener('change', async () => {
    const files = [...(photoInput.files ?? [])];
    photoInput.value = '';
    showError(formError, '');
    const room = Math.max(MAX_PHOTOS - photos.length - processing, 0);
    if (files.length > room) showError(formError, `写真は${MAX_PHOTOS}枚までです。最初の${room}枚だけ追加しました。`);
    const picked = files.slice(0, room);
    const generation = formGeneration;
    processing += picked.length;
    submit.disabled = true; // 縮小が終わるまで送信させない
    for (const [i, file] of picked.entries()) {
      status.textContent = `写真を縮小しています… ${i + 1} / ${picked.length}`;
      try {
        const blob = await resizeToJpeg(file);
        if (generation === formGeneration) {
          photos.push({ blob, preview: URL.createObjectURL(blob) });
          renderPhotos();
        }
      } catch (e) {
        if (generation === formGeneration) showError(formError, `${file.name} を読み込めませんでした。${describeError(e)}`);
      } finally {
        processing--;
      }
    }
    if (processing === 0) {
      status.textContent = '';
      submit.disabled = busy;
    }
  });

  // ---- 入力欄 ----
  const clearPhotos = () => {
    photos.forEach((p) => URL.revokeObjectURL(p.preview));
    photos = [];
    renderPhotos();
  };

  const setEditing = (e: Editing | null) => {
    editing = e;
    editingBanner.hidden = !e;
    editingLabel.textContent = e ? `${e.stem} を編集中` : '';
    submit.textContent = e ? '更新' : '投稿';
    deleteBtn.hidden = !e;
  };

  const resetForm = () => {
    formGeneration++;
    clearPhotos();
    form.reset();
    date.value = nowInJapan().date;
    setEditing(null);
    showError(formError, '');
  };

  // ---- 技法ボタン（技術リストを編集したら作り直す） ----
  const chipsBox = $('technique-chips');
  const chip = (id: string, name: string, checked: boolean) => {
    const label = Object.assign(document.createElement('label'), { className: 'post-chip' });
    const input = Object.assign(document.createElement('input'), { type: 'checkbox', name: 'technique', value: id, checked });
    label.append(input, Object.assign(document.createElement('span'), { textContent: name }));
    return label;
  };
  const renderChips = (list: { id: string; name: string; category: string }[], extraChecked: string[] = []) => {
    const checked = new Set([
      ...[...chipsBox.querySelectorAll<HTMLInputElement>('input[name="technique"]:checked')].map((c) => c.value),
      ...extraChecked,
    ]);
    const groups = categories
      .map((c) => ({ category: c, items: list.filter((t) => t.category === c) }))
      .filter((g) => g.items.length);
    // 技術リストにない技法がログに入っているとき（削除・改名の直後など）も外れないように残す
    const known = new Set(list.map((t) => t.id));
    const orphans = [...checked].filter((id) => !known.has(id));
    if (orphans.length) groups.push({ category: 'リストにない技法', items: orphans.map((id) => ({ id, name: id, category: '' })) });
    chipsBox.replaceChildren(
      Object.assign(document.createElement('legend'), { textContent: '試した技法' }),
      ...groups.map((g) => {
        const div = Object.assign(document.createElement('div'), { className: 'post-tech-group' });
        const chips = Object.assign(document.createElement('div'), { className: 'post-chips' });
        chips.append(...g.items.map((t) => chip(t.id, t.name, checked.has(t.id))));
        div.append(Object.assign(document.createElement('p'), { className: 'post-tech-category', textContent: g.category }), chips);
        return div;
      }),
    );
  };
  // 最初はビルド時に埋め込んだ一覧を使う
  let currentTechniques = [...chipsBox.querySelectorAll<HTMLInputElement>('input[name="technique"]')].map((c) => ({
    id: c.value,
    name: c.nextElementSibling?.textContent ?? c.value,
    category: c.closest('.post-tech-group')?.querySelector('.post-tech-category')?.textContent ?? '',
  }));

  const fillForm = (log: LogInput) => {
    form.reset();
    title.value = log.title;
    date.value = log.date;
    chipsBox.querySelectorAll<HTMLInputElement>('input[name="technique"]').forEach((c) => (c.checked = false));
    renderChips(currentTechniques, log.techniques);
    fields.doya.value = log.doya.join('\n');
    fields.gunu.value = log.gunu.join('\n');
    fields.hate.value = log.hate.join('\n');
    fields.memo.value = log.memo;
  };

  const readForm = () => ({
    date: date.value || nowInJapan().date,
    title: title.value.trim(),
    techniques: [...form.querySelectorAll<HTMLInputElement>('input[name="technique"]:checked')].map((c) => c.value),
    doya: splitLines(fields.doya.value),
    gunu: splitLines(fields.gunu.value),
    hate: splitLines(fields.hate.value),
    memo: fields.memo.value,
  });

  // ---- 画面の切り替え ----
  const showTechniques = initTechniqueView({
    fields: researchFields,
    needSettings,
    describeError,
    onChanged: (list, fields) => {
      researchFields = fields;
      categories = fields.flatMap((f) => f.categories);
      currentTechniques = list;
      renderChips(list);
    },
  });
  const showView = (view: 'new' | 'past' | 'tech') => {
    tabNew.setAttribute('aria-pressed', String(view === 'new'));
    tabPast.setAttribute('aria-pressed', String(view === 'past'));
    tabTech.setAttribute('aria-pressed', String(view === 'tech'));
    form.hidden = view !== 'new';
    pastView.hidden = view !== 'past';
    techView.hidden = view !== 'tech';
    if (view === 'past') loadPast();
    if (view === 'tech') showTechniques();
  };
  tabNew.addEventListener('click', () => showView('new'));
  tabPast.addEventListener('click', () => showView('past'));
  tabTech.addEventListener('click', () => showView('tech'));

  // ---- 投稿・更新 ----
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (busy) return;
    showError(formError, '');
    const input = readForm();
    const hasNewPhotos = photos.some((p) => p.blob);

    const problem = processing > 0
      ? '写真の縮小が終わるまでお待ちください。'
      : !settings
      ? 'GitHub の設定がまだです。右上の ⚙ から設定してください。'
      : !input.title
        ? '件名を入力してください。'
        : photos.length === 0 && !input.doya.length && !input.gunu.length && !input.hate.length && !input.memo.trim()
          ? '写真・感想・メモのどれかを入力してください。'
          : hasNewPhotos && !bgCheck.checked
            ? '写真の背景を確認して、チェックを入れてください。'
            : !publicCheck.checked
              ? '公開サイトに載ることの確認にチェックを入れてください。'
              : '';
    if (problem) return showError(formError, problem);

    setBusy(true);
    const { repo, token } = settings!;
    try {
      status.textContent = '送信の準備をしています…';
      let stem: string;
      if (editing) {
        stem = editing.stem;
      } else {
        // 投稿した日時（日本時間）でファイル名を決める。万一同じ名前があれば -2, -3… を付ける
        stem = `${input.date}-${nowInJapan().time}`;
        for (let n = 2; await fileExists(repo, token, `${LOGS_DIR}/${stem}.md`); n++) {
          stem = `${input.date}-${nowInJapan().time}-${n}`;
        }
      }

      // 写真の名前：残した写真はそのまま、新しい写真は使われていない番号を振る。
      // 編集で足す写真は、前に消した写真と同じ名前にならないよう「-e編集日時」を付ける
      // （同じ名前だと、Pages やブラウザに残った古い写真がしばらく表示されてしまうため）
      const now = nowInJapan();
      const prefix = editing ? `${stem}-e${now.date.replace(/-/g, '')}${now.time}` : stem;
      const used = new Set(editing?.originalPhotos ?? []);
      let next = 1;
      const files: NewFile[] = [];
      const photoNames: string[] = [];
      for (const p of photos) {
        if (p.name) {
          photoNames.push(p.name);
          continue;
        }
        while (used.has(`${prefix}-${next}.jpg`)) next++;
        const name = `${prefix}-${next}.jpg`;
        used.add(name);
        photoNames.push(name);
        files.push({ path: `${PHOTOS_DIR}/${name}`, base64: await blobToBase64(p.blob!) });
      }
      // 編集で外した写真は削除する
      for (const old of editing?.originalPhotos ?? []) {
        if (!photoNames.includes(old)) files.push({ path: `${PHOTOS_DIR}/${old}`, delete: true });
      }
      files.push({
        path: `${LOGS_DIR}/${stem}.md`,
        base64: await textToBase64(buildLogMarkdown({ ...input, photos: photoNames })),
      });

      status.textContent = '送信しています…';
      const verb = editing ? 'Edit' : 'Add';
      // 新規投稿は新しいファイルを足すだけなので、main が先に進んでいても自動でやり直してよい
      await commitFiles(repo, token, files, `${verb} log: ${input.date} ${input.title}`, { retryOnConflict: !editing });

      const logUrl = `${siteUrl}logs/${stem}/`;
      const done = editing ? '✅ 更新しました。' : '✅ 送信しました。';
      resetForm();
      invalidatePast();
      status.replaceChildren(
        `${done}数分でサイトに反映されます。`,
        document.createElement('br'),
        Object.assign(document.createElement('a'), { href: logUrl, textContent: logUrl, target: '_blank', rel: 'noopener' }),
      );
    } catch (err) {
      status.textContent = '';
      showError(formError, `❌ 送信できませんでした。${describeError(err)}（入力内容はそのまま残っています）`);
    } finally {
      setBusy(false);
    }
  });

  // ---- 削除 ----
  const deleteLog = async (stem: string) => {
    const { repo, token } = needSettings();
    const log = parseLogMarkdown(await getTextFile(repo, token, `${LOGS_DIR}/${stem}.md`));
    const ok = window.confirm(
      `${stem}（${log.title}）を削除します。` +
        (log.photos.length ? `写真${log.photos.length}枚も一緒に削除します。` : '') +
        '\nサイトからは消えますが、GitHub の履歴には残ります。よろしいですか？',
    );
    if (!ok) return false;
    const files: NewFile[] = [
      { path: `${LOGS_DIR}/${stem}.md`, delete: true },
      ...log.photos.map((p) => ({ path: `${PHOTOS_DIR}/${p}`, delete: true as const })),
    ];
    await commitFiles(repo, token, files, `Delete log: ${log.date} ${log.title}`);
    invalidatePast();
    return true;
  };

  deleteBtn.addEventListener('click', async () => {
    if (!editing || busy) return;
    setBusy(true);
    showError(formError, '');
    try {
      const stem = editing.stem;
      if (await deleteLog(stem)) {
        resetForm();
        status.textContent = `🗑 ${stem} を削除しました。数分でサイトから消えます。`;
      }
    } catch (err) {
      showError(formError, `❌ 削除できませんでした。${describeError(err)}`);
    } finally {
      setBusy(false);
    }
  });

  // ---- 編集の読み込み ----
  const startEdit = async (stem: string) => {
    const { repo, token } = needSettings();
    const log = parseLogMarkdown(await getTextFile(repo, token, `${LOGS_DIR}/${stem}.md`));
    resetForm();
    fillForm(log);
    for (const name of log.photos) {
      // 投稿直後でサイトに未反映の写真もあるので、GitHub から直接読む
      const bytes = base64ToBytes(await getFileBase64(repo, token, `${PHOTOS_DIR}/${name}`));
      photos.push({ name, preview: URL.createObjectURL(new Blob([bytes], { type: 'image/jpeg' })) });
    }
    renderPhotos();
    setEditing({ stem, originalPhotos: log.photos });
    status.textContent = '';
    showView('new');
    window.scrollTo({ top: 0 });
  };

  $('cancel-edit').addEventListener('click', () => {
    resetForm();
    status.textContent = '';
  });

  // ---- 過去の投稿一覧 ----
  const renderPastItem = (name: string) => {
    const stem = name.replace(/\.md$/, '');
    const li = document.createElement('li');
    li.className = 'post-past-item';
    const main = document.createElement('div');
    main.className = 'post-past-main';
    const d = Object.assign(document.createElement('p'), { className: 'post-past-date', textContent: stem });
    const who = Object.assign(document.createElement('p'), { className: 'post-past-title', textContent: '読み込み中…' });
    const sub = Object.assign(document.createElement('p'), { className: 'post-past-sub', textContent: '' });
    main.append(d, who, sub);
    const edit = Object.assign(document.createElement('button'), { type: 'button', className: 'post-btn', textContent: '編集' });
    const del = Object.assign(document.createElement('button'), { type: 'button', className: 'post-btn', textContent: '削除' });
    const act = async (fn: () => Promise<unknown>, label: string) => {
      if (busy) return;
      setBusy(true);
      edit.disabled = del.disabled = true;
      showError(pastError, '');
      try {
        await fn();
      } catch (err) {
        showError(pastError, `❌ ${label}できませんでした。${describeError(err)}`);
      } finally {
        setBusy(false);
        edit.disabled = del.disabled = false;
      }
    };
    edit.addEventListener('click', () => act(() => startEdit(stem), '読み込め'));
    del.addEventListener('click', () =>
      act(async () => {
        if (await deleteLog(stem)) await loadPast();
      }, '削除'),
    );
    const actions = Object.assign(document.createElement('div'), { className: 'post-past-actions' });
    actions.append(edit, del);
    li.append(main, actions);

    const { repo, token } = needSettings();
    getTextFile(repo, token, `${LOGS_DIR}/${name}`)
      .then((text) => {
        const log = parseLogMarkdown(text);
        who.textContent = log.title || '（件名なし）';
        const first = log.doya[0] ?? log.gunu[0] ?? log.hate[0] ?? log.memo.split('\n')[0] ?? '';
        sub.textContent = [log.photos.length ? `写真${log.photos.length}枚` : '', first].filter(Boolean).join('・');
      })
      .catch((err) => {
        who.textContent = '（読み込めませんでした）';
        sub.textContent = describeError(err);
      });
    return li;
  };

  const showMorePast = () => {
    const slice = pastNames.slice(pastShown, pastShown + PAST_PAGE);
    pastList.append(...slice.map(renderPastItem));
    pastShown += slice.length;
    pastMore.hidden = pastShown >= pastNames.length;
  };
  pastMore.addEventListener('click', showMorePast);

  const loadPast = async () => {
    if (pastNames.length) return; // 読み込み済み
    showError(pastError, '');
    invalidatePast();
    try {
      const { repo, token } = needSettings();
      pastNames = (await listDir(repo, token, LOGS_DIR)).filter((n) => n.endsWith('.md')).sort().reverse();
      if (!pastNames.length) showError(pastError, 'まだログがありません。');
      showMorePast();
    } catch (err) {
      showError(pastError, describeError(err));
    }
  };

  window.addEventListener('beforeunload', (e) => {
    if (busy) e.preventDefault();
  });

  // ---- 設定 ----
  const openSettings = () => {
    repoInput.value = settings?.repo ?? DEFAULT_REPO;
    tokenInput.value = settings?.token ?? '';
    showError(settingsError, '');
    dialog.showModal();
    // iPhone の Safari は autofocus を無視して最初の入力欄にフォーカスし、キーボードを出すことがあるので、
    // 開いた直後に見出しへフォーカスを移す（トークンは貼り付けるだけなのでキーボードは要らない）
    dialog.querySelector<HTMLElement>('.post-dialog-title')?.focus({ preventScroll: true });
  };
  $('open-settings').addEventListener('click', openSettings);
  document.querySelectorAll('[data-open-settings]').forEach((b) => b.addEventListener('click', openSettings));
  $('cancel-settings').addEventListener('click', () => dialog.close());

  $<HTMLFormElement>('settings-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const next = { repo: repoInput.value.trim(), token: tokenInput.value.trim() };
    if (!/^[\w.-]+\/[\w.-]+$/.test(next.repo)) return showError(settingsError, 'リポジトリは「持ち主/名前」の形で入力してください。');
    if (!next.token) return showError(settingsError, 'トークンを入力してください。');
    const save = $<HTMLButtonElement>('save-settings');
    save.disabled = true;
    showError(settingsError, '');
    try {
      await checkAccess(next.repo, next.token);
      await saveSettings(next);
      settings = next;
      invalidatePast();
      banner.hidden = true;
      dialog.close();
      status.textContent = `設定を保存しました（${next.repo} の ${BRANCH} に投稿します）。`;
    } catch (err) {
      showError(settingsError, describeError(err));
    } finally {
      save.disabled = false;
    }
  });

  $('delete-token').addEventListener('click', async () => {
    await clearSettings();
    settings = undefined;
    tokenInput.value = '';
    banner.hidden = false;
    showError(settingsError, 'トークンを削除しました。');
  });

  // ---- 起動 ----
  date.value = nowInJapan().date;
  renderPhotos();
  loadSettings()
    .then((s) => {
      settings = s;
      banner.hidden = !!s;
    })
    .catch(() => {
      banner.hidden = false;
    });
}
