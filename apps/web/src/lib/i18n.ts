import { en, type CopyKey } from '@/locales/en';
import { ti } from '@/locales/ti';
import { sourceEnglish, type SourceKey } from '@/locales/source-en';
import { sourceTigrinya } from '@/locales/source-ti';
function interfaceLocale() {
  return typeof document === 'undefined'
    ? 'en'
    : document.documentElement.dataset.interfaceLocale || 'en';
}
export function copy(key: CopyKey, locale = interfaceLocale()): string {
  return locale === 'ti' ? (ti[key] ?? en[key]) : en[key];
}
/** English source keys remain readable in components; approved translations belong in locale files. */
export function t(
  key: SourceKey,
  parameters: Record<string, unknown> = {},
  locale = interfaceLocale(),
): string {
  const value = locale === 'ti' ? (sourceTigrinya[key] ?? sourceEnglish[key]) : sourceEnglish[key];
  return value.replace(/\{(\w+)\}/g, (placeholder, name: string) =>
    Object.hasOwn(parameters, name) ? String(parameters[name] ?? '') : placeholder,
  );
}
export function date(value: string, locale = 'en', timezone = 'Africa/Nairobi') {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: timezone }).format(
    new Date(value),
  );
}
