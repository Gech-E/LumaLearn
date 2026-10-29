'use client';
import { t, copy } from '@/lib/i18n';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { usePathname, useRouter } from 'next/navigation';
import { createContext, useContext, useEffect, useState } from 'react';
import {
  ArrowUpRight,
  Bell,
  BookOpen,
  ChevronDown,
  Download,
  GraduationCap,
  House,
  LifeBuoy,
  LogOut,
  Settings2,
  ShieldCheck,
  Sprout,
  WifiOff,
} from 'lucide-react';
import { api, ApiError, setCsrf, getSession } from '@/lib/api';
import { brand } from '@/lib/brand';
import { clearPrivateData, offlineAccount, rememberAccount, syncProgress } from '@/lib/offline';
import type { User } from '@/lib/types';
import { Loading, Alert, LinkButton } from './ui';
import { Landing, Catalog, CourseDetails } from './discovery';
import { AuthPage, JoinInvitation } from './identity';
import { LearnerHome, CourseOverview, Lesson, Practice, Assignment } from './learning';
const AccountPage = dynamic(() => import('./account').then((m) => m.AccountPage), {
  loading: Loading,
});
const Instructor = dynamic(() => import('./instructor').then((m) => m.Instructor), {
  loading: Loading,
});
const Admin = dynamic(() => import('./admin').then((m) => m.Admin), { loading: Loading });
interface AppContext {
  user: User | null;
  mfaRequired: boolean;
  online: boolean;
  refresh: () => Promise<void>;
}
const Context = createContext<AppContext>({
  user: null,
  mfaRequired: false,
  online: true,
  refresh: async () => {},
});
export function useApp() {
  return useContext(Context);
}
export function Logo() {
  return (
    <Link href="/" className="logo" aria-label={t('{value0} home', { value0: brand.name })}>
      <span className="logo-mark">
        <Sprout size={25} strokeWidth={2.1} />
      </span>
      {brand.name}
      <span className="logo-dot">.</span>
    </Link>
  );
}
export function Application() {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [mfaRequired, setMfaRequired] = useState(false);
  const [ready, setReady] = useState(false);
  const [online, setOnline] = useState(true);
  const [menu, setMenu] = useState(false);
  const [signoutError, setSignoutError] = useState('');
  async function refresh() {
    try {
      const session = await getSession();
      document.documentElement.dataset.interfaceLocale = session.user.locale || 'en';
      setCsrf(session.csrfToken);
      setUser(session.user);
      setMfaRequired(session.mfaRequired);
      await rememberAccount(session.user);
    } catch (error) {
      setMfaRequired(false);
      if (error instanceof ApiError && [401, 403].includes(error.status)) {
        setUser(null);
        setCsrf('');
        await clearPrivateData();
      } else if (!navigator.onLine) setUser(await offlineAccount());
      else {
        setUser(null);
        setCsrf('');
      }
    } finally {
      setReady(true);
    }
  }
  useEffect(() => {
    void refresh();
    setOnline(navigator.onLine);
    const update = () => {
      setOnline(navigator.onLine);
      if (navigator.onLine) void refresh();
    };
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    if ('serviceWorker' in navigator)
      void navigator.serviceWorker.register('/sw.js').catch(() => {});
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  useEffect(() => {
    if (user && online)
      void syncProgress(user.id).catch(() => {
        setSignoutError(
          t('Some saved progress could not sync. Open Downloads to retry and review the response.'),
        );
      });
  }, [user, online]);
  useEffect(() => {
    setMenu(false);
    document.title = `${brand.name} · ${pathname === '/' ? t('Your next chapter') : pathname.split('/')[1].replaceAll('-', ' ')}`;
  }, [pathname]);
  async function logout() {
    setSignoutError('');
    try {
      if (!online) throw new Error(t('Reconnect to revoke your session before signing out.'));
      await api('/auth/logout', 'POST', {});
      await clearPrivateData();
      setUser(null);
      setCsrf('');
      router.push('/login');
    } catch {
      setSignoutError(
        t(
          'Reconnect to sign out securely. Your private downloads remain on this device until sign out completes.',
        ),
      );
    }
  }
  const isPublic = !user;
  const primary = [
    { href: '/home', label: copy('home'), Icon: House },
    { href: '/my-learning', label: copy('learning'), Icon: BookOpen },
    { href: '/help', label: copy('help'), Icon: LifeBuoy },
  ];
  return (
    <Context.Provider value={{ user, mfaRequired, online, refresh }}>
      <a className="skip-link" href="#main-content">
        {t('Skip to content ')}
      </a>
      {user ? (
        <aside className="sidebar">
          <Logo />
          <div className="workspace-label">{t('YOUR LEARNING SPACE')}</div>
          <nav aria-label={t('Main navigation')}>
            {primary.map(({ href, label, Icon }) => (
              <Link
                key={href}
                href={href}
                aria-current={pathname === href ? 'page' : undefined}
                className={pathname === href ? 'active' : ''}
              >
                <Icon size={20} />
                {label}
                {pathname === href ? <span className="nav-dot" /> : null}
              </Link>
            ))}
          </nav>
          <div className="sidebar-explore">
            <span className="small-icon">
              <Sprout size={21} />
            </span>
            <h3>{t('A new possibility?')}</h3>
            <p>{t('A little curiosity can take you somewhere new.')}</p>
            <Link href="/courses">
              {copy('explore')}
              <ArrowUpRight size={16} />
            </Link>
          </div>
          {user.roles.some((r) => ['INSTRUCTOR', 'ADMIN'].includes(r)) ? (
            <Link className="workspace-link" href="/instructor">
              <GraduationCap size={18} />
              {copy('instructor')}
            </Link>
          ) : null}
          {user.roles.some((r) => ['ORG_ADMIN', 'ADMIN', 'SUPPORT'].includes(r)) ? (
            <Link className="workspace-link" href="/admin">
              <ShieldCheck size={18} />
              {copy('admin')}
            </Link>
          ) : null}
          <div className="sidebar-bottom">
            <p>{brand.tagline}</p>
            <span>{t('Made for your own pace.')}</span>
          </div>
        </aside>
      ) : null}
      <div className={user ? 'app-layout' : 'public-layout'}>
        <header className="topbar">
          {!user ? (
            <Logo />
          ) : (
            <div className="topbar-breadcrumb">
              {t('Your space to grow')}
              <span>/</span>
              <strong>
                {pathname.startsWith('/instructor')
                  ? t('Teach')
                  : pathname.startsWith('/admin')
                    ? t('Manage')
                    : t('Learn')}
              </strong>
            </div>
          )}
          {!user ? (
            <nav className="public-nav" aria-label={t('Main navigation')}>
              <Link href="/courses">{t('Explore courses')}</Link>
              <Link href="/help">{t('How we can help')}</Link>
            </nav>
          ) : null}
          <div className="topbar-actions">
            {user ? (
              <>
                <span className={`connection ${online ? '' : 'is-offline'}`}>
                  {online ? <span className="status-dot" /> : <WifiOff size={14} />}
                  <span>{online ? t('You\u2019re connected') : t('Offline mode')}</span>
                </span>
                <Link
                  className="icon-button"
                  href="/notifications"
                  aria-label={copy('notifications')}
                >
                  <Bell size={20} />
                </Link>
                <div className="account-menu">
                  <button
                    className="account-toggle"
                    aria-label={t('Account menu for {value0}', { value0: user.name })}
                    onClick={() => setMenu(!menu)}
                    aria-expanded={menu}
                    aria-controls="account-options"
                  >
                    <span className="avatar">{user.name.slice(0, 1).toUpperCase()}</span>
                    <span className="account-name">{user.name.split(' ')[0]}</span>
                    <ChevronDown size={15} />
                  </button>
                  {menu ? (
                    <div className="dropdown" id="account-options">
                      <p>{user.email}</p>
                      <Link href="/profile">
                        <Settings2 size={17} />
                        {copy('preferences')}
                      </Link>
                      <Link href="/downloads">
                        <Download size={17} />
                        {copy('downloads')}
                      </Link>
                      <button onClick={() => void logout()}>
                        <LogOut size={17} />
                        {copy('signOut')}
                      </button>
                    </div>
                  ) : null}
                </div>
              </>
            ) : (
              <Link className="button compact" href="/login">
                {copy('signIn')}
                <ArrowUpRight size={16} />
              </Link>
            )}
          </div>
        </header>
        {!online ? (
          <div className="offline-bar" role="status">
            <WifiOff size={16} />
            {copy('offline')}
            <Link href="/downloads">{t('Open downloads')}</Link>
          </div>
        ) : null}
        {signoutError ? <Alert>{signoutError}</Alert> : null}
        <main
          id="main-content"
          className={isPublic && pathname === '/' ? 'landing-main' : 'main-content'}
        >
          {!ready ? <Loading /> : <Route path={pathname} user={user} />}
        </main>
        {!user ? (
          <footer className="public-footer">
            <Logo />
            <p>{brand.tagline}</p>
            <Link href="/help">{t('Help & support')}</Link>
            <span>{t('Thoughtful learning. One step at a time.')}</span>
          </footer>
        ) : null}
      </div>
      {user ? (
        <nav className="mobile-nav" aria-label={t('Mobile navigation')}>
          {primary.map(({ href, label, Icon }) => (
            <Link key={href} href={href} aria-current={pathname === href ? 'page' : undefined}>
              <Icon size={21} />
              <span>{label}</span>
            </Link>
          ))}
        </nav>
      ) : null}
    </Context.Provider>
  );
}
function Route({ path, user }: { path: string; user: User | null }) {
  const parts = path.split('/').filter(Boolean);
  if (['login', 'register', 'recover', 'reset', 'reset-password', 'verify'].includes(parts[0]))
    return <AuthPage mode={parts[0]} />;
  if (path === '/' && !user) return <Landing />;
  if (path === '/courses') return <Catalog />;
  if (parts[0] === 'courses' && parts[1]) return <CourseDetails id={parts[1]} />;
  if (path === '/join') return <JoinInvitation />;
  if (path === '/help') return <AccountPage section="help" />;
  if (!user)
    return (
      <div className="auth-required">
        <h1>{t('Your learning is waiting.')}</h1>
        <p>{t('Sign in to continue this part of your journey.')}</p>
        <LinkButton
          href={`/login?next=${encodeURIComponent(path + (typeof window !== 'undefined' ? window.location.search : ''))}`}
        >
          {copy('signIn')}
        </LinkButton>
      </div>
    );
  if (path === '/' || path === '/home') return <LearnerHome />;
  if (path === '/my-learning') return <LearnerHome all />;
  if (parts[0] === 'learn' && parts[1]) return <CourseOverview key={parts[1]} id={parts[1]} />;
  if (parts[0] === 'lesson' && parts[1]) return <Lesson key={parts[1]} id={parts[1]} />;
  if (parts[0] === 'practice' && parts[1]) return <Practice key={parts[1]} id={parts[1]} />;
  if (parts[0] === 'assignment' && parts[1]) return <Assignment key={parts[1]} id={parts[1]} />;
  if (['profile', 'downloads', 'notifications', 'offline'].includes(parts[0]))
    return <AccountPage section={parts[0] === 'offline' ? 'downloads' : parts[0]} />;
  if (parts[0] === 'instructor') return <Instructor path={parts.slice(1)} />;
  if (parts[0] === 'admin') return <Admin path={parts.slice(1)} />;
  return (
    <div className="empty">
      <h1>{t('This path isn\u2019t here.')}</h1>
      <p>{t('Let\u2019s get you back to your learning.')}</p>
      <LinkButton href="/home">{copy('home')}</LinkButton>
    </div>
  );
}
