#!/usr/bin/env python3
"""Turns a curl command into the ffmpeg command that sends the same headers.

Browsers give a curl command through Copy as cURL. ffmpeg wants one string with
the headers joined by carriage return and newline. Doing that by hand is where
the mistakes come from.

    curl2ffmpeg.py saved.txt
    pbpaste | curl2ffmpeg.py --shell powershell
    curl2ffmpeg.py saved.txt --drop Accept-Encoding --out clip.mkv

Reads a file or standard input. Accepts the bash flavour and the Windows cmd
flavour that uses carets.
"""

import argparse
import re
import shlex
import sys

# Headers curl adds or the browser sends that ffmpeg must never be given.
#
# Hop by hop headers belong to one connection and ffmpeg makes its own. A
# content length would describe a body that is not being sent.
NEVER = {"host", "content-length", "transfer-encoding", "upgrade", "proxy-connection"}

# ffmpeg reads gzip and deflate. It does not read brotli or zstd. Asking for
# them can bring back bytes it cannot turn into a playlist.
CANNOT_DECODE = {"br", "zstd"}


def clean(text):
    """Puts a copied command back on one line whichever shell it came from."""
    # Windows cmd wraps every quote in a caret and ends lines with one.
    text = text.replace('^"', '"').replace("^\n", " ").replace("^\r\n", " ")
    # bash and PowerShell continue lines with a backslash or a backtick.
    text = re.sub(r"[\\`]\s*\n", " ", text)
    return " ".join(text.split())


def read_curl(text):
    """Pulls the address and the headers out of a curl command."""
    words = shlex.split(clean(text))
    if not words or "curl" not in words[0].lower():
        raise SystemExit("that does not start with curl")

    url = None
    headers = []
    i = 1
    while i < len(words):
        word = words[i]
        if word in ("-H", "--header"):
            i += 1
            if i < len(words):
                headers.append(words[i])
        elif word in ("-A", "--user-agent"):
            i += 1
            if i < len(words):
                headers.append(f"User-Agent: {words[i]}")
        elif word in ("-e", "--referer"):
            i += 1
            if i < len(words):
                headers.append(f"Referer: {words[i]}")
        elif word in ("-b", "--cookie"):
            i += 1
            if i < len(words):
                headers.append(f"Cookie: {words[i]}")
        elif word.startswith("-"):
            # Everything else curl takes is about curl rather than the request.
            if word in ("--data", "-d", "--data-raw", "--form", "-F", "-o", "--output"):
                i += 1
        elif url is None:
            url = word
        i += 1

    if url is None:
        raise SystemExit("no address found in that command")
    return url, headers


def keep(headers, drop):
    """Throws out what ffmpeg must not be given and what was asked to go."""
    asked = {d.lower() for d in drop}
    out = []
    for header in headers:
        name = header.split(":", 1)[0].strip().lower()
        if name in NEVER or name in asked:
            continue
        out.append(header.strip())
    return out


def warn_about(headers):
    """Says what is likely to bite before it does."""
    said = []
    for header in headers:
        name, _, value = header.partition(":")
        if name.strip().lower() == "accept-encoding":
            asked = {v.strip().lower() for v in value.split(",")}
            trouble = sorted(asked & CANNOT_DECODE)
            if trouble:
                said.append(
                    f"Accept-Encoding asks for {' and '.join(trouble)} which ffmpeg "
                    "cannot decode. Drop it with --drop Accept-Encoding if the "
                    "playlist comes back garbled."
                )
    return said


def as_bash(url, headers, out, extra):
    lines = ["H=''"]
    for header in headers:
        body = header.replace("'", "'\\''")
        lines.append(f"H+=$'{body}\\r\\n'")
    lines.append("")
    lines.append("ffmpeg -headers \"$H\" \\")
    for flag in extra:
        lines.append(f"  {flag} \\")
    lines.append(f"  -i '{url}' \\")
    lines.append(f"  -c copy -movflags +faststart {out}")
    return "\n".join(lines)


def as_powershell(url, headers, out, extra):
    lines = ['$H = ""']
    for header in headers:
        body = header.replace('"', '`"')
        lines.append(f'$H += "{body}`r`n"')
    lines.append("")
    lines.append("ffmpeg -headers $H `")
    for flag in extra:
        lines.append(f"  {flag} `")
    lines.append(f'  -i "{url}" `')
    lines.append(f"  -c copy -movflags +faststart {out}")
    return "\n".join(lines)


def main():
    ask = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ask.add_argument("file", nargs="?", help="a file holding the curl command")
    ask.add_argument("--shell", choices=("bash", "powershell"), default="bash")
    ask.add_argument("--out", default="out.mp4", help="what to write")
    ask.add_argument(
        "--drop", action="append", default=[], help="a header to leave out. May repeat"
    )
    ask.add_argument(
        "--plain",
        action="store_true",
        help="leave out the reconnect and keep alive options",
    )
    said = ask.parse_args()

    text = open(said.file).read() if said.file else sys.stdin.read()
    url, headers = read_curl(text)
    headers = keep(headers, said.drop)
    if not headers:
        print("# no headers to carry over", file=sys.stderr)

    extra = []
    if not said.plain:
        extra = [
            "-multiple_requests 1",
            "-reconnect 1 -reconnect_streamed 1 -reconnect_delay_max 5",
        ]

    write = as_bash if said.shell == "bash" else as_powershell
    print(write(url, headers, said.out, extra))

    for note in warn_about(headers):
        print(f"\n# {note}", file=sys.stderr)
    # cmd cannot build a string holding a carriage return without a fight.
    if said.shell == "powershell":
        print("# use PowerShell rather than cmd. cmd cannot make the line breaks.",
              file=sys.stderr)


if __name__ == "__main__":
    main()
