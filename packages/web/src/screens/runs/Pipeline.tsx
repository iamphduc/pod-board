import { Fragment, useState } from 'react'
import type { Pipeline as PipelineModel, StepState } from '@pod-board/model'
import { MergeConfirm, mergeButtonId, useMergeFlow } from './MergeConfirm.tsx'
import { isOpenFor } from './merge-flow.ts'

const STATE_WORDS: Record<StepState, string> = {
  done: 'done',
  live: 'running',
  wait: 'waiting',
  you: 'needs you',
  blocked: 'blocked',
  unknown: 'unknown',
}

type Props = {
  pipeline: Pick<PipelineModel, 'stages'>
  /** The repo the pipeline belongs to; with it, a step with a PR waiting on you gets a Merge button. */
  repoId?: string
}

export function Pipeline({ pipeline, repoId }: Props) {
  const [merge, flow] = useMergeFlow()
  // The step's name, kept from when it opened: after a merge the step no longer carries `merge`.
  const [label, setLabel] = useState('')
  const busy = merge.kind === 'merging'
  return (
    <>
      <div className="pipe-frame" role="region" aria-label="Pipeline" tabIndex={0}>
        <ol className="pipe">
          {pipeline.stages.map((stage, i) => (
            <Fragment key={stage.key}>
              {i > 0 && (
                <li className="arrow" aria-hidden="true">
                  →
                </li>
              )}
              <li className="stage">
                <span className="cap">{stage.caption}</span>
                {stage.steps.map((step) => {
                  const pr = repoId === undefined ? undefined : step.merge?.number
                  const open = pr !== undefined && repoId !== undefined && isOpenFor(merge, repoId, pr)
                  return (
                    <div key={step.key} className={`step ${step.state}`} data-open={open ? 'true' : undefined}>
                      <b>
                        {step.label}
                        <span className="sr-only"> ({STATE_WORDS[step.state]})</span>
                      </b>
                      <span className="mono">{step.detail}</span>
                      {pr !== undefined && repoId !== undefined && (
                        <button
                          id={mergeButtonId(pr)}
                          className="btn step-merge"
                          type="button"
                          aria-expanded={open}
                          disabled={busy}
                          onClick={() => {
                            setLabel(`${stage.caption} · ${step.label}`)
                            flow.open({ repoId, number: pr })
                          }}
                        >
                          Merge
                        </button>
                      )}
                    </div>
                  )
                })}
              </li>
            </Fragment>
          ))}
        </ol>
      </div>
      {repoId !== undefined && merge.kind !== 'idle' && merge.target.repoId === repoId && <MergeConfirm state={merge} flow={flow} label={label} />}
    </>
  )
}
