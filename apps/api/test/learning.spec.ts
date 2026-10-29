import { effectiveDeadline, scoreAnswer } from '../src/assessments/assessment.rules';

describe('authoritative practice scoring', () => {
  it('requires every correct multiple-choice option without duplicates or extras', () => {
    const question = { kind: 'MULTIPLE', answer: ['A', 'C'] };
    expect(scoreAnswer(question, ['C', 'A'])).toBe(true);
    expect(scoreAnswer(question, ['A'])).toBe(false);
    expect(scoreAnswer(question, ['A', 'C', 'B'])).toBe(false);
    expect(scoreAnswer(question, ['A', 'A'])).toBe(false);
  });
  it('normalizes short-text whitespace and case but only accepts configured alternatives', () => {
    const question = { kind: 'SHORT_TEXT', answer: ['folder', 'a folder'] };
    expect(scoreAnswer(question, ' FOLDER ')).toBe(true);
    expect(scoreAnswer(question, 'a folder')).toBe(true);
    expect(scoreAnswer(question, 'folders are useful')).toBe(false);
    expect(scoreAnswer(question, ['folder', 'a folder'])).toBe(false);
  });
  it('does not allow an accommodation to shorten an existing deadline', () => {
    const base = new Date('2026-10-25T12:00:00Z');
    const earlier = new Date('2026-10-24T12:00:00Z');
    const later = new Date('2026-10-26T12:00:00Z');
    expect(effectiveDeadline(base, earlier)).toEqual(base);
    expect(effectiveDeadline(base, later)).toEqual(later);
    expect(effectiveDeadline(null, null)).toBeNull();
  });
});
