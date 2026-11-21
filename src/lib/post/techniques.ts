// 技術リスト（src/content/techniques/<技法名>.md）の読み書き。
// ファイル名がそのまま技法 ID で、制作ログはこの ID で技法を指している。
// そのため、名前を変えるときはファイル名ごと変え、使っているログもまとめて書き換える。
import { commitFiles, getTextFile, listDir, type NewFile } from './github';
import { textToBase64 } from './image';
import {
  buildLogMarkdown,
  buildTechniqueMarkdown,
  parseLogMarkdown,
  parseTechniqueMarkdown,
  techniqueNameProblem,
  type TechniqueInput,
} from './markdown';

const DIR = 'src/content/techniques';
const LOGS_DIR = 'src/content/logs';

export interface Technique extends TechniqueInput {
  id: string; // ファイル名（拡張子なし）
}

const path = (id: string) => `${DIR}/${id}.md`;

/** 読めないファイルがあったとき、どのファイルかが分かるようにする */
async function readParsed<T>(file: string, read: () => Promise<string>, parse: (text: string) => T): Promise<T> {
  const text = await read();
  try {
    return parse(text);
  } catch (e) {
    throw new Error(`${file}：${e instanceof Error ? e.message : e}`);
  }
}
const sameId = (a: string, b: string) => a.toLowerCase() === b.toLowerCase(); // 大文字小文字だけ違う名前も同じとみなす

/** 表示順（カテゴリ順 → order → 名前）に並べる */
export function sortTechniques(list: Technique[], categories: readonly string[]) {
  return [...list].sort(
    (a, b) =>
      categories.indexOf(a.category) - categories.indexOf(b.category) ||
      a.order - b.order ||
      a.name.localeCompare(b.name, 'ja'),
  );
}

export async function loadTechniques(repo: string, token: string): Promise<Technique[]> {
  const names = (await listDir(repo, token, DIR)).filter((n) => n.endsWith('.md'));
  return Promise.all(
    names.map(async (n) => {
      const id = n.replace(/\.md$/, '');
      const file = `${DIR}/${n}`;
      const t = await readParsed(file, () => getTextFile(repo, token, file), parseTechniqueMarkdown);
      return { ...t, id, name: t.name || id };
    }),
  );
}

/** その技法を使っている制作ログ */
async function logsUsing(repo: string, token: string, id: string) {
  const names = (await listDir(repo, token, LOGS_DIR)).filter((n) => n.endsWith('.md'));
  const logs = await Promise.all(
    names.map(async (name) => {
      const file = `${LOGS_DIR}/${name}`;
      return { name, log: await readParsed(file, () => getTextFile(repo, token, file), parseLogMarkdown) };
    }),
  );
  return logs.filter((l) => l.log.techniques.includes(id));
}

const nextOrder = (all: Technique[], category: string, exceptId?: string) =>
  Math.max(0, ...all.filter((t) => t.category === category && t.id !== exceptId).map((t) => t.order)) + 1;

/**
 * 技法を追加（original が null）または更新する。
 * 名前を変えたときは、ファイル名を変えて、その技法を使っている制作ログも書き換える。
 * 戻り値は書き換えたログの件数。
 */
export async function saveTechnique(
  repo: string,
  token: string,
  all: Technique[],
  original: Technique | null,
  input: { name: string; category: string; memo: string },
) {
  const name = input.name.trim();
  const problem = techniqueNameProblem(name);
  if (problem) throw new Error(problem);
  const renamed = !!original && original.id !== name;
  if ((!original || renamed) && all.some((t) => t.id !== original?.id && sameId(t.id, name))) {
    throw new Error(`「${name}」はすでに技術リストにあります。`);
  }

  // カテゴリを新しくした・移したときは、そのカテゴリの最後に並べる
  const order =
    original && original.category === input.category ? original.order : nextOrder(all, input.category, original?.id);
  const files: NewFile[] = [];
  let rewritten = 0;

  if (renamed) {
    files.push({ path: path(original!.id), delete: true });
    for (const { name: logName, log } of await logsUsing(repo, token, original!.id)) {
      log.techniques = log.techniques.map((t) => (t === original!.id ? name : t));
      files.push({ path: `${LOGS_DIR}/${logName}`, base64: await textToBase64(buildLogMarkdown(log)) });
      rewritten++;
    }
  }
  files.push({
    path: path(name),
    base64: await textToBase64(buildTechniqueMarkdown({ name, category: input.category, order, memo: input.memo })),
  });

  const message = !original
    ? `Add technique: ${name}`
    : renamed
      ? `Rename technique: ${original.id} → ${name}`
      : `Edit technique: ${name}`;
  await commitFiles(repo, token, files, message);
  return rewritten;
}

/** 技法を削除する。制作ログで使われているときは削除しない（サイトのビルドが止まるため） */
export async function deleteTechnique(repo: string, token: string, t: Technique) {
  const used = await logsUsing(repo, token, t.id);
  if (used.length) {
    const list = used.map((u) => u.name.replace(/\.md$/, '')).slice(0, 5).join('、');
    throw new Error(
      `「${t.name}」は制作ログ${used.length}件（${list}${used.length > 5 ? ' など' : ''}）で使われているため削除できません。先にそのログから外してください。`,
    );
  }
  await commitFiles(repo, token, [{ path: path(t.id), delete: true }], `Delete technique: ${t.name}`);
}

/** カテゴリ内で1つ上（-1）・下（+1）に動かす。そのカテゴリの order を 1, 2, 3… に振り直す */
export async function moveTechnique(
  repo: string,
  token: string,
  all: Technique[],
  categories: readonly string[],
  t: Technique,
  step: -1 | 1,
) {
  const group = sortTechniques(all, categories).filter((x) => x.category === t.category);
  const i = group.findIndex((x) => x.id === t.id);
  const j = i + step;
  if (i < 0 || j < 0 || j >= group.length) return false;
  [group[i], group[j]] = [group[j], group[i]];
  const files: NewFile[] = [];
  for (const [k, x] of group.entries()) {
    if (x.order === k + 1) continue;
    files.push({ path: path(x.id), base64: await textToBase64(buildTechniqueMarkdown({ ...x, order: k + 1 })) });
  }
  if (!files.length) return false;
  await commitFiles(repo, token, files, `Reorder techniques: ${t.category}`);
  return true;
}
