// The file name as it travels in a header.
//
// The download used to write the name straight into `content-disposition`. A
// name holding üöä arrived mangled. A name holding a character above U+00FF
// killed the response outright. These tests hold the encoding that fixed both.

import { describe, expect, it } from 'vitest'

import { dispositionParams, filenameFromDisposition } from '../filename'

const ASCII = 'Kennedy.Alexander_2026_08_projecttracker_DE.xlsm'
const UMLAUT = 'Müller.Jörg_2026_08_projecttracker_DE.xlsm'
const CZECH = 'Dvořák.Tomáš_2026_08_projecttracker_CZ.xlsm'

describe('writing the name', () => {
  it('writes an ASCII name once', () => {
    expect(dispositionParams(ASCII)).toBe(`filename="${ASCII}"`)
  })

  it('states the encoding of a name that is not ASCII', () => {
    const params = dispositionParams(UMLAUT)
    expect(params).toContain(`filename*=UTF-8''${encodeURIComponent(UMLAUT)}`)
  })

  it('leaves the plain parameter ASCII so no transport can mangle it', () => {
    const plain = dispositionParams(CZECH).match(/filename="([^"]*)"/)![1]!
    expect(plain).toMatch(/^[\x20-\x7e]*$/)
    expect(plain).toBe('Dvo__k.Tom___2026_08_projecttracker_CZ.xlsm')
  })

  it('percent encodes an apostrophe because it ends the encoding field', () => {
    const params = dispositionParams("O'Brien.Seán_2026_08_projecttracker_IE.xlsm")
    const encoded = params.match(/filename\*=UTF-8''(.*)$/)![1]!
    expect(encoded).toContain('O%27Brien')
    expect(encoded).not.toContain("'")
  })

  it('writes a header Node accepts', () => {
    expect(dispositionParams(CZECH)).toMatch(/^[\x20-\x7e]*$/)
  })
})

describe('reading the name back', () => {
  it('round trips every name', () => {
    for (const name of [ASCII, UMLAUT, CZECH, "O'Brien.Seán_2026_08_projecttracker_IE.xlsm"]) {
      expect(filenameFromDisposition(`attachment; ${dispositionParams(name)}`)).toBe(name)
    }
  })

  it('prefers the encoded parameter over the replaced one', () => {
    const header = `attachment; filename="M_ller.xlsm"; filename*=UTF-8''M%C3%BCller.xlsm`
    expect(filenameFromDisposition(header)).toBe('Müller.xlsm')
  })

  it('reads a header that states no encoding', () => {
    expect(filenameFromDisposition(`attachment; filename="${ASCII}"`)).toBe(ASCII)
  })

  it('reads an unquoted name', () => {
    expect(filenameFromDisposition(`attachment; filename=${ASCII}`)).toBe(ASCII)
  })

  it('falls back to the plain parameter when the escape is broken', () => {
    expect(filenameFromDisposition(`attachment; filename="a.xlsm"; filename*=UTF-8''%zz`)).toBe(
      'a.xlsm',
    )
  })

  it('answers null for a header naming no file', () => {
    expect(filenameFromDisposition('attachment')).toBeNull()
    expect(filenameFromDisposition('')).toBeNull()
  })
})
