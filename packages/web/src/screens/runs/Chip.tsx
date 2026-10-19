import type { Chip as ChipView } from './view.ts'

export function Chip({ chip }: { chip: ChipView }) {
  return <span className={`chip ${chip.cls}`}>{chip.label}</span>
}
