/* global document, location, URLSearchParams, Blob, setTimeout, clearTimeout, window */
import { copy } from './messages.js';
import { snapshot, completeLesson } from './store.js';

const status = document.getElementById('status');
const privateContent = document.getElementById('private-content');
const list = document.getElementById('lessons');
const reader = document.getElementById('reader');
const pending = document.getElementById('pending');
let expiryTimer;
let activeLesson = new URLSearchParams(location.hash.slice(1)).get('lesson');
if (!activeLesson && location.pathname.startsWith('/lesson/'))
  activeLesson = location.pathname.split('/')[2];

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined && text !== null) node.textContent = String(text);
  if (className) node.className = className;
  return node;
}
function button(text, action) {
  const node = element('button', text);
  node.type = 'button';
  node.addEventListener('click', action);
  return node;
}
function clearPrivate(error) {
  clearTimeout(expiryTimer);
  privateContent.hidden = true;
  reader.replaceChildren();
  list.replaceChildren();
  pending.textContent = '';
  status.textContent = error instanceof Error ? error.message : copy.storageError;
}
function textSection(title, text) {
  if (typeof text !== 'string' || !text.trim()) return;
  const section = element('section');
  section.append(element('h3', title), element('p', text, 'reading'));
  reader.append(section);
}
async function downloadResource(activityId, index) {
  try {
    // Recheck expiry and the account before creating a file from private content.
    const state = await snapshot();
    const resource = state.lessons.find((lesson) => lesson.activity.id === activityId)?.activity
      .resources?.[index];
    if (!resource?.offlineAllowed || !resource.accessible || typeof resource.text !== 'string')
      throw new Error(copy.expired);
    const url = URL.createObjectURL(
      new Blob([resource.text], { type: 'text/plain;charset=utf-8' }),
    );
    const link = element('a');
    link.href = url;
    link.download = `${
      String(resource.title)
        .replace(/[^\p{L}\p{N} ._-]/gu, '')
        .slice(0, 100) || 'resource'
    }.txt`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (error) {
    clearPrivate(error);
  }
}
function showLesson(lesson, events) {
  const activity = lesson.activity;
  reader.replaceChildren();
  reader.hidden = false;
  const title = element('h2', activity.title);
  title.id = 'lesson-title';
  title.tabIndex = -1;
  reader.append(
    button(copy.back, () => {
      activeLesson = null;
      location.hash = '';
      void render();
    }),
    element('p', activity.courseTitle, 'eyebrow'),
    title,
  );
  textSection(copy.objective, activity.objective);
  textSection(copy.reading, activity.body);
  textSection(copy.example, activity.example);
  textSection(copy.reflection, activity.reflection);
  textSection(copy.transcript, activity.transcript);
  if (activity.videoUrl) reader.append(element('p', copy.video, 'notice'));
  const resources = element('section');
  resources.append(element('h3', copy.resources));
  for (const [index, resource] of (activity.resources || []).entries()) {
    if (!resource.offlineAllowed || !resource.accessible || typeof resource.text !== 'string')
      continue;
    const details = element('details');
    details.append(
      element('summary', resource.title),
      element('p', resource.text, 'reading'),
      button(copy.download, () => void downloadResource(activity.id, index)),
    );
    resources.append(details);
  }
  if (resources.children.length > 1) reader.append(resources);
  const queued = events.some(
    (event) => event.activityId === activity.id && event.state === 'COMPLETED',
  );
  const completed = ['COMPLETED', 'PASSED'].includes(activity.completion);
  const feedback = element('p', queued ? copy.queued : completed ? copy.completed : '', 'notice');
  feedback.setAttribute('role', 'status');
  const finish = button(copy.complete, async () => {
    finish.disabled = true;
    finish.textContent = copy.completing;
    try {
      await completeLesson(activity.id);
      await render();
    } catch (error) {
      clearPrivate(error);
    }
  });
  finish.disabled = queued || completed;
  reader.append(feedback, finish);
}
async function render(focus = false) {
  try {
    const state = await snapshot();
    clearTimeout(expiryTimer);
    const nextExpiry = Math.min(
      state.expiresAt,
      ...state.lessons.map((lesson) => new Date(lesson.expiresAt).getTime()),
    );
    expiryTimer = setTimeout(() => void render(), Math.max(1, nextExpiry - Date.now()));
    privateContent.hidden = false;
    pending.textContent = copy.progress(state.events.length);
    list.replaceChildren();
    status.textContent = state.lessons.length ? copy.ready : copy.empty;
    for (const lesson of state.lessons) {
      const card = element('article', null, 'lesson-card');
      const open = button(lesson.activity.title, () => {
        activeLesson = lesson.activity.id;
        location.hash = new URLSearchParams({ lesson: activeLesson }).toString();
        void render(true);
      });
      card.append(
        element('p', lesson.activity.courseTitle, 'eyebrow'),
        open,
        element(
          'p',
          copy.metadata(
            (Number(lesson.bytes || 0) / 1024).toFixed(1),
            new Date(lesson.expiresAt).toLocaleString(),
          ),
          'metadata',
        ),
      );
      list.append(card);
    }
    const selected = state.lessons.find((lesson) => lesson.activity.id === activeLesson);
    if (selected) {
      showLesson(selected, state.events);
      if (focus) document.getElementById('lesson-title').focus();
    } else {
      reader.hidden = true;
      reader.replaceChildren();
      if (activeLesson) status.textContent = copy.expired;
    }
  } catch (error) {
    clearPrivate(error);
  }
}
window.addEventListener('hashchange', () => {
  activeLesson = new URLSearchParams(location.hash.slice(1)).get('lesson');
  void render();
});
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) void render();
});
void render();
