// GitHub API（Git Data API）で、写真とログを 1 コミットにまとめて追加する。
// 通信先は api.github.com だけ。
const API = 'https://api.github.com';
export const BRANCH = 'main';

export class GitHubError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function gh<T>(token: string, path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(API + path, {
    method: init.method ?? 'GET',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
    cache: 'no-store',
  });
  if (!res.ok) {
    let message = '';
    try {
      message = (await res.json()).message ?? '';
    } catch {
      /* 本文なし */
    }
    throw new GitHubError(res.status, message);
  }
  return (await res.json()) as T;
}

const encodePath = (p: string) => p.split('/').map(encodeURIComponent).join('/');

/** トークンでこのリポジトリに書き込めるか確かめる */
export async function checkAccess(repo: string, token: string) {
  const info = await gh<{ permissions?: { push?: boolean } }>(token, `/repos/${repo}`);
  if (!info.permissions?.push) throw new GitHubError(403, 'このトークンには書き込み権限がありません');
}

/** main にそのファイルがすでにあるか */
export async function fileExists(repo: string, token: string, path: string) {
  try {
    await gh(token, `/repos/${repo}/contents/${encodePath(path)}?ref=${BRANCH}`);
    return true;
  } catch (e) {
    if (e instanceof GitHubError && e.status === 404) return false;
    throw e;
  }
}

/** フォルダ内のファイル名一覧（main の最新） */
export async function listDir(repo: string, token: string, path: string) {
  try {
    const items = await gh<{ name: string; type: string }[]>(token, `/repos/${repo}/contents/${encodePath(path)}?ref=${BRANCH}`);
    return items.filter((i) => i.type === 'file').map((i) => i.name);
  } catch (e) {
    if (e instanceof GitHubError && e.status === 404) return [];
    throw e;
  }
}

/** ファイルの中身を base64 で取る（1MB 以下のファイル向け） */
export async function getFileBase64(repo: string, token: string, path: string) {
  const f = await gh<{ content: string; encoding: string }>(token, `/repos/${repo}/contents/${encodePath(path)}?ref=${BRANCH}`);
  return f.content.replace(/\n/g, '');
}

export const base64ToBytes = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

export async function getTextFile(repo: string, token: string, path: string) {
  return new TextDecoder().decode(base64ToBytes(await getFileBase64(repo, token, path)));
}

/** 追加・上書きするファイル（base64）と、削除するファイル（delete: true） */
export type NewFile = { path: string; base64: string } | { path: string; delete: true };

/** files をまとめて 1 コミットにして main を進める。main が先に進んでいたら 1 回だけやり直す */
export async function commitFiles(repo: string, token: string, files: NewFile[], message: string) {
  const blobs: ({ sha: string } | null)[] = [];
  for (const f of files) {
    blobs.push(
      'delete' in f
        ? null
        : await gh<{ sha: string }>(token, `/repos/${repo}/git/blobs`, {
            method: 'POST',
            body: { content: f.base64, encoding: 'base64' },
          }),
    );
  }

  for (let attempt = 0; ; attempt++) {
    const ref = await gh<{ object: { sha: string } }>(token, `/repos/${repo}/git/ref/heads/${BRANCH}`);
    const parent = ref.object.sha;
    const parentCommit = await gh<{ tree: { sha: string } }>(token, `/repos/${repo}/git/commits/${parent}`);
    const tree = await gh<{ sha: string }>(token, `/repos/${repo}/git/trees`, {
      method: 'POST',
      body: {
        base_tree: parentCommit.tree.sha,
        // sha: null はそのファイルの削除
        tree: files.map((f, i) => ({ path: f.path, mode: '100644', type: 'blob', sha: blobs[i]?.sha ?? null })),
      },
    });
    const commit = await gh<{ sha: string }>(token, `/repos/${repo}/git/commits`, {
      method: 'POST',
      body: { message, tree: tree.sha, parents: [parent] },
    });
    try {
      await gh(token, `/repos/${repo}/git/refs/heads/${BRANCH}`, {
        method: 'PATCH',
        body: { sha: commit.sha, force: false },
      });
      return commit.sha;
    } catch (e) {
      if (attempt === 0 && e instanceof GitHubError && e.status === 422) continue;
      throw e;
    }
  }
}
