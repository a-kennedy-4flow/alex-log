// The toggle.
//
// It stays a checkbox underneath so a label click and the space key and the
// focus ring all come free. `role="switch"` is what makes a screen reader read
// it as on or off rather than as ticked or unticked. This pins both because
// losing either would look like nothing on screen.

import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'

import { i18n } from '@/i18n'
import ToggleSwitch from '@/components/ToggleSwitch.vue'
import SetupForm from '@/components/SetupForm.vue'
import { profile } from '@/composables/useTimesheet'

const plugins = [i18n]

describe('the toggle', () => {
  it('reads as a switch rather than as a checkbox', () => {
    const wrapper = mount(ToggleSwitch, { props: { modelValue: true } })
    const input = wrapper.get('input')
    expect(input.attributes('role')).toBe('switch')
    expect(input.attributes('type')).toBe('checkbox')
  })

  it('carries the state it was given', () => {
    expect(mount(ToggleSwitch, { props: { modelValue: true } }).get('input').element.checked).toBe(
      true,
    )
    expect(mount(ToggleSwitch, { props: { modelValue: false } }).get('input').element.checked).toBe(
      false,
    )
  })

  it('reports a change once', async () => {
    const wrapper = mount(ToggleSwitch, { props: { modelValue: false } })
    await wrapper.get('input').setValue(true)
    expect(wrapper.emitted('update:modelValue')).toEqual([[true]])
  })

  it('draws no control of its own beyond the input', () => {
    // A wrapper element would break the label click that comes free here.
    const wrapper = mount(ToggleSwitch, { props: { modelValue: false } })
    expect(wrapper.element.tagName).toBe('INPUT')
  })
})

describe('the monthly reminder', () => {
  it('is a toggle on the settings page', async () => {
    profile.remindByEmail = true
    const wrapper = mount(SetupForm, { global: { plugins } })
    const toggle = wrapper.get('[role="switch"]')
    expect(toggle.element.getAttribute('type')).toBe('checkbox')

    await toggle.setValue(false)
    expect(profile.remindByEmail).toBe(false)
    profile.remindByEmail = true
  })
})
