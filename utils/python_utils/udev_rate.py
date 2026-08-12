#!/usr/bin/env python3
import sys
import subprocess
import re

# Use universal_newlines for compatibility with older Python 3 versions
p = subprocess.Popen(
    ['sudo', 'udevadm', 'monitor', '--kernel', '--udev'],
    stdout=subprocess.PIPE,
    universal_newlines=True
)

pat = re.compile(r'\[([0-9]+)\.([0-9]+)\]')
counts = {}
last_print = None

try:
    for line in p.stdout:
        m = pat.search(line)
        if not m:
            continue
        sec = int(m.group(1))
        counts[sec] = counts.get(sec, 0) + 1
        if last_print is None:
            last_print = sec
        if sec != last_print:
            print(f"{last_print}: {counts[last_print]} events/s", flush=True)
            last_print = sec
except KeyboardInterrupt:
    pass
finally:
    try:
        p.terminate()
    except Exception:
        pass
