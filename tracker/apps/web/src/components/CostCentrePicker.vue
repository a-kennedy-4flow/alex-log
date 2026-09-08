<script setup lang="ts">
// Picks a workday id.
//
// The list holds every cost centre and project plus the two absence types. It
// is driven from the keyboard. Typing narrows it and Enter takes the highlighted
// row so a cost centre can be entered without reaching for the mouse.

import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import type { Project } from '@tracker/core'
import { findProject, isAbsence, labelOf, searchProjects } from '@tracker/core'
import { profile } from '@/composables/useTimesheet'

const props = defineProps<{ modelValue: string | null; invalid?: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: string | null] }>()

const { t } = useI18n()

const open = ref(false)
const query = ref('')
const active = ref(0)
const root = ref<HTMLDivElement | null>(null)
const trigger = ref<HTMLButtonElement | null>(null)
const input = ref<HTMLInputElement | null>(null)
const list = ref<HTMLUListElement | null>(null)
const RESULT_LIMIT = 60

/** The trigger box in viewport coordinates. Null while the panel is shut. */
const anchor = ref<DOMRect | null>(null)

/** The space kept between the trigger and the panel. */
const GAP = 2
/** The space kept from every viewport edge. */
const EDGE = 8
/** Under this much room below the trigger the panel opens upwards instead. */
const ROOM = 220

const selected = computed(() => findProject(props.modelValue))

const label = computed(() => {
  if (!props.modelValue) return null
  const project = selected.value
  if (!project) return props.modelValue
  if (isAbsence(project.workdayId)) return project.workdayId
  return `${project.workdayId} ${labelOf(project)}`.trim()
})

const results = computed(() => searchProjects(query.value, RESULT_LIMIT, profile.businessLine))

/** True for a row from the user own business line. Those break a rank tie. */
function isPreferred(project: Project): boolean {
  return profile.businessLine !== null && project.businessLine === profile.businessLine
}

function kindOf(project: Project): string {
  if (isAbsence(project.workdayId)) return t('picker.absence')
  return project.objectKey === 'cc' ? t('picker.costCentre') : t('picker.project')
}

function choose(project: Project | undefined): void {
  if (!project) return
  emit('update:modelValue', project.workdayId)
  open.value = false
  query.value = ''
}

function clear(): void {
  emit('update:modelValue', null)
  open.value = false
  query.value = ''
}

function measure(): void {
  anchor.value = open.value ? (trigger.value?.getBoundingClientRect() ?? null) : null
}

/**
 * Where the panel is drawn.
 *
 * The panel is fixed to the viewport rather than positioned inside the cell.
 * Because a) the month grid scrolls under `overflow: auto` and that clips an
 * absolute panel. b) a fixed box takes its containing block from the viewport
 * so no ancestor overflow can reach it.
 *
 * The cost is that nothing moves the panel with the page. `measure` runs again
 * on a scroll and on a resize to pay it.
 */
const place = computed(() => {
  const box = anchor.value
  if (!box) return null
  const width = Math.min(600, window.innerWidth * 0.84)
  const below = window.innerHeight - box.bottom - GAP - EDGE
  const above = box.top - GAP - EDGE
  const downwards = below >= ROOM || below >= above
  return {
    left: Math.max(EDGE, Math.min(box.left, window.innerWidth - width - EDGE)),
    top: downwards ? box.bottom + GAP : undefined,
    bottom: downwards ? undefined : window.innerHeight - box.top + GAP,
    width,
    /** What the panel may take. The results list shrinks to fit inside it. */
    room: Math.max(downwards ? below : above, ROOM),
  }
})

/** Shuts the panel on a press outside it. */
function onPressOutside(event: Event): void {
  const target = event.target
  if (target instanceof Node && root.value?.contains(target)) return
  open.value = false
}

function listen(): void {
  document.addEventListener('pointerdown', onPressOutside)
  // A scroll does not bubble so the listener has to capture. The panel follows
  // a scroll of the month grid as well as one of the page.
  window.addEventListener('scroll', measure, true)
  window.addEventListener('resize', measure)
}

function unlisten(): void {
  document.removeEventListener('pointerdown', onPressOutside)
  window.removeEventListener('scroll', measure, true)
  window.removeEventListener('resize', measure)
}

// A narrower list can be shorter than the highlight so it moves back to the top.
watch(results, () => {
  active.value = 0
})

watch(open, async (isOpen) => {
  if (!isOpen) {
    unlisten()
    return
  }
  measure()
  listen()
  active.value = 0
  await nextTick()
  input.value?.focus()
})

onBeforeUnmount(unlisten)

async function move(step: number): Promise<void> {
  const count = results.value.length
  if (count === 0) return
  active.value = (active.value + step + count) % count
  await nextTick()
  list.value?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' })
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    open.value = false
    return
  }
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    void move(1)
    return
  }
  if (event.key === 'ArrowUp') {
    event.preventDefault()
    void move(-1)
    return
  }
  if (event.key === 'Enter') {
    // The input is a search field so Enter would otherwise clear it.
    event.preventDefault()
    choose(results.value[active.value])
  }
}

