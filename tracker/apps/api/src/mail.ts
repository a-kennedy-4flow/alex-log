// Sending mail.
//
// Two messages leave this application. The monthly reminder asks for a tracker.
// The delivery carries one the user asked to be sent to their own mailbox. Both
// go out from a name we control so no other team owns any part of the delivery.
// See `docs/mail.md`.
//
// The client comes from the Lambda runtime rather than the bundle. It is also
// imported on the first send rather than on the first line. Because a) the API
// function answers every route from this module now that it sends the delivery.
// b) a static import resolves the client on every cold start. c) nobody presses
// the button on most of them.

import { randomUUID } from 'node:crypto'

import type { SESv2Client } from '@aws-sdk/client-sesv2'

import { DEFAULT_LOCALE, TRACKER_RECIPIENT, type LocaleCode } from '@tracker/core'

export interface Attachment {
  filename: string
  contentType: string
  bytes: Uint8Array
}

export interface Message {
  to: string
  subject: string
  text: string
  html: string
  /** A message carrying one of these is sent as MIME rather than as fields. */
  attachments?: Attachment[]
}

export interface Mailer {
  send(message: Message): Promise<void>
}

/** Used by the tests. Nothing leaves the process. */
export class MemoryMailer implements Mailer {
  readonly sent: Message[] = []

  async send(message: Message): Promise<void> {
    this.sent.push(message)
  }
}

/** The local server. Nothing leaves the process and the console says what would. */
export class ConsoleMailer implements Mailer {
  async send(message: Message): Promise<void> {
    const files = (message.attachments ?? []).map((file) => file.filename).join(' ')
    console.log(`mail       ${message.to} ${message.subject}${files ? ` + ${files}` : ''}`)
  }
}

/* ---------- MIME ---------- */

/** RFC 2047. Six of the eight subjects hold a month name that is not ASCII. */
function encodeHeader(value: string): string {
  const ascii = /^[\x20-\x7e]*$/.test(value)
  return ascii ? value : `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`
}

/** Base64 at the line length SMTP accepts. */
function wrap(value: string): string {
  return (value.match(/.{1,76}/g) ?? []).join('\r\n')
}

/** RFC 2231. A quoted file name must be ASCII and a surname need not be. */
function nameParams(filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7e]/g, '_')
  const also = ascii === filename ? '' : `; filename*=UTF-8''${encodeURIComponent(filename)}`
  return `filename="${ascii}"${also}`
}

/**
 * The message as MIME. SES carries a file in a raw message and in no other.
 *
 * `multipart/mixed` holds the body and the files. The body is itself a
 * `multipart/alternative` so a reader showing no HTML still has the text.
 */
export function rawMessage(from: string, message: Message): Buffer {
  const mixed = `mixed_${randomUUID()}`
  const alternative = `alt_${randomUUID()}`
  const base64 = (value: string): string => wrap(Buffer.from(value, 'utf8').toString('base64'))

  const lines = [
    `From: ${from}`,
    `To: ${message.to}`,
    `Subject: ${encodeHeader(message.subject)}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${mixed}"`,
    '',
    `--${mixed}`,
    `Content-Type: multipart/alternative; boundary="${alternative}"`,
    '',
    `--${alternative}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    base64(message.text),
    `--${alternative}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    base64(message.html),
    `--${alternative}--`,
  ]

  for (const file of message.attachments ?? []) {
    lines.push(
      `--${mixed}`,
      `Content-Type: ${file.contentType}; ${nameParams(file.filename)}`,
      'Content-Transfer-Encoding: base64',
      `Content-Disposition: attachment; ${nameParams(file.filename)}`,
      '',
      wrap(Buffer.from(file.bytes).toString('base64')),
    )
  }

  lines.push(`--${mixed}--`, '')
  return Buffer.from(lines.join('\r\n'), 'utf8')
}

export class SesMailer implements Mailer {
  /** Built on the first send and held for the life of the container. */
  private client: SESv2Client | null

