// The issue numbers a workspace names: "#6159" in its title (two or more digits, so "Step #1" isn't one), or a branch
// such as issue-6307-…, fix-9421-…, bug-…, gh-… or i6410-…, optionally after a "user/" prefix. Version-like numbers
// elsewhere in a branch (solos-5100-…) aren't references. The daemon only links numbers GitHub confirms.
const TITLE = /(?:^|[\s(\[,;])#(\d{2,})\b/g;
const BRANCH = /(?:^|\/)(?:(?:issues?|fix|bug|gh)[-_/]|i)(\d{2,})(?:[-_/]|$)/i;

export function issueNumbersFrom({ title, branch }: { title: string | null | undefined; branch: string | null | undefined }): number[] {
  const numbers: number[] = [];
  const add = (value: string) => { const number = Number(value); if (Number.isSafeInteger(number) && !numbers.includes(number)) numbers.push(number); };
  for (const match of (title ?? "").matchAll(TITLE)) add(match[1]);
  const fromBranch = BRANCH.exec(branch ?? "");
  if (fromBranch) add(fromBranch[1]);
  return numbers;
}
