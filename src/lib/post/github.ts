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

export interface NewFile {
  path: string;
  base64: string;
}

/** files をまとめて 1 コミットにして main を進める。main が先に進んでいたら 1 回だけやり直す */
export async function commitFiles(repo: string, token: string, files: NewFile[], message: string) {
  const blobs = [];
  for (const f of files) {
    blobs.push(
      await gh<{ sha: string }>(token, `/repos/${repo}/git/blobs`, {
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
        tree: files.map((f, i) => ({ path: f.path, mode: '100644', type: 'blob', sha: blobs[i].sha })),
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