  constructor(
    private readonly from: string,
    private readonly configurationSet: string | undefined,
    /** The tests hand one in. A deployment lets the first send build it. */
    client: SESv2Client | null = null,
  ) {
    this.client = client
  }

  async send(message: Message): Promise<void> {
    const { SESv2Client, SendEmailCommand } = await import('@aws-sdk/client-sesv2')
    this.client ??= new SESv2Client({})
    const carries = (message.attachments ?? []).length > 0
    await this.client.send(
      new SendEmailCommand({
        FromEmailAddress: this.from,
        Destination: { ToAddresses: [message.to] },
        ...(this.configurationSet ? { ConfigurationSetName: this.configurationSet } : {}),
        Content: carries
          ? { Raw: { Data: rawMessage(this.from, message) } }
          : {
              Simple: {
                Subject: { Data: message.subject, Charset: 'UTF-8' },
                Body: {
                  Text: { Data: message.text, Charset: 'UTF-8' },
                  Html: { Data: message.html, Charset: 'UTF-8' },
                },
              },
            },
      }),
    )
  }
}

/* ---------- what the message says ---------- */

interface Copy {
  subject: string
  greeting: string
  ending: string
  ask: string
  action: string
  mute: string
  /** Only sent to a user who has linked Jira and closed something. */
  jira: string
}

// One block per shipped language. The month name is not in here because `Intl`
// already holds it for every locale and a hand written list of twelve names in
// eight languages would drift against the calendar.
const COPY: Record<LocaleCode, Copy> = {
  en: {
    subject: 'Your {month} tracker',
    greeting: 'Hello {name}',
    ending: '{month} ends in {days} working days.',
    ask: 'Please complete your tracker and send it.',
    action: 'Open Tracker',
    mute: 'Turn this reminder off in your settings.',
    jira: 'You closed {tickets} Jira tickets this month. The Jira page can fill the tracker from them.',
  },
  de: {
    subject: 'Ihr Tracker für {month}',
    greeting: 'Hallo {name}',
    ending: '{month} endet in {days} Arbeitstagen.',
    ask: 'Bitte füllen Sie Ihren Tracker aus und senden Sie ihn ab.',
    action: 'Tracker öffnen',
    mute: 'Sie können diese Erinnerung in den Einstellungen abschalten.',
    jira: 'Sie haben diesen Monat {tickets} Jira Tickets abgeschlossen. Die Jira Seite kann den Tracker daraus füllen.',
  },
  fr: {
    subject: 'Votre tracker de {month}',
    greeting: 'Bonjour {name}',
    ending: '{month} se termine dans {days} jours ouvrés.',
    ask: "Merci de compléter votre tracker et de l'envoyer.",
    action: 'Ouvrir Tracker',
    mute: 'Vous pouvez désactiver ce rappel dans les paramètres.',
    jira: 'Vous avez terminé {tickets} tickets Jira ce mois. La page Jira peut remplir le tracker à partir de ceux ci.',
  },
  es: {
    subject: 'Tu tracker de {month}',
    greeting: 'Hola {name}',
    ending: '{month} termina en {days} días laborables.',
    ask: 'Por favor completa tu tracker y envíalo.',
    action: 'Abrir Tracker',
    mute: 'Puedes desactivar este recordatorio en los ajustes.',
    jira: 'Ha cerrado {tickets} tickets de Jira este mes. La página de Jira puede rellenar el tracker con ellos.',
  },
  cs: {
    subject: 'Váš tracker za {month}',
    greeting: 'Dobrý den {name}',
    ending: '{month} končí za {days} pracovních dnů.',
    ask: 'Vyplňte prosím svůj tracker a odešlete jej.',
    action: 'Otevřít Tracker',
    mute: 'Toto připomenutí lze vypnout v nastavení.',
    jira: 'Tento měsíc jste uzavřeli {tickets} tiketů v Jiře. Stránka Jira z nich může vyplnit tracker.',
  },
  hu: {
    subject: '{month} havi tracker',
    greeting: 'Üdvözöljük {name}',
    ending: '{month} {days} munkanap múlva véget ér.',
    ask: 'Kérjük töltse ki a trackert és küldje el.',
    action: 'Tracker megnyitása',
    mute: 'Ez az emlékeztető a beállításokban kikapcsolható.',
    jira: 'Ebben a hónapban {tickets} Jira jegyet zárt le. A Jira oldal ezekből ki tudja tölteni a trackert.',
  },
  'pt-BR': {
    subject: 'Seu tracker de {month}',
    greeting: 'Olá {name}',
    ending: '{month} termina em {days} dias úteis.',
    ask: 'Por favor preencha seu tracker e envie.',
    action: 'Abrir Tracker',
    mute: 'Você pode desativar este lembrete nas configurações.',
    jira: 'Você fechou {tickets} tickets do Jira neste mês. A página do Jira pode preencher o tracker com eles.',
  },
  'zh-CN': {
    subject: '{month}工时表提醒',
    greeting: '{name} 您好',
    ending: '{month}还有 {days} 个工作日结束。',
    ask: '请填写并提交您的工时表。',
    action: '打开 Tracker',
    mute: '可在设置中关闭此提醒。',
    jira: '本月您关闭了 {tickets} 个 Jira 工单。Jira 页面可以据此填充工时表。',
  },
}

