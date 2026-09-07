// Sending mail.
//
// The reminder is the only message this application sends. It goes out from a
// name we control so no other team owns any part of the delivery. See
// `docs/mail.md`.
//
// The client comes from the Lambda runtime rather than the bundle. That is the
// same arrangement `dynamo.ts` already relies on.

import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2'

import { DEFAULT_LOCALE, type LocaleCode } from '@tracker/core'

export interface Message {
  to: string
  subject: string
  text: string
  html: string
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

export class SesMailer implements Mailer {
  constructor(
    private readonly from: string,
    private readonly configurationSet: string | undefined,
    private readonly client: SESv2Client = new SESv2Client({}),
  ) {}

  async send(message: Message): Promise<void> {
    await this.client.send(
      new SendEmailCommand({
        FromEmailAddress: this.from,
        Destination: { ToAddresses: [message.to] },
        ...(this.configurationSet ? { ConfigurationSetName: this.configurationSet } : {}),
        Content: {
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
