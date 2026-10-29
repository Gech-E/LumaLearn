import type { components } from '@pathway/api-client';
import { client, unwrap } from './api';

type Schema = components['schemas'];
/** Request and response types come from the server OpenAPI contract. */
export const learningApi = {
  async activity(id: string) {
    return unwrap(
      await client.GET('/api/v1/learning/activities/{id}', { params: { path: { id } } }),
    );
  },
  async download(id: string) {
    return unwrap(
      await client.GET('/api/v1/learning/activities/{id}/download', { params: { path: { id } } }),
    );
  },
  async progress(body: Schema['ProgressDto']) {
    return unwrap(await client.POST('/api/v1/learning/progress', { body }));
  },
  async enroll(body: Schema['EnrollDto']) {
    return unwrap(await client.POST('/api/v1/enrollments', { body }));
  },
  async startAttempt(activityId: string) {
    return unwrap(
      await client.POST('/api/v1/assessments/{activityId}/attempts', {
        params: { path: { activityId } },
      }),
    );
  },
  async submitAttempt(id: string, body: Schema['AttemptSubmitDto']) {
    return unwrap(
      await client.POST('/api/v1/assessments/attempts/{id}/submit', {
        params: { path: { id } },
        body,
      }),
    );
  },
  async submission(activityId: string) {
    return unwrap(
      await client.GET('/api/v1/submissions/{activityId}', { params: { path: { activityId } } }),
    );
  },
  async saveDraft(activityId: string, body: Schema['DraftDto']) {
    return unwrap(
      await client.PUT('/api/v1/submissions/{activityId}', {
        params: { path: { activityId } },
        body,
      }),
    );
  },
  async submitAssignment(activityId: string, body: Schema['SubmitDto']) {
    return unwrap(
      await client.POST('/api/v1/submissions/{activityId}/submit', {
        params: { path: { activityId } },
        body,
      }),
    );
  },
  async file(id: string) {
    return unwrap(await client.GET('/api/v1/media/{id}', { params: { path: { id } } }));
  },
  async fileDownload(id: string) {
    return unwrap(await client.GET('/api/v1/media/{id}/download', { params: { path: { id } } }));
  },
};
