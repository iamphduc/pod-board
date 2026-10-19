export type AddResult = { status: number; error?: string }
export type AddRepoState = { input: string; sending: boolean; error?: string }
export const errorSentence = (_r: AddResult) => ''
export const postRepo = async (_p: string, _f: typeof fetch): Promise<AddResult> => ({ status: 0 })
export function createAddRepoForm(_send: (p: string) => Promise<AddResult>, _onChange: (s: AddRepoState) => void) {
  return { state: (): AddRepoState => ({ input: '', sending: false }), setInput(_v: string) {}, async submit() {}, escape() {} }
}
