import { getGoogleToken } from '@/store/auth.store'
import { TokenExpiredError } from './google-calendar.service'

export interface GTask {
  id: string
  title: string
  notes?: string
  due?: string
  status: 'needsAction' | 'completed'
  source: 'google'
}

export interface GTaskList {
  id: string
  title: string
}

async function gFetch(url: string, options?: RequestInit): Promise<Response> {
  const token = getGoogleToken()
  if (!token) throw new TokenExpiredError()
  const res = await fetch(url, {
    ...options,
    headers: { ...options?.headers, Authorization: `Bearer ${token}` },
  })
  if (res.status === 401 || res.status === 403) throw new TokenExpiredError()
  return res
}

export async function getTaskLists(): Promise<GTaskList[]> {
  const res  = await gFetch('https://tasks.googleapis.com/tasks/v1/users/@me/lists?maxResults=20')
  const data = await res.json() as { items?: { id: string; title: string }[] }
  return (data.items ?? []).map(l => ({ id: l.id, title: l.title }))
}

export async function getTasks(taskListId = '@default'): Promise<GTask[]> {
  const params = new URLSearchParams({ showCompleted: 'false', maxResults: '50' })
  const res  = await gFetch(`https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(taskListId)}/tasks?${params}`)
  const data = await res.json() as { items?: Record<string, unknown>[] }
  return (data.items ?? []).map(t => ({
    id:     String(t.id ?? ''),
    title:  String(t.title ?? ''),
    notes:  t.notes ? String(t.notes) : undefined,
    due:    t.due   ? String(t.due)   : undefined,
    status: (t.status as GTask['status']) ?? 'needsAction',
    source: 'google',
  }))
}

export async function createTask(
  title: string,
  due?: string,
  notes?: string,
  taskListId = '@default',
): Promise<GTask> {
  const res = await gFetch(
    `https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(taskListId)}/tasks`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, notes, due }),
    },
  )
  const data = await res.json() as Record<string, unknown>
  return {
    id:     String(data.id ?? ''),
    title:  String(data.title ?? ''),
    notes:  data.notes ? String(data.notes) : undefined,
    due:    data.due   ? String(data.due)   : undefined,
    status: 'needsAction',
    source: 'google',
  }
}

export async function completeTask(taskId: string, taskListId = '@default'): Promise<void> {
  await gFetch(
    `https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(taskListId)}/tasks/${encodeURIComponent(taskId)}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'completed' }),
    },
  )
}

export async function deleteTask(taskId: string, taskListId = '@default'): Promise<void> {
  await gFetch(
    `https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(taskListId)}/tasks/${encodeURIComponent(taskId)}`,
    { method: 'DELETE' },
  )
}
