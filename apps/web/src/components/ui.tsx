'use client';
import { t, copy } from '@/lib/i18n';
import Link from 'next/link';
import {
  ArrowRight,
  BookOpen,
  Check,
  Clock3,
  ArrowUpRight,
  LoaderCircle,
  AlertCircle,
  Sprout,
  Layers3,
  Monitor,
  CheckCircle2,
} from 'lucide-react';
import {
  Children,
  cloneElement,
  isValidElement,
  useEffect,
  useState,
  type ReactElement,
  type ReactNode,
  type FormEvent,
} from 'react';
import { api, message } from '@/lib/api';
import type { Course } from '@/lib/types';
export function useData<T>(path: string | null, dependencies: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [revision, reload] = useState(0);
  useEffect(() => {
    let active = true;
    if (!path) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    api<T>(path)
      .then((value) => {
        if (active) setData(value);
      })
      .catch((e) => {
        if (active) setError(message(e));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    }; /* path is the full request identity; revision explicitly refreshes it. */
  }, [path, revision, ...dependencies]);
  return { data, setData, error, loading, reload: () => reload((v) => v + 1) };
}
export function Loading() {
  return (
    <div role="status" className="loading">
      <LoaderCircle className="spin" size={24} />
      <span>{copy('loading')}</span>
    </div>
  );
}
export function Alert({ children, success = false }: { children: ReactNode; success?: boolean }) {
  return (
    <div className={`alert ${success ? 'success' : ''}`} role={success ? 'status' : 'alert'}>
      {success ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
      <div>{children}</div>
    </div>
  );
}
export function Empty({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <Sprout size={28} />
      </div>
      <h2>{title}</h2>
      {description ? <p>{description}</p> : null}
      {children}
    </div>
  );
}
export function PageHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <header className="page-heading">
      <div>
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        <h1>{title}</h1>
        {description ? <p className="lede">{description}</p> : null}
      </div>
      {action}
    </header>
  );
}
export function Button({
  children,
  busy = false,
  secondary = false,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  busy?: boolean;
  secondary?: boolean;
}) {
  return (
    <button
      {...props}
      disabled={busy || props.disabled}
      className={`button ${secondary ? 'secondary' : ''} ${props.className || ''}`}
    >
      {busy ? <LoaderCircle size={18} className="spin" /> : null}
      {children}
    </button>
  );
}
export function LinkButton({
  href,
  children,
  secondary = false,
}: {
  href: string;
  children: ReactNode;
  secondary?: boolean;
}) {
  return (
    <Link className={`button ${secondary ? 'secondary' : ''}`} href={href}>
      {children}
      <ArrowRight size={17} />
    </Link>
  );
}
export function Field({
  label,
  id,
  children,
  hint,
}: {
  label: string;
  id: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {hint
        ? Children.map(children, (child) =>
            isValidElement(child) && ['input', 'select', 'textarea'].includes(String(child.type))
              ? cloneElement(
                  child as ReactElement<{
                    'aria-describedby'?: string;
                  }>,
                  { 'aria-describedby': `${id}-hint` },
                )
              : child,
          )
        : children}
      {hint ? (
        <span className="field-hint" id={`${id}-hint`}>
          {hint}
        </span>
      ) : null}
    </div>
  );
}
export function Progress({ value, label = true }: { value: number; label?: boolean }) {
  const normalized = Math.max(0, Math.min(100, value));
  return (
    <div className="progress-group">
      {label ? (
        <span>
          {Math.round(normalized)}
          {t('% complete')}
        </span>
      ) : null}
      <progress
        max={100}
        value={normalized}
        aria-label={t('{value0}% complete', { value0: Math.round(normalized) })}
      />
    </div>
  );
}
export function Badge({ children, tone = 'green' }: { children: ReactNode; tone?: string }) {
  return <span className={`badge ${tone}`}>{children}</span>;
}
export function CourseArt({ variant = 0, small = false }: { variant?: number; small?: boolean }) {
  return (
    <div
      className={t('course-art variant-{value0} {value1}', {
        value0: variant % 3,
        value1: small ? 'small' : '',
      })}
      aria-hidden="true"
    >
      <div className="art-grid" />
      <div className="art-window">
        <div className="window-top">
          <i />
          <i />
          <i />
        </div>
        <div className="window-body">
          {variant % 3 === 1 ? (
            <Layers3 size={42} strokeWidth={1.35} />
          ) : variant % 3 === 2 ? (
            <Monitor size={42} strokeWidth={1.35} />
          ) : (
            <BookOpen size={42} strokeWidth={1.35} />
          )}
          <div className="art-lines">
            <i />
            <i />
            <i />
          </div>
        </div>
      </div>
      <div className="art-seal">
        <Check size={20} />
      </div>
      <span className="art-orbit" />
    </div>
  );
}
export function CourseCard({
  course,
  index = 0,
  progress,
  href,
}: {
  course: Course;
  index?: number;
  progress?: number;
  href?: string;
}) {
  return (
    <article className="course-card">
      <Link
        href={href || `/courses/${course.id}`}
        className="course-art-link"
        tabIndex={-1}
        aria-hidden="true"
      >
        <CourseArt variant={index} />
      </Link>
      <div className="course-card-body">
        <div className="card-kicker">
          <span>{course.subject || t('Digital skills')}</span>
          <Badge tone="neutral">{course.level || t('Beginner')}</Badge>
        </div>
        <h3>
          <Link href={href || `/courses/${course.id}`}>{course.title}</Link>
        </h3>
        <p>{course.summary}</p>
        <div className="course-meta">
          <span>
            <Clock3 size={15} />
            {course.effortMinutes}
            {t(' min ')}
          </span>
          <span>
            <BookOpen size={15} />
            {course.language === 'ti' ? t('\u1275\u130D\u122D\u129B') : t('English')}
          </span>
        </div>
        {progress !== undefined ? <Progress value={progress} /> : null}
        <div className="card-footer">
          <span>{progress !== undefined ? copy('continue') : copy('free')}</span>
          <ArrowUpRight size={20} />
        </div>
      </div>
    </article>
  );
}
export function FormAction({
  children,
  onSubmit,
  className = '',
}: {
  children: ReactNode;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void | Promise<void>;
  className?: string;
}) {
  return (
    <form
      className={className}
      onSubmit={(event) => {
        event.preventDefault();
        void onSubmit(event);
      }}
    >
      {children}
    </form>
  );
}
export function TextContent({ text }: { text: string }) {
  return (
    <div className="prose">
      {text
        .split(/\n\s*\n/)
        .filter(Boolean)
        .map((paragraph, i) => {
          if (paragraph.startsWith('### ')) return <h3 key={i}>{paragraph.slice(4)}</h3>;
          if (paragraph.startsWith('## ')) return <h2 key={i}>{paragraph.slice(3)}</h2>;
          if (paragraph.startsWith('- '))
            return (
              <ul key={i}>
                {paragraph.split('\n').map((line, j) => (
                  <li key={j}>{line.replace(/^- /, '')}</li>
                ))}
              </ul>
            );
          return <p key={i}>{paragraph}</p>;
        })}
    </div>
  );
}
