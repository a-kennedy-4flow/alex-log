// The message that carries a workbook.
//
// SES sends a file in a raw message and in no other so the MIME below is what
// actually reaches the mailbox. The reminder is covered by `reminder.test.ts`.

import { describe, expect, it } from 'vitest'

import { TRACKER_RECIPIENT } from '@tracker/core'

import { deliveryMessage, rawMessage, WORKBOOK_TYPE, type Attachment } from '../mail'

const FROM = 'reminder@tracker.4flow.io'

const WORKBOOK: Attachment = {
  filename: 'Kennedy.Alexander_2026_08_projecttracker_DE.xlsm',
  contentType: WORKBOOK_TYPE,
  bytes: new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x99]),
}

function delivery(locale: 'en' | 'de' | null) {
  return deliveryMessage({
    locale,
    firstName: 'Alexander',
    year: 2026,
    month: 8,
    workbook: WORKBOOK,
  })
}

describe('the delivery message', () => {
  it('names the month in the language the user chose', () => {
    expect(delivery('de').subject).toBe('Ihr Tracker für August im Anhang')
  })

  it('falls back to English for a user who chose none', () => {
    expect(delivery(null).subject).toBe('Your August tracker is attached')
  })

  it('asks for the file to be passed on', () => {
    expect(delivery('en').text).toContain(TRACKER_RECIPIENT)
    expect(delivery('en').html).toContain(TRACKER_RECIPIENT)
  })

  it('carries the workbook and names it', () => {
    const message = delivery('en')
    expect(message.attachments).toEqual([WORKBOOK])
    expect(message.text).toContain(WORKBOOK.filename)
  })
})

describe('the raw message', () => {
  const mime = rawMessage(FROM, { to: 'a.kennedy@4flow.com', ...delivery('de') }).toString('utf8')

  it('addresses the message', () => {
    expect(mime).toContain(`From: ${FROM}`)
    expect(mime).toContain('To: a.kennedy@4flow.com')
  })

  it('encodes a subject that is not ASCII', () => {
    // `für` cannot travel in a bare header. RFC 2047 is how it does.
    const encoded = Buffer.from('Ihr Tracker für August im Anhang', 'utf8').toString('base64')
    expect(mime).toContain(`Subject: =?UTF-8?B?${encoded}?=`)
  })

  it('carries the file as base64 under its own name', () => {
    expect(mime).toContain(`Content-Type: ${WORKBOOK_TYPE}; filename="${WORKBOOK.filename}"`)
    expect(mime).toContain(`Content-Disposition: attachment; filename="${WORKBOOK.filename}"`)
    expect(mime).toContain(Buffer.from(WORKBOOK.bytes).toString('base64'))
  })

  it('offers the body as text and as HTML', () => {
    expect(mime).toContain('Content-Type: multipart/alternative')
    expect(mime).toContain('Content-Type: text/plain; charset=UTF-8')
    expect(mime).toContain('Content-Type: text/html; charset=UTF-8')
  })

  it('closes every part it opened', () => {
    const mixed = mime.match(/boundary="(mixed_[^"]+)"/)![1]!
    const alternative = mime.match(/boundary="(alt_[^"]+)"/)![1]!
    expect(mime).toContain(`--${alternative}--`)
    expect(mime.trimEnd().endsWith(`--${mixed}--`)).toBe(true)
  })

  it('spells a surname the header cannot hold twice over', () => {
    const raw = rawMessage(FROM, {
      to: 'anna.mueller@4flow.com',
      subject: 'x',
      text: 'x',
      html: 'x',
      attachments: [{ ...WORKBOOK, filename: 'Müller.Anna_2026_08_projecttracker_DE.xlsm' }],
    }).toString('utf8')
    // The quoted name has to be ASCII so RFC 2231 carries the real one.
    expect(raw).toContain('filename="M_ller.Anna_2026_08_projecttracker_DE.xlsm"')
    expect(raw).toContain("filename*=UTF-8''M%C3%BCller.Anna_2026_08_projecttracker_DE.xlsm")
  })

  it('wraps base64 at the line length SMTP accepts', () => {
    const long = rawMessage(FROM, {
      to: 'a.kennedy@4flow.com',
      subject: 'x',
      text: 'x',
      html: 'x',
      attachments: [{ ...WORKBOOK, bytes: new Uint8Array(600).fill(0x41) }],
    }).toString('utf8')
    // The headers are left out. A boundary is longer than a body line may be.
    const payload = long.split('\r\n').filter((line) => /^[A-Za-z0-9+/]+=*$/.test(line))
    expect(payload.length).toBeGreaterThan(1)
    expect(payload.every((line) => line.length <= 76)).toBe(true)
  })
})