/** Opens on Enter or Down so the trigger works from the keyboard too. */
function onTriggerKeydown(event: KeyboardEvent): void {
  if (event.key === 'ArrowDown' || event.key === 'Enter') {
    event.preventDefault()
    open.value = true
  }
}
</script>

<template>
  <div ref="root" class="picker">
    <button
      ref="trigger"
      type="button"
      class="trigger"
      :class="{ invalid: props.invalid, empty: !label }"
      :aria-expanded="open"
      @click="open = !open"
      @keydown="onTriggerKeydown"
    >
      <span v-if="label" class="label">{{ label }}</span>
      <span v-else class="placeholder">{{ t('grid.pickCostCentre') }}</span>
    </button>

    <div
      v-if="open && place"
      class="panel"
      :style="{
        left: `${place.left}px`,
        top: place.top === undefined ? undefined : `${place.top}px`,
        bottom: place.bottom === undefined ? undefined : `${place.bottom}px`,
        width: `${place.width}px`,
        '--panel-room': `${place.room}px`,
      }"
      @keydown="onKeydown"
    >
      <input
        ref="input"
        v-model="query"
        type="search"
        :placeholder="t('picker.search')"
        autocomplete="off"
      />
      <ul v-if="results.length" ref="list" class="results">
        <li v-for="(project, index) in results" :key="project.workdayId">
          <button
            type="button"
            :data-active="index === active"
            :class="{ active: index === active, preferred: isPreferred(project) }"
            @click="choose(project)"
            @mousemove="active = index"
          >
            <span class="id num">{{ project.workdayId }}</span>
            <span class="title">{{ labelOf(project) }}</span>
            <span class="meta">
              <span class="kind">{{ kindOf(project) }}</span>
              <span v-if="project.businessLine" :class="{ mine: isPreferred(project) }">
                {{ project.businessLine }}
              </span>
              <span v-if="project.customerId">customer {{ project.customerId }}</span>
              <span v-if="project.costCentre && project.costCentre !== '0'">
                cc {{ project.costCentre }}
              </span>
            </span>
          </button>
        </li>
      </ul>
      <p v-else class="muted none">{{ t('picker.noResults') }}</p>
      <footer>
        <span class="muted hint">{{ t('picker.hint') }}</span>
        <button type="button" class="btn" @click="clear">{{ t('picker.clear') }}</button>
        <button type="button" class="btn" @click="open = false">{{ t('common.cancel') }}</button>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.picker {
  position: relative;
}

.trigger {
  width: 100%;
  text-align: left;
  background: var(--white);
  border: 1px solid var(--warm-grey);
  border-radius: var(--radius);
  padding: 5px 7px;
  min-height: 30px;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.trigger.empty {
  border-style: dashed;
}

.trigger.invalid {
  border-color: var(--orange);
  background: var(--open);
}


.placeholder {
  color: var(--grey);
}

.panel {
  position: fixed;
  z-index: 20;
  display: flex;
  flex-direction: column;
  max-height: var(--panel-room);
  background: var(--white);
  border: 1px solid var(--smart-blue);
  border-radius: var(--radius);
  padding: 10px;
}

.results {
  list-style: none;
  margin: 8px 0 0;
  padding: 0;
  max-height: 320px;
  /* The search field and the footer keep their height so this is what gives
     way when the panel is capped. A flex item will not shrink below its
     content without it. */
  min-height: 0;
  overflow-y: auto;
}

.results button {
  display: grid;
  grid-template-columns: 92px 1fr;
  gap: 2px 10px;
  width: 100%;
  text-align: left;
  background: none;
  border: 0;
  border-radius: var(--radius);
  padding: 6px 8px;
}

/* The highlight is what Enter takes so it has to be obvious. */
.results button.active {
  background: var(--open);
  box-shadow: inset 0 0 0 1px var(--orange);
}

.results button.preferred {
  box-shadow: inset 2px 0 0 var(--orange);
}

.results button.active.preferred {
  box-shadow:
    inset 2px 0 0 var(--orange),
    inset 0 0 0 1px var(--orange);
}

.id {
  color: var(--smart-blue);
  font-weight: 600;
}

.title {
  font-weight: 500;
}

.meta {
  grid-column: 2;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  color: var(--grey);
  font-size: 12px;
}

.kind {
  background: var(--warm-grey);
  border-radius: 3px;
  padding: 0 5px;
}

.meta .mine {
  color: var(--smart-blue);
  font-weight: 600;
}

.none {
  margin: 12px 4px;
}

footer {
  display: flex;
  align-items: center;
  gap: 8px;
  justify-content: flex-end;
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid var(--warm-grey);
}

.hint {
  margin-right: auto;
  font-size: 11px;
}
</style>
