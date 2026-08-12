// the one line the headless clients print on their reporting interval
export function summary({ started, count, kind, ms, errors, lastError }, perLanguage) {
    const uptime = (Date.now() - started) / 1000
    const avg = count ? (ms / count).toFixed(1) : '—'
    const per = Object.entries(perLanguage)
        .map(([lang, v]) => `${lang} ${v}`)
        .join(' · ')
    console.log(`${count} ${kind} · ${(count / uptime).toFixed(1)}/s · avg ${avg}ms · ${errors} errors${lastError ? ` (${lastError})` : ''} · ${per}`)
}
