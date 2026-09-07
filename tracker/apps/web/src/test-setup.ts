// jsdom implements neither window.scrollTo nor Element.scrollIntoView. The
// router calls the first when it restores position and the cost centre picker
// calls the second when the highlight moves. Both are stubbed so a missing
// browser method does not read as a failure.

import { afterEach, vi } from 'vitest'
import { enableAutoUnmount } from '@vue/test-utils'

vi.stubGlobal('scrollTo', vi.fn())
Element.prototype.scrollIntoView = vi.fn()

// A component left mounted keeps its watchers. The store is a module singleton
// so every abandoned grid re-rendered on every change a later test made and the
// suite grew slower with each test. This retires them as each test ends.
enableAutoUnmount(afterEach)
