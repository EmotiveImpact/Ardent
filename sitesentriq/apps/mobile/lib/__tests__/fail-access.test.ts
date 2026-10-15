import { describe, expect, it } from 'vitest'
import { composeFailAccessNote, buildFailAccessArgs } from '../fail-access'

describe('composeFailAccessNote', () => {
  it('humanises the reason slug', () => {
    expect(composeFailAccessNote({ reason: 'no_answer' })).toBe('Failed access — no answer')
  })

  it('appends trimmed extra notes after a colon', () => {
    expect(composeFailAccessNote({ reason: 'no_answer', notes: '  rang twice  ' })).toBe(
      'Failed access — no answer: rang twice',
    )
  })

  it('ignores empty/whitespace-only notes', () => {
    expect(composeFailAccessNote({ reason: 'locked_gate', notes: '   ' })).toBe(
      'Failed access — locked gate',
    )
    expect(composeFailAccessNote({ reason: 'locked_gate', notes: null })).toBe(
      'Failed access — locked gate',
    )
  })
})

describe('buildFailAccessArgs', () => {
  it('maps to the record_failed_access named parameters', () => {
    expect(
      buildFailAccessArgs({ jobId: 'j1', noteId: 'n1', note: 'Failed access — no answer', userName: 'Eng' }),
    ).toEqual({
      p_job_id: 'j1',
      p_note_id: 'n1',
      p_note_content: 'Failed access — no answer',
      p_user_name: 'Eng',
    })
  })
})
