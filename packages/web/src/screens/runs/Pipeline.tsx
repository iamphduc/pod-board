import { Fragment } from 'react'
import type { Pipeline as PipelineModel, StepState } from '@pod-board/model'

const STATE_WORDS: Record<StepState, string> = {
  done: 'done',
  live: 'running',
  wait: 'waiting',
  you: 'needs you',
  blocked: 'blocked',
  unknown: 'unknown',
}

export function Pipeline({ pipeline }: { pipeline: Pick<PipelineModel, 'stages'> }) {
  return (
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
              {stage.steps.map((step) => (
                <div key={step.key} className={`step ${step.state}`}>
                  <b>
                    {step.label}
                    <span className="sr-only"> ({STATE_WORDS[step.state]})</span>
                  </b>
                  <span className="mono">{step.detail}</span>
                </div>
              ))}
            </li>
          </Fragment>
        ))}
      </ol>
    </div>
  )
}
