'use client';
import { t } from '@/lib/i18n';
import { useEffect, useState } from 'react';
import { message } from '@/lib/api';
import { learningApi } from '@/lib/learning-api';
import { readLesson } from '@/lib/offline';
import type { Activity, ActivitySummary } from '@/lib/types';
import { useApp } from './application';
export function activityHref(activity: Pick<ActivitySummary, 'id' | 'kind'>) {
  return `/${activity.kind === 'PRACTICE' || activity.kind === 'QUIZ' ? 'practice' : activity.kind === 'ASSIGNMENT' ? 'assignment' : 'lesson'}/${activity.id}`;
}
export function useActivity(id: string) {
  const { user, online } = useApp();
  const [data, setData] = useState<Activity | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    (online
      ? learningApi.activity(id)
      : user
        ? readLesson(user.id, id).then((value) => {
            if (!value)
              throw new Error(
                t(
                  'This lesson is not available offline, or its download expired. Connect to refresh your access.',
                ),
              );
            return value;
          })
        : Promise.reject(new Error(t('Sign in to open this lesson.')))
    )
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
    };
  }, [id, online, user?.id]);
  return { data, error, loading };
}
export function neighborHref(activity: Activity, id: string) {
  const next = activity.outline.flatMap((m) => m.activities).find((a) => a.id === id);
  return next ? activityHref(next) : `/lesson/${id}`;
}
export function nextHref(activity: Activity) {
  return neighborHref(activity, activity.nextId || '');
}
