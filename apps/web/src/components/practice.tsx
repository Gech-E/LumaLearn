'use client';
import { t, copy } from '@/lib/i18n';
import Link from 'next/link';
import { useState } from 'react';
import { ArrowRight, CheckCircle2, Sparkles } from 'lucide-react';
import { message } from '@/lib/api';
import { learningApi } from '@/lib/learning-api';
import type { Attempt, Result } from '@/lib/types';
import { useApp } from './application';
import {
  Alert,
  Badge,
  Button,
  FormAction,
  LinkButton,
  Loading,
  PageHeading,
  TextContent,
} from './ui';
import { useActivity, nextHref } from './learning-shared';
export function Practice({ id }: { id: string }) {
  const { user, online } = useApp();
  const { data: activity, loading, error } = useActivity(id);
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [responses, setResponses] = useState<Record<string, string | string[]>>({});
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState('');
  async function start() {
    setBusy(true);
    setFailure('');
    try {
      setAttempt(await learningApi.startAttempt(id));
      setResult(null);
      setResponses({});
    } catch (e) {
      setFailure(message(e));
    } finally {
      setBusy(false);
    }
  }
  async function submit() {
    if (!attempt) return;
    setBusy(true);
    setFailure('');
    try {
      setResult(
        await learningApi.submitAttempt(attempt.id, {
          responses: attempt.questions.map((q) => ({
            questionId: q.id,
            answer: responses[q.id] ?? (q.kind === 'MULTIPLE' ? [] : ''),
          })),
        }),
      );
    } catch (e) {
      setFailure(message(e));
    } finally {
      setBusy(false);
    }
  }
  if (loading) return <Loading />;
  if (error || !activity) return <Alert>{error}</Alert>;
  return (
    <div className="reading-width">
      <Link href={`/learn/${activity.courseId}`} className="back-link">
        ← {activity.courseTitle}
      </Link>
      <PageHeading
        eyebrow={t('A SPACE TO TRY')}
        title={activity.title}
        description={copy('practiceIntro')}
      />
      {failure ? <Alert>{failure}</Alert> : null}
      {!online ? <Alert>{copy('onlineRequired')}</Alert> : null}
      {result ? (
        <section className="panel practice-result">
          <span className="result-icon">
            <CheckCircle2 size={35} />
          </span>
          <h2>{copy('practiceComplete')}</h2>
          <p className="result-score">{result.score}%</p>
          <Badge tone={result.passed ? 'green' : 'amber'}>
            {result.passed ? t('Passed') : t('Keep practicing')}
          </Badge>
          <p>
            {result.passed
              ? t(
                  'You\u2019ve put this learning into practice. Take that confidence into your next step.',
                )
              : t(
                  'Review the example and try again. Every attempt helps you see what to work on next.',
                )}
          </p>
          {result.feedback?.map((item) => (
            <div key={item.questionId} className="answer-feedback">
              <strong>
                {item.correct ? t('\u2713 You\u2019ve got it.') : t('A useful thing to review.')}
              </strong>
              <p>{item.explanation}</p>
            </div>
          ))}
          {!result.feedback ? (
            <p>{t('Your detailed feedback will be released according to the course rules.')}</p>
          ) : null}
          <div className="actions">
            <Button secondary busy={busy} disabled={!online} onClick={() => void start()}>
              {copy('tryAgain')}
            </Button>
            <LinkButton href={activity.nextId ? nextHref(activity) : `/learn/${activity.courseId}`}>
              {copy('next')}
            </LinkButton>
          </div>
        </section>
      ) : attempt ? (
        <FormAction onSubmit={submit} className="practice-form">
          <div className="practice-attempt">
            {t('Attempt ')}
            {attempt.number}
            {attempt.expiresAt
              ? t(' \u00B7 Submit before {value0}', {
                  value0: new Intl.DateTimeFormat(user?.locale || 'en', {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                    timeZone: user?.timezone || 'Africa/Nairobi',
                  }).format(new Date(attempt.expiresAt)),
                })
              : t(' \u00B7 No time limit')}
          </div>
          {attempt.questions.map((question, index) => (
            <fieldset key={question.id} className="question">
              <legend>
                <span className="question-number">{String(index + 1).padStart(2, '0')}</span>
                {question.prompt}
              </legend>
              {question.kind === 'SHORT_TEXT' ? (
                <textarea
                  aria-label={t('Your answer')}
                  required
                  value={String(responses[question.id] || '')}
                  onChange={(e) => setResponses({ ...responses, [question.id]: e.target.value })}
                  maxLength={4000}
                />
              ) : (
                <div className="question-options">
                  {question.options.map((option, optionIndex) => {
                    const multiple = question.kind === 'MULTIPLE';
                    const selected = multiple
                      ? ((responses[question.id] as string[]) || []).includes(option)
                      : responses[question.id] === option;
                    return (
                      <label key={option} className={selected ? 'selected' : ''}>
                        <input
                          type={multiple ? 'checkbox' : 'radio'}
                          name={question.id}
                          value={option}
                          checked={selected}
                          required={!multiple}
                          onChange={() =>
                            setResponses({
                              ...responses,
                              [question.id]: multiple
                                ? selected
                                  ? (responses[question.id] as string[]).filter((v) => v !== option)
                                  : [...((responses[question.id] as string[]) || []), option]
                                : option,
                            })
                          }
                        />
                        <span className="option-letter">
                          {String.fromCharCode(65 + optionIndex)}
                        </span>
                        <span>{option}</span>
                      </label>
                    );
                  })}
                </div>
              )}
            </fieldset>
          ))}
          <Button type="submit" busy={busy} disabled={!online}>
            {copy('checkAnswer')}
            <ArrowRight size={18} />
          </Button>
        </FormAction>
      ) : (
        <section className="panel practice-start">
          <span className="small-icon">
            <Sparkles size={26} />
          </span>
          <h2>{t('A little practice builds confidence.')}</h2>
          <TextContent text={activity.body || activity.objective} />
          <p>
            {activity.assessment?.maxAttempts}
            {t(' attempts available \u00B7')} {activity.assessment?.passPercent}
            {t('% to pass ')}
          </p>
          <Button busy={busy} disabled={!online} onClick={() => void start()}>
            {copy('startPractice')}
            <ArrowRight size={18} />
          </Button>
        </section>
      )}
    </div>
  );
}