function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? ''))
}

/** Escaped because a name arrives from an identity provider rather than from us. */
function escape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export interface ReminderInput {
  locale: LocaleCode | null
  firstName: string
  year: number
  /** 1 through 12. */
  month: number
  /** Working days left in the month counting the day the message is sent. */
  daysLeft: number
  /** Where the tracker lives. */
  url: string
  /**
   * How many Jira tickets this user closed in the month. Null for a user who
   * has not linked Jira or whose link could not be read. No hours are sent
   * because Jira holds none. See `docs/jira.md`.
   */
  jiraTickets?: number | null
  /** Where the Jira screen for this month lives. Null when there is no count. */
  jiraUrl?: string | null
}

export function reminderMessage(input: ReminderInput): Omit<Message, 'to'> {
  const locale = input.locale ?? DEFAULT_LOCALE
  const copy = COPY[locale]
  const monthName = new Intl.DateTimeFormat(locale, { month: 'long', timeZone: 'UTC' }).format(
    new Date(Date.UTC(input.year, input.month - 1, 1)),
  )
  const values = {
    month: monthName,
    name: input.firstName,
    days: input.daysLeft,
    tickets: input.jiraTickets ?? 0,
  }

  const subject = fill(copy.subject, values)
  const greeting = fill(copy.greeting, values)
  const ending = fill(copy.ending, values)
  // Left out for a user with no link and for one who closed nothing. A count of
  // zero would read as a reproach rather than as help.
  const jira = input.jiraTickets && input.jiraUrl ? fill(copy.jira, values) : null

  const text = [
    greeting,
    '',
    ending,
    copy.ask,
    '',
    input.url,
    ...(jira && input.jiraUrl ? ['', jira, input.jiraUrl] : []),
    '',
    copy.mute,
  ].join('\n')

  // Inline styles only. A mail client strips a stylesheet.
  const html = [
    '<html><body style="font-family:system-ui,sans-serif;color:#0d1b2a;line-height:1.5">',
    `<p>${escape(greeting)}</p>`,
    `<p>${escape(ending)} ${escape(copy.ask)}</p>`,
    `<p><a href="${escape(input.url)}" style="display:inline-block;background:#FF4D06;`,
    'color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:6px;font-weight:600">',
    `${escape(copy.action)}</a></p>`,
    ...(jira && input.jiraUrl
      ? [`<p>${escape(jira)} <a href="${escape(input.jiraUrl)}">${escape(input.jiraUrl)}</a></p>`]
      : []),
    `<p style="color:#5b6b7c;font-size:12px">${escape(copy.mute)}</p>`,
    '</body></html>',
  ].join('')

  return { subject, text, html }
}

/* ---------- the delivery ---------- */

interface Delivery {
  subject: string
  greeting: string
  attached: string
  forward: string
}

