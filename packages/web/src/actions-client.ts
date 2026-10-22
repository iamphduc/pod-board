export type ActionReply<T> = { ok: true; data: T } | { ok: false; status: number; message: string }

export type ActionDeps = { fetch?: typeof fetch; token?: () => string | null | undefined }

export async function postAction<T>(_path: string, _body: object, _deps: ActionDeps = {}): Promise<ActionReply<T>> {
  return { ok: false, status: -1, message: '' }
}
