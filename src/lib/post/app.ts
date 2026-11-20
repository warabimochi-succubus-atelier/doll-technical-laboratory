// 投稿アプリの画面の動き（src/pages/post/index.astro から呼ぶ）
import { BRANCH, checkAccess, commitFiles, fileExists, GitHubError, type NewFile } from './github';
import { blobToBase64, resizeToJpeg, textToBase64 } from './image';
import { buildLogMarkdown, nowInJapan, splitLines } from './markdown';
import { clearSettings, loadSettings, saveSettings, type Settings } from './storage';

export const DEFAULT_REPO = 'warabimochi-succubus-atelier/doll-technical-laboratory';
const MAX_PHOTOS = 5;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

/** エラーを利用者向けの1行にする */
export function describeError(e: unknown): string {
  if (e instanceof GitHubError) {
    if (e.status === 401) return 'トークンの有効期限が切れているか、正しくありません。設定から入れ直してください。';
    if (e.status === 403) return 'トークンの権限が足りません（Contents の書き込みが必要です）。設定から入れ直してください。';
    if (e.status === 404) return 'リポジトリが見つからないか、このトークンでは見られません。設定を確認してください。';
    if (e.status === 409 || e.status === 422) return 'GitHub 側の更新とぶつかりました。もう一度送信してください。';
    return `GitHub でエラーが起きました（${e.status}${e.message ? `: ${e.message}` : ''}）。`;
  }
  if (e instanceof TypeError) return '通信できませんでした。電波のよい場所でもう一度お試しください。';
  return e instanceof Error ? e.message : '原因の分からないエラーが起きました。';
}

export function initPostApp() {
  const siteUrl = document.body.dataset.siteUrl ?? '/';
  const form = $<HTMLFormElement>('post-form');
  const photoInput = $<HTMLInputElement>('photo-input');
  const photoList = $<HTMLUListElement>('photo-list');
  const bgRow = $('check-background-row');
  const bgCheck = $<HTMLInputElement>('check-background');
  const publicCheck = $<HTMLInputElement>('check-public');
  const doll = $<HTMLInputElement>('doll');
  const date = $<HTMLInputElement>('date');
  const fields = { doya: $<HTMLTextAreaElement>('doya'), gunu: $<HTMLTextAreaElement>('gunu'), hate: $<HTMLTextAreaElement>('hate'), memo: $<HTMLTextAreaElement>('memo') };
  const formError = $('form-error');
  const status = $('status');
  const submit = $<HTMLButtonElement>('submit');
  const banner = $('settings-banner');

  const dialog = $<HTMLDialogElement>('settings');
  const repoInput = $<HTMLInputElement>('repo');
  const tokenInput = $<HTMLInputElement>('token');
  const settingsError = $('settings-error');

  let settings: Settings | undefined;
  let photos: { blob: Blob; preview: string }[] = [];
  let busy = false;

  const showError = (el: HTMLElement, message: string) => {
    el.textContent = message;
    el.hidden = !message;
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
    bgRow.hidden = photos.length === 0;
  };

  photoInput.addEventListener('change', async () => {
    const files = [...(photoInput.files ?? [])];
    photoInput.value = '';
    showError(formError, '');
    const room = MAX_PHOTOS - photos.length;
    if (files.length > room) showError(formError, `写真は${MAX_PHOTOS}枚までです。最初の${Math.max(room, 0)}枚だけ追加しました。`);
    for (const [i, file] of files.slice(0, Math.max(room, 0)).entries()) {
      status.textContent = `写真を縮小しています… ${i + 1} / ${Math.min(files.length, room)}`;
      try {
        const blob = await resizeToJpeg(file);
        photos.push({ blob, preview: URL.createObjectURL(blob) });
        renderPhotos();
      } catch (e) {
        showError(formError, `${file.name} を読み込めませんでした。${describeError(e)}`);
      }
    }
    status.textContent = '';
  });

  // ---- 入力のリセット ----
  const resetForm = () => {
    photos.forEach((p) => URL.revokeObjectURL(p.preview));
    photos = [];
    renderPhotos();
    form.reset();
    date.value = nowInJapan().date;
  };

  // ---- 投稿 ----
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (busy) return;
    showError(formError, '');

    const input = {
      date: date.value || nowInJapan().date,
      doll: doll.value.trim(),
      techniques: [...form.querySelectorAll<HTMLInputElement>('input[name="technique"]:checked')].map((c) => c.value),
      doya: splitLines(fields.doya.value),
      gunu: splitLines(fields.gunu.value),
      hate: splitLines(fields.hate.value),
      memo: fields.memo.value,
    };

    const problem = !settings
      ? 'GitHub の設定がまだです。右上の ⚙ から設定してください。'
      : !input.doll
        ? 'ドールを入力してください。'
        : photos.length === 0 && !input.doya.length && !input.gunu.length && !input.hate.length && !input.memo.trim()
          ? '写真・感想・メモのどれかを入力してください。'
          : photos.length > 0 && !bgCheck.checked
            ? '写真の背景を確認して、チェックを入れてください。'
            : !publicCheck.checked
              ? '公開サイトに載ることの確認にチェックを入れてください。'
              : '';
    if (problem) {
      showError(formError, problem);
      return;
    }

    busy = true;
    submit.disabled = true;
    const { repo, token } = settings!;
    try {
      // 投稿した日時（日本時間）でファイル名を決める。万一同じ名前があれば -2, -3… を付ける
      let stem = `${input.date}-${nowInJapan().time}`;
      status.textContent = '送信の準備をしています…';
      for (let n = 2; await fileExists(repo, token, `src/content/logs/${stem}.md`); n++) {
        stem = `${input.date}-${nowInJapan().time}-${n}`;
      }
      const photoNames = photos.map((_, i) => `${stem}-${i + 1}.jpg`);

      const files: NewFile[] = [];
      for (const [i, p] of photos.entries()) {
        files.push({ path: `public/images/logs/${photoNames[i]}`, base64: await blobToBase64(p.blob) });
      }
      files.push({
        path: `src/content/logs/${stem}.md`,
        base64: await textToBase64(buildLogMarkdown({ ...input, photos: photoNames })),
      });

      status.textContent = '送信しています…';
      await commitFiles(repo, token, files, `Add log: ${input.date} ${input.doll}`);

      const logUrl = `${siteUrl}logs/${stem}/`;
      resetForm();
      status.replaceChildren(
        '✅ 送信しました。数分でサイトに反映されます。',
        document.createElement('br'),
        Object.assign(document.createElement('a'), { href: logUrl, textContent: logUrl, target: '_blank', rel: 'noopener' }),
      );
    } catch (err) {
      status.textContent = '';
      showError(formError, `❌ 送信できませんでした。${describeError(err)}（入力内容はそのまま残っています）`);
    } finally {
      busy = false;
      submit.disabled = false;
    }
  });

  window.addEventListener('beforeunload', (e) => {
    if (busy) e.preventDefault();
  });

  // ---- 設定 ----
  const openSettings = () => {
    repoInput.value = settings?.repo ?? DEFAULT_REPO;
    tokenInput.value = settings?.token ?? '';
    showError(settingsError, '');
    dialog.showModal();
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
