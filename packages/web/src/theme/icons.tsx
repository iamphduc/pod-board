export type IconName = 'plus' | 'more' | 'check' | 'chevron-right' | 'chevron-down' | 'arrow-up' | 'folder' | 'close'

export const ICON_NAMES: readonly IconName[] = []

export function Icon(_: { name: IconName }) {
  return <svg />
}