// The reminder copy above and this one are held apart. Because a) the reminder
// asks for a tracker that does not exist yet. b) this one carries the finished
// workbook. c) a subject shared between the two would thread them together in
// the mailbox.
const DELIVERY: Record<LocaleCode, Delivery> = {
  en: {
    subject: 'Your {month} tracker is attached',
    greeting: 'Hello {name}',
    attached: 'Your tracker for {month} is attached to this message.',
    forward: 'Check it then forward it to {address}.',
  },
  de: {
    subject: 'Ihr Tracker für {month} im Anhang',
    greeting: 'Hallo {name}',
    attached: 'Ihr Tracker für {month} liegt dieser Nachricht bei.',
    forward: 'Bitte prüfen Sie ihn und leiten Sie ihn an {address} weiter.',
  },
  fr: {
    subject: 'Votre tracker de {month} en pièce jointe',
    greeting: 'Bonjour {name}',
    attached: 'Votre tracker de {month} est joint à ce message.',
    forward: 'Vérifiez le puis transférez le à {address}.',
  },
  es: {
    subject: 'Tu tracker de {month} adjunto',
    greeting: 'Hola {name}',
    attached: 'Tu tracker de {month} está adjunto a este mensaje.',
    forward: 'Revísalo y reenvíalo a {address}.',
  },
  cs: {
    subject: 'Váš tracker za {month} v příloze',
    greeting: 'Dobrý den {name}',
    attached: 'Váš tracker za {month} je přílohou této zprávy.',
    forward: 'Zkontrolujte jej a přepošlete na {address}.',
  },
  hu: {
    subject: '{month} havi tracker csatolva',
    greeting: 'Üdvözöljük {name}',
    attached: 'A {month} havi tracker ehhez az üzenethez csatolva van.',
    forward: 'Ellenőrizze majd továbbítsa a következő címre {address}.',
  },
  'pt-BR': {
    subject: 'Seu tracker de {month} em anexo',
    greeting: 'Olá {name}',
    attached: 'Seu tracker de {month} está anexado a esta mensagem.',
    forward: 'Confira e encaminhe para {address}.',
  },
  'zh-CN': {
    subject: '{month}工时表已附上',
    greeting: '{name} 您好',
    attached: '本邮件已附上您{month}的工时表。',
    forward: '请核对后转发至 {address}。',
  },
}

/** What the workbook is called on the wire. The tracker carries macros. */
export const WORKBOOK_TYPE = 'application/vnd.ms-excel.sheet.macroEnabled.12'

export interface DeliveryInput {
  locale: LocaleCode | null
  firstName: string
  year: number
  /** 1 through 12. */
  month: number
  workbook: Attachment
}

/** The message that carries a finished workbook to the user who asked for it. */
export function deliveryMessage(input: DeliveryInput): Omit<Message, 'to'> {
  const locale = input.locale ?? DEFAULT_LOCALE
  const copy = DELIVERY[locale]
  const monthName = new Intl.DateTimeFormat(locale, { month: 'long', timeZone: 'UTC' }).format(
    new Date(Date.UTC(input.year, input.month - 1, 1)),
  )
  const values = { month: monthName, name: input.firstName, address: TRACKER_RECIPIENT }

  const subject = fill(copy.subject, values)
  const greeting = fill(copy.greeting, values)
  const attached = fill(copy.attached, values)
  const forward = fill(copy.forward, values)

  const text = [greeting, '', attached, forward, '', input.workbook.filename].join('\n')

  // Inline styles only. A mail client strips a stylesheet.
  const html = [
    '<html><body style="font-family:system-ui,sans-serif;color:#0d1b2a;line-height:1.5">',
    `<p>${escape(greeting)}</p>`,
    `<p>${escape(attached)} ${escape(forward)}</p>`,
    `<p style="color:#5b6b7c;font-size:12px">${escape(input.workbook.filename)}</p>`,
    '</body></html>',
  ].join('')

  return { subject, text, html, attachments: [input.workbook] }
}
