// The grant against what the calls need.
//
// One 401 from `/rest/api/3/field` cost an afternoon. It read on screen as an
// expired Jira connection because Atlassian answers a token short of a scope
// with 401 rather than 403. This file is what makes the next one a failing test.

import { describe, expect, it } from 'vitest'

import {
  CONSENT_SCOPES,
  ENDPOINT_SCOPES,
  JIRA_SCOPES,
  missingScopes,
  spareScopes,
} from '../jira-scopes'

describe('the Jira grant', () => {
  it('covers every scope every call needs', () => {
    // Named in the message so a failure says which scope to add in the console.
    expect(missingScopes()).toEqual([])
  })

  it('asks for a scope per endpoint rather than per name', () => {
    // `/rest/api/3/field` is the one that proved the point. Three of its five
    // scopes are named after a project rather than after a field.
    expect(ENDPOINT_SCOPES['GET /rest/api/3/field']).toContain('read:project:jira')
    expect(JIRA_SCOPES).toContain('read:project:jira')
  })

  it('grants no write scope', () => {
    expect(JIRA_SCOPES.filter((scope) => scope.startsWith('write:'))).toEqual([])
    expect(JIRA_SCOPES.filter((scope) => scope.startsWith('delete:'))).toEqual([])
  })

  it('holds every scope once', () => {
    expect(new Set(JIRA_SCOPES).size).toBe(JIRA_SCOPES.length)
  })

  it('asks for the refresh token as well as the scopes', () => {
    // Without it the consent buys an hour. It is not a Jira scope so it belongs
    // in the authorize URL and not in the grant.
    expect(CONSENT_SCOPES).toContain('offline_access')
    expect(JIRA_SCOPES).not.toContain('offline_access')
  })

  it('names the scopes nothing calls for', () => {
    // Granted rather than needed. They read a single issue by key and no call
    // does that today. Listed so dropping them is a decision and not a guess.
    expect(spareScopes()).toEqual([
      'read:issue-meta:jira',
      'read:issue:jira',
      'read:issue.property:jira',
      'read:issue.time-tracking:jira',
    ])
  })
})
