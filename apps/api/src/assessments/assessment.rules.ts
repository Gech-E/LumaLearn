export function scoreAnswer(question: { kind: string; answer: any }, answer: string | string[]) {
  const expected = (
    Array.isArray(question.answer) ? question.answer : [question.answer]
  ) as string[];
  const submitted = Array.isArray(answer) ? answer : [answer];
  if (question.kind === 'SHORT_TEXT')
    return (
      submitted.length === 1 &&
      expected.some(
        (v) => v.trim().toLocaleLowerCase('en') === submitted[0].trim().toLocaleLowerCase('en'),
      )
    );
  return (
    submitted.length === expected.length &&
    new Set(submitted).size === submitted.length &&
    expected.every((v) => submitted.includes(v))
  );
}
export function effectiveDeadline(base: Date | null, extension: Date | null) {
  if (!base) return extension;
  if (!extension) return base;
  return new Date(Math.max(base.getTime(), extension.getTime()));
}
