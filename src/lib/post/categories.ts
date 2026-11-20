// カテゴリと研究分野（src/data/categories.json）の読み書き。
// 技法ファイルの category はカテゴリ名そのものなので、カテゴリ名を変えるときは技法ファイルもまとめて書き換える。
import { commitFiles, getTextFile, type NewFile } from './github';
import { textToBase64 } from './image';
import { buildTechniqueMarkdown } from './markdown';
import type { Technique } from './techniques';

export const CATEGORIES_PATH = 'src/data/categories.json';

export interface Field {
  name: string;
  categories: string[];
}

const clone = (fields: Field[]): Field[] => fields.map((f) => ({ name: f.name, categories: [...f.categories] }));
export const allCategories = (fields: Field[]) => fields.flatMap((f) => f.categories);

export async function loadFields(repo: string, token: string): Promise<Field[]> {
  const data = JSON.parse(await getTextFile(repo, token, CATEGORIES_PATH));
  if (!Array.isArray(data.fields)) throw new Error('categories.json の形式を読み取れませんでした。');
  return data.fields.map((f: Field) => ({ name: String(f.name), categories: (f.categories ?? []).map(String) }));
}

function nameProblem(name: string, kind: string) {
  if (!name) return `${kind}名を入力してください。`;
  if (name.length > 30) return `${kind}名は30文字以内にしてください。`;
  if (/[\\"\n]/.test(name)) return `${kind}名に \\ や " は使えません。`;
  return '';
}

async function commitFields(repo: string, token: string, fields: Field[], message: string, extra: NewFile[] = []) {
  const json = JSON.stringify({ fields }, null, 2) + '\n';
  await commitFiles(repo, token, [{ path: CATEGORIES_PATH, base64: await textToBase64(json) }, ...extra], message);
}

const findField = (fields: Field[], name: string) => {
  const f = fields.find((x) => x.name === name);
  if (!f) throw new Error(`研究分野「${name}」が見つかりません。画面を開き直してください。`);
  return f;
};

// ---- 研究分野 ----

export async function addField(repo: string, token: string, fields: Field[], name: string) {
  name = name.trim();
  const problem = nameProblem(name, '研究分野');
  if (problem) throw new Error(problem);
  if (fields.some((f) => f.name === name)) throw new Error(`研究分野「${name}」はすでにあります。`);
  await commitFields(repo, token, [...clone(fields), { name, categories: [] }], `Add field: ${name}`);
}

export async function renameField(repo: string, token: string, fields: Field[], oldName: string, name: string) {
  name = name.trim();
  const problem = nameProblem(name, '研究分野');
  if (problem) throw new Error(problem);
  if (name === oldName) return false;
  if (fields.some((f) => f.name === name)) throw new Error(`研究分野「${name}」はすでにあります。`);
  const next = clone(fields);
  findField(next, oldName).name = name;
  await commitFields(repo, token, next, `Rename field: ${oldName} → ${name}`);
  return true;
}

export async function deleteField(repo: string, token: string, fields: Field[], name: string) {
  const f = findField(fields, name);
  if (f.categories.length) throw new Error(`研究分野「${name}」にはカテゴリが${f.categories.length}個あります。先にカテゴリを消すか、別の研究分野へ移してください。`);
  await commitFields(repo, token, clone(fields).filter((x) => x.name !== name), `Delete field: ${name}`);
}

export async function moveField(repo: string, token: string, fields: Field[], name: string, step: -1 | 1) {
  const next = clone(fields);
  const i = next.findIndex((f) => f.name === name);
  const j = i + step;
  if (i < 0 || j < 0 || j >= next.length) return false;
  [next[i], next[j]] = [next[j], next[i]];
  await commitFields(repo, token, next, `Reorder fields`);
  return true;
}

// ---- カテゴリ ----

/**
 * カテゴリを追加（original が null）・名前変更・研究分野の移動をする。
 * 名前を変えたときは、そのカテゴリの技法ファイルも書き換える。戻り値は書き換えた技法の数。
 */
export async function saveCategory(
  repo: string,
  token: string,
  fields: Field[],
  techniques: Technique[],
  original: { name: string; field: string } | null,
  input: { name: string; field: string },
) {
  const name = input.name.trim();
  const problem = nameProblem(name, 'カテゴリ');
  if (problem) throw new Error(problem);
  const renamed = !!original && original.name !== name;
  if ((!original || renamed) && allCategories(fields).includes(name)) throw new Error(`カテゴリ「${name}」はすでにあります。`);

  const next = clone(fields);
  const target = findField(next, input.field);
  if (!original) {
    target.categories.push(name);
  } else {
    const from = findField(next, original.field);
    const i = from.categories.indexOf(original.name);
    if (i < 0) throw new Error(`カテゴリ「${original.name}」が見つかりません。画面を開き直してください。`);
    if (from === target) {
      from.categories[i] = name; // 同じ研究分野なら順番はそのまま
    } else {
      from.categories.splice(i, 1);
      target.categories.push(name); // 別の研究分野へ移したら最後に並べる
    }
  }

  const extra: NewFile[] = [];
  if (renamed) {
    for (const t of techniques.filter((t) => t.category === original!.name)) {
      extra.push({
        path: `src/content/techniques/${t.id}.md`,
        base64: await textToBase64(buildTechniqueMarkdown({ ...t, category: name })),
      });
    }
  }
  const message = !original
    ? `Add category: ${name}`
    : renamed
      ? `Rename category: ${original.name} → ${name}`
      : `Move category: ${name} → ${input.field}`;
  if (original && !renamed && original.field === input.field) return 0; // 変更なし
  await commitFields(repo, token, next, message, extra);
  return extra.length;
}

export async function deleteCategory(repo: string, token: string, fields: Field[], techniques: Technique[], name: string) {
  const used = techniques.filter((t) => t.category === name);
  if (used.length) {
    throw new Error(
      `カテゴリ「${name}」には技法が${used.length}個あります（${used.map((t) => t.name).slice(0, 5).join('、')}${used.length > 5 ? ' など' : ''}）。先に技法を消すか、別のカテゴリへ移してください。`,
    );
  }
  if (allCategories(fields).length <= 1) throw new Error('カテゴリを1つも無くすことはできません。');
  const next = clone(fields).map((f) => ({ ...f, categories: f.categories.filter((c) => c !== name) }));
  await commitFields(repo, token, next, `Delete category: ${name}`);
}

/** 研究分野の中で1つ上（-1）・下（+1）に動かす */
export async function moveCategory(repo: string, token: string, fields: Field[], name: string, step: -1 | 1) {
  const next = clone(fields);
  const f = next.find((x) => x.categories.includes(name));
  if (!f) return false;
  const i = f.categories.indexOf(name);
  const j = i + step;
  if (j < 0 || j >= f.categories.length) return false;
  [f.categories[i], f.categories[j]] = [f.categories[j], f.categories[i]];
  await commitFields(repo, token, next, `Reorder categories: ${f.name}`);
  return true;
}
