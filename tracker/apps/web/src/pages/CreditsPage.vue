<script setup lang="ts">
// The credits. The footer is the way in.
//
// The roll runs once rather than looping. Because a) a short list is read in a
// breath. b) a loop asks the reader to catch a moving line. c) the drift behind
// them already says the screen is alive.

import { useI18n } from 'vue-i18n'

import BrandMark from '@/components/BrandMark.vue'

const { t } = useI18n()

/**
 * The roll. A role is written as it is shown and is not translated. Because a)
 * the names beside it are not translated either. b) a role here names one
 * contribution by one person rather than a term the product uses. c) a line
 * with no role is a thank you.
 */
const PEOPLE: { role?: string; name: string }[] = [
  { role: 'Idea and Implimentation', name: 'Alex Kennedy' },
  { role: 'With many thanks too', name: 'Jannik Wieser, Markus Richter, Thomas Fuhrwerk, Markus Lunke, Vladimer Gogia.'},
  { role: 'AI of choice', name: 'Claude Code models 4.8-5.1' }
]

/**
 * The motes drifting up the stage. Each one is placed from its index rather
 * than from a random number so every visit draws the same field.
 */
const MOTES = Array.from({ length: 16 }, (_, at) => ({
  left: (at * 61) % 97,
  size: 3 + (at % 3),
  delay: (at % 8) * 1100,
  span: 11000 + (at % 4) * 2600,
}))
</script>

<template>
  <section class="stage sheet pad">
    <div class="sky" aria-hidden="true">
      <span class="glow first"></span>
      <span class="glow second"></span>
      <span
        v-for="(mote, at) in MOTES"
        :key="at"
        class="mote"
        :style="{
          left: `${mote.left}%`,
          width: `${mote.size}px`,
          height: `${mote.size}px`,
          animationDelay: `${mote.delay}ms`,
          animationDuration: `${mote.span}ms`,
        }"
      ></span>
    </div>

    <div class="roll">
      <BrandMark class="hero" />
      <h1>{{ t('credits.title') }}</h1>
      <p class="intro">{{ t('credits.intro') }}</p>

      <ol class="people">
        <li v-for="(person, at) in PEOPLE" :key="at" :style="{ '--at': String(at) }">
          <!-- Rendered even when it is empty. The cell is what holds the names
               in one column. -->
          <span class="role">{{ person.role }}</span>
          <span class="name">{{ person.name }}</span>
        </li>
      </ol>

      <p class="tail">{{ t('credits.tail') }}</p>
    </div>
  </section>
</template>

<style scoped>
/*
 * A stage rather than a band. The Smart Blue ground is the one surface in the
 * theme that reads as a screen of its own and it already carries its own text
 * colours.
 */
.stage {
  position: relative;
  overflow: hidden;
  min-height: 68vh;
  display: grid;
  align-content: center;
  background: var(--smart-blue);
  color: var(--white);
  --mark-body: var(--white);
  --mark-accent: var(--orange);
}

.sky {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

/* Two lights crossing behind the roll. Wide and washed so no edge shows. */
.glow {
  position: absolute;
  width: 620px;
  height: 620px;
  border-radius: 50%;
  opacity: 0.3;
  animation: drift 21s ease-in-out infinite alternate;
}

.glow.first {
  top: -300px;
  left: -170px;
  background: radial-gradient(circle at center, var(--bright-blue) 0%, transparent 62%);
}

.glow.second {
  right: -230px;
  bottom: -320px;
  background: radial-gradient(circle at center, var(--orange) 0%, transparent 62%);
  animation-duration: 27s;
  animation-delay: -9s;
}

/* Bold Pink is the one theme colour that reads as light on this ground. */
.mote {
  position: absolute;
  bottom: -10px;
  border-radius: 50%;
  background: var(--pink);
  opacity: 0;
  animation-name: rise;
  animation-timing-function: linear;
  animation-iteration-count: infinite;
}

.roll {
  position: relative;
  display: grid;
  justify-items: center;
  text-align: center;
  padding: 26px 0 30px;
}

.hero {
  width: 84px;
  height: 84px;
  animation: lift 6s ease-in-out infinite alternate;
}

.stage h1 {
  margin: 18px 0 0;
  font-size: clamp(30px, 6vw, 52px);
  letter-spacing: -0.02em;
}

.intro {
  margin: 8px 0 0;
  color: var(--on-blue-body);
  animation: enter 700ms ease-out 160ms both;
}

/*
 * The film arrangement. The role ends at the middle and the name starts there
 * so five rows read as one column of names against one column of labels.
 */
.people {
  list-style: none;
  margin: 34px 0 0;
  padding: 0;
  width: 100%;
  max-width: 620px;
  display: grid;
  gap: 15px;
}

.people li {
  display: grid;
  grid-template-columns: 1fr 1fr;
  align-items: baseline;
  gap: 0 24px;
  animation: enter 760ms cubic-bezier(0.16, 0.84, 0.24, 1) both;
  animation-delay: calc(var(--at) * 140ms + 320ms);
}

.role {
  text-align: right;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--on-blue-label);
}

.name {
  text-align: left;
  font-size: 19px;
  font-weight: 700;
}

.tail {
  margin: 34px 0 0;
  font-size: 13px;
  color: var(--on-blue-body);
  animation: enter 700ms ease-out 1240ms both;
}

/*
 * Every moving element is given its layer before it moves. Because a) a layer
 * built at the moment an animation starts costs the frames it opens with. b)
 * the roll starts one line after another inside a second so those costs land
 * together. c) the reader is watching the first line so that is where a
 * dropped frame shows.
 */
.glow,
.mote,
.hero,
.intro,
.people li,
.tail {
  will-change: transform, opacity;
}

@keyframes enter {
  from {
    opacity: 0;
    transform: translateY(14px);
  }
}

@keyframes lift {
  to {
    transform: translateY(-9px);
  }
}

@keyframes drift {
  to {
    transform: translate(90px, 60px) scale(1.15);
  }
}

@keyframes rise {
  from {
    transform: translateY(0);
    opacity: 0;
  }

  12% {
    opacity: 0.7;
  }

  86% {
    opacity: 0.7;
  }

  to {
    transform: translateY(-560px);
    opacity: 0;
  }
}

/*
 * The heading is painted from a gradient clipped to its letters. Declared where
 * motion is allowed so a reduced motion reader is left with plain white text.
 */
@media (prefers-reduced-motion: no-preference) {
  .stage h1 {
    background: linear-gradient(100deg, var(--white) 34%, var(--pink) 50%, var(--white) 66%);
    background-size: 260% 100%;
    background-clip: text;
    -webkit-background-clip: text;
    color: transparent;
    animation: sweep 5s ease-in-out 900ms infinite;
  }

  @keyframes sweep {
    from {
      background-position: 120% 0;
    }

    to {
      background-position: -90% 0;
    }
  }
}

/* Every name is on the page at rest so all of the motion goes. It is a reward
   here and it says nothing the text does not. */
@media (prefers-reduced-motion: reduce) {
  .sky {
    display: none;
  }

  .hero,
  .intro,
  .people li,
  .tail {
    animation: none;
    will-change: auto;
  }
}

/* Two columns need the width of both. Below it a credit is a label over a name. */
@media (max-width: 560px) {
  .people li {
    grid-template-columns: 1fr;
    gap: 2px;
  }

  .role,
  .name {
    text-align: center;
  }
}
</style>
