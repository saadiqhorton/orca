import { describe, expect, it } from 'vitest'
import { WorkerDispatchParams as ControlDispatchParams } from './orchestration-worker-control-params'
import { WorkerDispatchParams as StopDispatchParams } from './orchestration-worker-stop-params'
import { WorkerDispatchParams as ReleaseDispatchParams } from './orchestration-worker-release-schemas-params'
import { ApprovalAnswerParams } from './orchestration-approval-answer-params'

describe('dispatch-scoped RPC params', () => {
  it('accepts a bare ctx_ id and a dispatch: mailbox spelling', () => {
    for (const schema of [ControlDispatchParams, StopDispatchParams, ReleaseDispatchParams]) {
      expect(schema.parse({ dispatch: 'ctx_793e1b7ab138' })).toEqual({
        dispatch: 'ctx_793e1b7ab138'
      })
      expect(schema.parse({ dispatch: 'dispatch:ctx_793e1b7ab138' })).toEqual({
        dispatch: 'ctx_793e1b7ab138'
      })
    }
  })

  it('strips the mailbox prefix on approval answers', () => {
    expect(
      ApprovalAnswerParams.parse({
        dispatch: 'dispatch:ctx_home',
        prompt: 'apr_1',
        decision: 'allow'
      })
    ).toMatchObject({ dispatch: 'ctx_home' })
  })
})
