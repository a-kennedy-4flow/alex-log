<script setup lang="ts">
// The Jira screen. Layout H1 of `mockups/index.html`.
//
// Three tables down one sheet. The reading order is the working order. The one
// cost of that layout is the summaries scrolling away while the hours above
// them are typed so the head band carries a strip of the same figures and
// sticks.

import { computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { findProject, labelOf } from '@tracker/core'

import { monthName } from '@/i18n'

import CostCentrePicker from '@/components/CostCentrePicker.vue'
import { consentError, startLink } from '@/lib/jira'
import { target } from '@/composables/useTimesheet'
import {
  choosePeriod,
  chosenProjects,
  error,
  fetchedAt,
  filling,
  fillMonth,
  fits,
  groups,
  hoursTextOf,
  link,
  linkError,
  loadLink,
  loadMonth,
  loading,
  mapProject,
  mode,
  offeredPeriods,
  period,
  relinkNeeded,
  tickets,
  shareOf,
  shares,
  shareTotal,
  totals,
  unlink,
  workdayIdOf,
  wouldReplace,
  daysToBook,
  halfDayHours,
  monthHours,
} from '@/composables/useJira'

const { t, te, n, locale } = useI18n()

/**
 * What to call the field an hours figure came from.
 *
 * The two fields Jira holds itself have a translation. A configured custom
 * field is named rather than translated because the list is configuration and
 * no catalogue of eight languages can follow it.
 */
function sourceLabel(source: string): string {
  if (source === '') return t('jira.source.none')
  return te(`jira.source.${source}`) ? t(`jira.source.${source}`) : source
}

onMounted(async () => {
  await loadLink()
  if (link.value?.linked) await loadMonth()
})

/** The month this screen reads. Written out for the heading. */
const readMonth = computed(() => {
  const month = Number(period.value.split('-')[1])
  return monthName(locale.value, month)
})

function titleOf(workdayId: string): string {
  const project = findProject(workdayId)
  return project ? labelOf(project) : t('jira.unknownWorkdayId')
}

/** Every project on the list that books against nothing yet. */
const unmapped = computed(() => {
  const seen = new Set<string>()
  return tickets.value
    .filter((ticket) => workdayIdOf(ticket) === null)
    .filter((ticket) => !seen.has(ticket.projectKey) && seen.add(ticket.projectKey))
})

async function chooseFor(projectKey: string, workdayId: string | null): Promise<void> {
  if (workdayId) await mapProject(projectKey, workdayId)
}

async function run(): Promise<void> {
  await fillMonth()
}
</script>

<template>
  <div class="sheet">
    <!-- The state is unknown until the first read answers. -->
    <section v-if="link === null && linkError === null" class="pad">
      <h2 class="eyebrow">{{ t('jira.title') }}</h2>
      <p class="muted">{{ t('jira.loading') }}</p>
    </section>

    <!-- The read failed. The button is still offered. -->
    <section v-else-if="link === null" class="pad">
      <h2 class="eyebrow">{{ t('jira.title') }}</h2>
      <p class="note">{{ linkError }}</p>
      <button type="button" class="btn" @click="loadLink()">{{ t('jira.retry') }}</button>
    </section>

    <!-- Not linked. Nothing else on this screen can be shown yet. -->
    <section v-else-if="!link.linked" class="pad">
      <h2 class="eyebrow">{{ t('jira.title') }}</h2>
      <p class="intro">{{ t('jira.linkIntro') }}</p>
      <!-- A consent that came back and failed. Atlassian own words. -->
      <p v-if="consentError" class="note">{{ t('jira.consentFailed', { reason: consentError }) }}</p>
      <button
        type="button"
        class="btn btn-primary"
        :disabled="link.clientId === ''"
        @click="startLink(link.clientId, link.redirectUri, '/jira')"
      >
        {{ t('jira.link') }}
      </button>
      <p v-if="link.clientId === ''" class="muted">{{ t('jira.notConfigured') }}</p>
    </section>

    <template v-else>
      <!-- The head sticks. It is what pays for the summaries scrolling away. -->
      <section class="pad head">
        <div>
          <h2 class="eyebrow">{{ t('jira.title') }}</h2>
          <p class="intro">
            {{ t('jira.intro', { month: readMonth, count: tickets.length, ids: groups.length }) }}
          </p>
          <div class="months">
            <button type="button" class="btn quiet" @click="unlink()">
              {{ t('jira.unlink') }}
            </button>
            <button
              v-for="option in offeredPeriods"
              :key="option"
              type="button"
              class="btn"
              :class="{ on: option === period }"
              @click="choosePeriod(option)"
            >
              {{ monthName(locale, Number(option.split('-')[1])) }}
            </button>
          </div>
        </div>
        <dl class="stats">
          <div>
            <dt>{{ t('jira.hours') }}</dt>
            <dd class="num">{{ n(totals.hours) }}</dd>
          </div>
          <div>
            <dt>{{ t('jira.trueDays') }}</dt>
            <dd class="num">{{ n(totals.trueDays) }}</dd>
          </div>
          <div>
            <dt>{{ t('jira.bookedDays') }}</dt>
            <dd class="num">{{ n(daysToBook) }}</dd>
          </div>
          <div>
            <dt>{{ t('jira.target') }}</dt>
            <dd class="num off">{{ n(target) }}</dd>
          </div>
        </dl>
      </section>

      <section class="pad band">
        <h2 class="eyebrow">{{ t('jira.closedTitle') }}</h2>
        <p class="intro">{{ t('jira.closedIntro') }}</p>

        <p v-if="relinkNeeded" class="note">
          {{ t('jira.relink') }}
          <button
            type="button"
            class="btn"
            @click="startLink(link!.clientId, link!.redirectUri, '/jira')"
          >
            {{ t('jira.link') }}
          </button>
        </p>
        <p v-else-if="error" class="note">{{ error }}</p>
        <p v-else-if="loading" class="muted">{{ t('jira.loading') }}</p>
        <p v-else-if="tickets.length === 0" class="muted">{{ t('jira.none') }}</p>

        <table v-else>
          <thead>
            <tr>
              <th>{{ t('jira.ticket') }}</th>
              <th>{{ t('jira.summary') }}</th>
              <th>{{ t('jira.closed') }}</th>
              <th>{{ t('jira.workdayId') }}</th>
              <th class="right">{{ t('jira.hoursColumn') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="ticket in tickets" :key="ticket.key">
              <td class="num nowrap">{{ ticket.key }}</td>
              <td>
                {{ ticket.summary }}
                <span v-if="ticket.parentSummary" class="epic">{{ ticket.parentSummary }}</span>
              </td>
              <td class="nowrap">{{ ticket.resolvedAt.slice(0, 10) }}</td>
              <td>
                <span v-if="workdayIdOf(ticket)" class="pill light num">
                  {{ workdayIdOf(ticket) }}
                </span>
                <span v-else class="unmapped">{{ ticket.projectKey }}</span>
              </td>
              <td class="right">
                <span class="num">{{ hoursTextOf(ticket) || '—' }}</span>
                <span class="src">{{ sourceLabel(ticket.hoursSource) }}</span>
              </td>
            </tr>
          </tbody>
        </table>

        <p v-if="fetchedAt" class="muted">{{ t('jira.read', { at: fetchedAt.slice(0, 16) }) }}</p>

        <!-- Every project that books against nothing yet. One row each. -->
        <div v-for="ticket in unmapped" :key="ticket.projectKey" class="map">
          <p>{{ t('jira.mapIntro', { project: ticket.projectKey }) }}</p>
          <CostCentrePicker
            :model-value="chosenProjects[ticket.projectKey] ?? null"
            @update:model-value="chooseFor(ticket.projectKey, $event)"
          />
        </div>
      </section>

      <section v-if="groups.length" class="pad band">
        <h2 class="eyebrow">{{ t('jira.groupedTitle') }}</h2>
        <p class="intro">{{ t('jira.groupedIntro') }}</p>
        <table>
          <thead>
            <tr>
              <th>{{ t('jira.workdayId') }}</th>
              <th>{{ t('jira.projectTitle') }}</th>
              <th class="right">{{ t('jira.tickets') }}</th>
              <th class="right">{{ t('jira.hoursColumn') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="group in groups" :key="group.workdayId">
              <td class="num nowrap">{{ group.workdayId }}</td>
              <td>{{ titleOf(group.workdayId) }}</td>
              <td class="right num">{{ group.tickets.length }}</td>
              <td class="right num">{{ n(group.hours) }}</td>
            </tr>
            <tr class="total">
              <td colspan="2">{{ t('jira.total') }}</td>
              <td class="right num">{{ tickets.length }}</td>
              <td class="right num">{{ n(totals.hours) }}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section v-if="groups.length" class="pad band">
        <h2 class="eyebrow">{{ t('jira.daysTitle') }}</h2>
        <p class="intro">
          {{ t('jira.daysIntro', { half: n(halfDayHours), day: n(halfDayHours * 2) }) }}
        </p>

        <!-- Decision 1 is open. The percentage needs no arithmetic to trust. -->
        <div class="switch">
          <button type="button" :class="{ on: mode === 'hours' }" @click="mode = 'hours'">
            {{ t('jira.byHours') }}
          </button>
          <button type="button" :class="{ on: mode === 'percent' }" @click="mode = 'percent'">
            {{ t('jira.byPercent') }}
          </button>
        </div>

        <div v-if="mode === 'percent'" class="shares">
          <p class="intro">
            {{ t('jira.percentIntro', { target: n(daysToBook), hours: n(monthHours) }) }}
          </p>
          <label v-for="group in groups" :key="group.workdayId" class="share">
            <span class="num">{{ group.workdayId }}</span>
            <input
              class="hrs num"
              type="number"
              min="0"
              max="100"
              step="1"
              :value="shareOf(group.workdayId)"
              @input="shares[group.workdayId] = Number(($event.target as HTMLInputElement).value)"
            />
            <span class="muted">{{ t('jira.percent') }}</span>
          </label>
          <p :class="shareTotal === 100 ? 'muted' : 'warnShare'">
            {{ t('jira.shareTotal', { total: n(shareTotal) }) }}
          </p>
        </div>

        <table v-else>
          <thead>
            <tr>
              <th>{{ t('jira.workdayId') }}</th>
              <th class="right">{{ t('jira.hoursColumn') }}</th>
              <th class="right">{{ t('jira.trueDays') }}</th>
              <th class="right">{{ t('jira.bookedDays') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="group in groups" :key="group.workdayId">
              <td class="num nowrap">{{ group.workdayId }}</td>
              <td class="right num">{{ n(group.hours) }}</td>
              <td class="right num">{{ n(group.trueDays) }}</td>
              <td class="right num strong">{{ n(group.days) }}</td>
            </tr>
            <tr class="total">
              <td>{{ t('jira.total') }}</td>
              <td class="right num">{{ n(totals.hours) }}</td>
              <td class="right num">{{ n(totals.trueDays) }}</td>
              <td class="right num">{{ n(totals.roundedDays) }}</td>
            </tr>
          </tbody>
        </table>

        <p v-if="mode === 'hours'" class="note">
          {{
            t('jira.rounding', {
              hours: n(totals.hours),
              trueDays: n(totals.trueDays),
              days: n(totals.roundedDays),
              added: n(Math.round(totals.inflation * 100) / 100),
            })
          }}
        </p>
        <p class="note">{{ t('jira.noWorklogs') }}</p>
        <p v-if="totals.unmapped.length" class="note">
          {{ t('jira.unmappedCount', { count: totals.unmapped.length }) }}
        </p>
      </section>

      <section v-if="groups.length" class="fill">
        <div class="fig">
          <span>{{ t('jira.covers') }}</span>
          <b class="num">{{ t('jira.ofTarget', { days: n(totals.roundedDays), target: n(target) }) }}</b>
        </div>
        <div class="say">
          <p>{{ t('jira.fillIntro') }}</p>
          <p v-if="wouldReplace" class="warn">
            {{ t('jira.wouldReplace', { count: wouldReplace }) }}
          </p>
          <p v-if="!fits" class="warn">{{ t('jira.doesNotFit') }}</p>
        </div>
        <button type="button" class="btn btn-primary" :disabled="filling || !fits" @click="run">
          {{ filling ? t('jira.filling') : t('jira.fill') }}
        </button>
      </section>
    </template>
  </div>
</template>

<style scoped>
.head {
  display: flex;
  align-items: flex-end;
  flex-wrap: wrap;
  gap: 18px;
  position: sticky;
  top: 0;
  z-index: 2;
  background: var(--white);
}

.intro {
  margin: 0 0 14px;
  color: var(--grey);
  font-size: 13px;
  max-width: 82ch;
}

.head .intro {
  margin: 0 0 10px;
}

.months {
  display: flex;
  gap: 8px;
}

.switch {
  display: flex;
  gap: 2px;
  background: var(--warm-grey);
  border-radius: var(--radius);
  padding: 3px;
  width: max-content;
  margin-bottom: 16px;
}

.switch button {
  border: 0;
  background: none;
  color: var(--smart-blue);
  border-radius: calc(var(--radius) - 3px);
  padding: 7px 15px;
  font-size: 13px;
  font-family: inherit;
}

.switch button.on {
  background: var(--white);
  font-weight: 700;
}

.shares {
  display: grid;
  gap: 10px;
  max-width: 60ch;
}

.share {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 13px;
}

/* A share that does not add to a hundred. Orange marks the figure that is off. */
.warnShare {
  color: var(--orange);
  font-weight: 700;
  font-size: 13px;
  margin: 0;
}

/* Leaving the connection is not the thing to reach for so it reads quieter. */
.months .btn.quiet {
  color: var(--grey);
  margin-right: 8px;
}

/* The month being read. Smart Blue rather than the reserved orange. */
.months .btn.on {
  background: var(--smart-blue);
  border-color: var(--smart-blue);
  color: var(--white);
}

.stats {
  display: flex;
  margin: 0 0 0 auto;
}

.stats > div {
  padding: 0 20px;
  border-left: 1px solid var(--warm-grey);
  text-align: right;
}

.stats > div:first-child {
  border-left: none;
}

.stats dt {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--grey);
  margin: 0;
}

.stats dd {
  margin: 2px 0 0;
  font-size: 22px;
  font-weight: 700;
}

/* The one figure that is off target. Nothing else here takes the colour. */
.stats dd.off {
  color: var(--orange);
}

table {
  border-collapse: collapse;
  width: 100%;
  font-size: 13px;
}

th,
td {
  text-align: left;
  padding: 9px 10px;
  border-bottom: 1px solid var(--line);
}

th {
  color: var(--grey);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  border-bottom: 2px solid var(--bright-blue);
  white-space: nowrap;
}

tbody tr:last-child td {
  border-bottom: none;
}

.right {
  text-align: right;
}

.nowrap {
  white-space: nowrap;
}

.strong {
  font-weight: 700;
}

tr.total td {
  border-top: 2px solid var(--bright-blue);
  border-bottom: none;
  font-weight: 700;
}

.epic {
  display: block;
  font-size: 11px;
  color: var(--grey);
}

.unmapped {
  color: var(--orange);
  font-weight: 700;
}

.hrs {
  width: 74px;
  text-align: right;
  background: var(--warm-grey);
  border: 1px solid transparent;
  border-radius: var(--radius);
  padding: 6px 9px;
  color: inherit;
  font-family: inherit;
  font-size: 13px;
}

.src {
  display: block;
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--grey);
}

.note {
  border-radius: var(--radius);
  padding: 14px 18px;
  background: var(--open);
  border-left: 6px solid var(--orange);
  max-width: 84ch;
  font-size: 13px;
  margin: 14px 0 0;
}

.map {
  display: grid;
  gap: 8px;
  margin-top: 18px;
  max-width: 60ch;
}

.map p {
  margin: 0;
  font-size: 13px;
}

/* The last band closes the sheet the way the download does on the month page. */
.fill {
  background: var(--smart-blue);
  color: var(--white);
  padding: 24px 26px;
  display: flex;
  align-items: center;
  gap: 26px;
  flex-wrap: wrap;
}

.fill .fig span {
  display: block;
  color: var(--on-blue-label);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin-bottom: 3px;
}

.fill .fig b {
  font-size: 22px;
}

.fill .say {
  max-width: 60ch;
}

.fill .say p {
  margin: 0;
  color: var(--on-blue-body);
  font-size: 13px;
}

.fill .warn {
  color: var(--white);
}

.fill .btn {
  margin-left: auto;
}
</style>
