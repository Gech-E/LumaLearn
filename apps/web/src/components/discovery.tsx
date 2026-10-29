'use client';
import { t, copy } from '@/lib/i18n';
import Link from 'next/link';
import { useState } from 'react';
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Check,
  CheckCircle2,
  Clock3,
  Download,
  Globe2,
  Layers3,
  Leaf,
  Search,
  ShieldCheck,
  Sparkles,
  Sun,
  UserRound,
} from 'lucide-react';
import { api, message } from '@/lib/api';
import type { Course, Page } from '@/lib/types';
import { useApp } from './application';
import {
  Alert,
  Badge,
  Button,
  CourseArt,
  CourseCard,
  Empty,
  LinkButton,
  Loading,
  PageHeading,
  TextContent,
  useData,
} from './ui';
export function Landing() {
  const { data, error, loading } = useData<Page<Course>>('/courses?limit=3');
  return (
    <>
      <section className="landing-hero">
        <div className="hero-copy">
          <span className="hero-eyebrow">
            <span />
            <span>{copy('learningLabel')}</span>
          </span>
          <h1>
            {t('Make room for ')}
            <br />
            <span>{t('something new.')}</span>
            <svg viewBox="0 0 410 16" aria-hidden="true">
              <path
                d="M3 10C105 0 271 0 405 9"
                fill="none"
                stroke="#DDAA49"
                strokeWidth="5"
                strokeLinecap="round"
              />
            </svg>
          </h1>
          <p>{copy('heroText')}</p>
          <LinkButton href="/courses">{copy('startExploring')}</LinkButton>
          <div className="hero-footnote">
            <CheckCircle2 size={17} />
            {copy('heroNote')}
          </div>
        </div>
        <div
          className="hero-art"
          aria-label={t('An illustrated learning path from a small first step to a new skill')}
          role="img"
        >
          <div className="hero-art-ring ring-one" />
          <div className="hero-art-ring ring-two" />
          <span className="art-sun">
            <Sun size={49} strokeWidth={1.2} />
          </span>
          <div className="floating-note">
            <span className="note-icon">
              <Leaf size={22} />
            </span>
            <div>
              <strong>{t('A little progress, every day.')}</strong>
              <span>{t('Your pace. Your possibilities.')}</span>
            </div>
          </div>
          <div className="hero-workbook">
            <div className="workbook-top">
              <span className="workbook-logo">
                <Leaf size={19} />
                {t(' your next chapter ')}
              </span>
              <span>01 / 03</span>
            </div>
            <div className="workbook-illustration">
              <div className="large-leaf leaf-a" />
              <div className="large-leaf leaf-b" />
              <div className="large-leaf leaf-c" />
              <div className="leaf-stem" />
              <span className="illustration-dot" />
              <div className="book-small">
                <BookOpen size={58} strokeWidth={1.3} />
              </div>
            </div>
            <p>{t('START WITH SOMETHING SMALL')}</p>
            <h2>
              {t('Grow a skill. ')}
              <br />
              {t('Open a possibility. ')}
            </h2>
            <div className="illustration-progress">
              <span />
              <span />
              <span />
            </div>
            <div className="workbook-bottom">
              <span>
                <Clock3 size={14} />
                {t(' A few minutes for you ')}
              </span>
              <span className="round-arrow">
                <ArrowRight size={20} />
              </span>
            </div>
          </div>
          <div className="floating-completion">
            <span>
              <Check size={20} />
            </span>
            <div>
              <strong>{t('One step forward.')}</strong>
              <p>{t('That\u2019s something to feel good about.')}</p>
            </div>
          </div>
          <span className="tiny-spark">
            <Sparkles size={27} />
          </span>
        </div>
      </section>
      <section className="value-strip" aria-label={t('Learning that fits your life')}>
        <span>
          <Clock3 size={20} />
          {t('Small, manageable lessons ')}
        </span>
        <span>
          <BookOpen size={20} />
          {t('Practice for everyday life ')}
        </span>
        <span>
          <Download size={20} />
          {t('Text lessons to take offline ')}
        </span>
      </section>
      <section className="featured-section">
        <div className="section-heading">
          <div>
            <span className="eyebrow">{t('FIND YOUR STARTING POINT')}</span>
            <h2>{copy('featured')}</h2>
            <p>{copy('featuredIntro')}</p>
          </div>
          <Link href="/courses" className="text-link">
            {copy('allCourses')}
            <ArrowUpRight size={18} />
          </Link>
        </div>
        {loading ? (
          <Loading />
        ) : error ? (
          <Alert>{error}</Alert>
        ) : (
          <div className="course-grid">
            {data?.items.map((course, index) => (
              <CourseCard key={course.id} course={course} index={index} />
            ))}
          </div>
        )}
      </section>
      <section className="why-section">
        <div>
          <span className="eyebrow">{t('A THOUGHTFUL WAY TO LEARN')}</span>
          <h2>{copy('whyTitle')}</h2>
          <p>
            {t('You bring your curiosity. ')}
            <br />
            {t('We\u2019ll help you find your footing. ')}
          </p>
          <Link href="/help" className="text-link">
            {t('A little help along the way ')}
            <ArrowRight size={18} />
          </Link>
        </div>
        <div className="why-list">
          {[
            { Icon: Clock3, title: t('whyOne'), text: 'whyOneText' },
            { Icon: Layers3, title: t('whyTwo'), text: 'whyTwoText' },
            { Icon: Download, title: t('whyThree'), text: 'whyThreeText' },
          ].map(({ Icon, title, text }) => (
            <div key={title}>
              <span>
                <Icon size={22} />
              </span>
              <div>
                <h3>{copy(title as 'whyOne')}</h3>
                <p>{copy(text as 'whyOneText')}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
export function Catalog() {
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [subject, setSubject] = useState('');
  const [level, setLevel] = useState('');
  const [language, setLanguage] = useState('');
  const [format, setFormat] = useState('');
  const [page, setPage] = useState(1);
  const params = new URLSearchParams({
    search: query,
    subject,
    level,
    language,
    format,
    page: String(page),
    limit: '12',
  });
  const { data, loading, error, reload } = useData<Page<Course>>(`/courses?${params}`);
  return (
    <>
      <PageHeading
        eyebrow={t('FIND YOUR NEXT POSSIBILITY')}
        title={t('What would you like to learn?')}
        description={t(
          'Start with something that matters to you. We\u2019ll take it one step at a time.',
        )}
      />
      <form
        className="catalog-filters"
        onSubmit={(e) => {
          e.preventDefault();
          setPage(1);
          setQuery(search);
        }}
      >
        <div className="search-field">
          <Search size={20} />
          <label className="sr-only" htmlFor="search">
            {copy('search')}
          </label>
          <input
            id="search"
            type="search"
            placeholder={t('Try digital skills, email, or the web\u2026')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Button type="submit">{t('Search')}</Button>
        </div>
        <div className="filter-row">
          <select
            aria-label={t('Subject')}
            value={subject}
            onChange={(e) => {
              setSubject(e.target.value);
              setPage(1);
            }}
          >
            <option value="">{copy('allSubjects')}</option>
            <option value="Digital skills">{t('Digital skills')}</option>
            <option value="Web development">{t('Web development')}</option>
            <option value="Business">{t('Business')}</option>
          </select>
          <select
            aria-label={t('Level')}
            value={level}
            onChange={(e) => {
              setLevel(e.target.value);
              setPage(1);
            }}
          >
            <option value="">{copy('allLevels')}</option>
            <option value="Beginner">{t('Beginner')}</option>
            <option value="Intermediate">{t('Intermediate')}</option>
          </select>
          <select
            aria-label={t('Course language')}
            value={language}
            onChange={(e) => {
              setLanguage(e.target.value);
              setPage(1);
            }}
          >
            <option value="">{copy('allLanguages')}</option>
            <option value="en">{t('English')}</option>
            <option value="ti">{t('\u1275\u130D\u122D\u129B')}</option>
          </select>
          <select
            aria-label={t('Learning format')}
            value={format}
            onChange={(e) => {
              setFormat(e.target.value);
              setPage(1);
            }}
          >
            <option value="">{copy('allFormats')}</option>
            <option value="Self paced">{t('Self-paced')}</option>
            <option value="Cohort">{t('Cohort')}</option>
          </select>
          <button
            type="button"
            className="text-button"
            onClick={() => {
              setQuery('');
              setSearch('');
              setSubject('');
              setLevel('');
              setLanguage('');
              setFormat('');
              setPage(1);
            }}
          >
            {copy('clearFilters')}
          </button>
        </div>
      </form>
      {loading ? (
        <Loading />
      ) : error ? (
        <>
          <Alert>{error}</Alert>
          <Button onClick={reload}>{copy('retry')}</Button>
        </>
      ) : data?.items.length ? (
        <>
          <div className="results-heading">
            <h2>{t('Find your starting point')}</h2>
            <span>
              {data.total ?? data.items.length}
              {t(' courses to explore')}
            </span>
          </div>
          <div className="course-grid">
            {data.items.map((course, index) => (
              <CourseCard key={course.id} course={course} index={index} />
            ))}
          </div>
          <div className="pagination">
            <Button secondary disabled={page === 1} onClick={() => setPage(page - 1)}>
              {t('Previous page ')}
            </Button>
            <span>
              {t('Page ')}
              {page}
            </span>
            <Button
              secondary
              disabled={page * 12 >= (data.total ?? 0)}
              onClick={() => setPage(page + 1)}
            >
              {t('Next page ')}
            </Button>
          </div>
        </>
      ) : (
        <Empty title={copy('noResults')} description={copy('noResultsText')} />
      )}
    </>
  );
}
export function CourseDetails({ id }: { id: string }) {
  const { user } = useApp();
  const { data: course, loading, error } = useData<Course>(`/courses/${id}`);
  const [busy, setBusy] = useState(false);
  const [enrolled, setEnrolled] = useState(false);
  const [enrollError, setEnrollError] = useState('');
  async function enroll() {
    setBusy(true);
    setEnrollError('');
    try {
      await api('/enrollments', 'POST', { courseId: id });
      setEnrolled(true);
    } catch (e) {
      setEnrollError(message(e));
    } finally {
      setBusy(false);
    }
  }
  if (loading) return <Loading />;
  if (error || !course) return <Alert>{error || t('This course is unavailable.')}</Alert>;
  const version = course.version;
  return (
    <>
      <Link href="/courses" className="back-link">
        {t('\u2190 Explore courses ')}
      </Link>
      <div className="detail-layout">
        <div>
          <div className="detail-hero">
            <div className="inline-meta">
              <Badge>{course.subject}</Badge>
              <span>{course.level}</span>
            </div>
            <h1>{course.title}</h1>
            <p className="lede">{course.summary}</p>
            <div className="instructor-identity">
              <span className="avatar">{course.instructorName?.slice(0, 1) || 'P'}</span>
              <div>
                <span>{t('Your instructor')}</span>
                <strong>{course.instructorName || t('Pathway educator')}</strong>
              </div>
            </div>
          </div>
          <section className="panel">
            <h2>{copy('outcomes')}</h2>
            <ul className="check-list">
              {version?.outcomes?.map((outcome) => (
                <li key={outcome}>
                  <CheckCircle2 size={19} />
                  <span>{outcome}</span>
                </li>
              ))}
            </ul>
          </section>
          <section className="panel">
            <h2>{copy('courseDetails')}</h2>
            <TextContent text={version?.description || course.summary} />
            <h3>{copy('prerequisites')}</h3>
            {version?.prerequisites?.length ? (
              <ul>
                {version.prerequisites.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            ) : (
              <p>{t('Bring your curiosity. No previous experience is required.')}</p>
            )}
            <h3>{copy('courseRules')}</h3>
            <p>
              {typeof version?.completionRule === 'string'
                ? version.completionRule
                : t(
                    'Complete the required lessons, pass the practice activities, and submit the practical assignment for review.',
                  )}
            </p>
          </section>
          <section className="panel">
            <h2>{t('One step at a time')}</h2>
            <div className="module-list">
              {version?.modules.map((module, index) => (
                <details key={module.id} open={index === 0}>
                  <summary>
                    <span className="module-number">{String(index + 1).padStart(2, '0')}</span>
                    <span>{module.title}</span>
                    <small>
                      {module.activities.length}
                      {t(' activities')}
                    </small>
                  </summary>
                  <ul>
                    {module.activities.map((activity) => (
                      <li key={activity.id}>
                        <BookOpen size={16} />
                        <span>{activity.title}</span>
                        <small>{activity.kind.toLowerCase()}</small>
                      </li>
                    ))}
                  </ul>
                </details>
              ))}
            </div>
          </section>
        </div>
        <aside className="enroll-panel">
          <CourseArt />
          <div className="enroll-content">
            <div className="price">
              {t('Free')}
              <span>{t('A little investment in yourself.')}</span>
            </div>
            {enrollError ? <Alert>{enrollError}</Alert> : null}
            {enrolled ? (
              <>
                <Alert success>{copy('enrolled')}</Alert>
                <LinkButton href={`/learn/${id}`}>{t('Start learning')}</LinkButton>
              </>
            ) : user ? (
              <Button busy={busy} onClick={() => void enroll()}>
                {copy('join')}
                <ArrowRight size={18} />
              </Button>
            ) : (
              <LinkButton href={`/login?next=${encodeURIComponent(`/courses/${id}`)}`}>
                {t('Sign in to join ')}
              </LinkButton>
            )}
            <ul className="course-facts">
              <li>
                <Clock3 size={19} />
                {course.effortMinutes}
                {t(' minutes of focused learning ')}
              </li>
              <li>
                <Layers3 size={19} />
                {version?.modules.length || 0}
                {t(' manageable modules ')}
              </li>
              <li>
                <Globe2 size={19} />
                {course.language === 'ti' ? t('\u1275\u130D\u122D\u129B') : t('English')}
                {t(' course content ')}
              </li>
              <li>
                <Download size={19} />
                {t('Text lessons available offline ')}
              </li>
              <li>
                <UserRound size={19} />
                {t('Instructor feedback on your work ')}
              </li>
            </ul>
            <p className="enroll-note">
              <ShieldCheck size={15} />
              {t('Your progress, privately saved. ')}
            </p>
          </div>
        </aside>
      </div>
    </>
  );
}
