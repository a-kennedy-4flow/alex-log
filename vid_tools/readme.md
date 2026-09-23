# vidscale

Reads the resolution and the frame rate of an mp4. Offers the lower rungs of
both ladders. Encodes the file at what you pick.

## Requirements

ffmpeg on the path with libx264. Nothing else. The crate has no dependency.

## Build

    cargo build --release
    ./target/release/vidscale clip.mp4

### Windows

There is no mingw linker on this machine so zig links the Windows build.

    cargo install cargo-zigbuild        # once
    cargo zigbuild --release --target x86_64-pc-windows-gnu

The result is `target/x86_64-pc-windows-gnu/release/vidscale.exe`. It is a
console exe of about 500 kB that imports nothing beyond kernel32 and ntdll and
the Windows C runtime. No mingw dll travels with it. Copy the one file.

ffmpeg is still needed. `vidscale.exe` runs `ffmpeg` and Windows resolves that
to `ffmpeg.exe` on the PATH.

The msvc target wants the Microsoft libraries or cargo-xwin. Neither is here.
The gnu build has no dll of its own so there is nothing to gain from msvc.

## Use

Pick from the menus. The resolution comes first then the frame rate. Either one
can be left alone with `k`.

    $ vidscale holiday.mp4
    holiday.mp4
      resolution  1920 x 1080
      frame rate  60 fps
      file size   412.6 MB

    choose a resolution
       1)   900p  1600 x 900    69% of the pixels
       2)   720p  1280 x 720    44% of the pixels
       3)   576p  1024 x 576    28% of the pixels
       4)   480p   854 x 480    20% of the pixels
       5)   360p   640 x 360    11% of the pixels
       6)   240p   426 x 240     5% of the pixels
       c) another height
       k) keep 1920 x 1080
       q) quit
    > 2

    choose a frame rate
       1)     30 fps  keeps 1 frame in 2
       2)     24 fps  does not divide 60 so the motion stutters
       3)     15 fps  keeps 1 frame in 4
       4)     10 fps  keeps 1 frame in 6
       c) another rate
       k) keep 60 fps
       q) quit
    > 1

    encoding 1280 x 720 at 30 fps to holiday-720p-30fps.mp4
    holiday-720p-30fps.mp4 is 61.4 MB and that is 85% smaller

Or name what you want and skip the menus.

    vidscale holiday.mp4 --height 720 --fps 30

| option | what it does |
| --- | --- |
| `--height <n>` | Encode at this height. |
| `--fps <n>` | Encode at this frame rate. 10 is the minimum. |
| `--output <path>` | Where to write. Defaults to `<name>-<height>p-<n>fps.mp4` beside the source. |
| `--crf <n>` | x264 quality from 1 to 51. 18 is near lossless. 28 is small. Default 23. |
| `--preset <name>` | x264 speed from ultrafast to veryslow. Default medium. |
| `--list` | Print the resolution and the frame rate and the choices then stop. |
| `--dry-run` | Print the ffmpeg call then stop. |
| `--yes` | Overwrite the output when it already exists. |

The menus only appear when neither `--height` nor `--fps` is given. Either flag
alone leaves the other thing at the source.

## Which frame rate to take

The ladder is 30 and 24 and 15 and 10. Rates below the source are shown. 30 is
video. 24 is film. 15 holds up for a still picture. 10 is the minimum.

Take a rate that divides the source exactly. The menu marks those rows with the
share they keep such as 1 frame in 2. An exact divisor drops whole frames at an
even spacing so what is left runs at a steady pace. A rate that does not divide
the source has to drop frames unevenly. Two frames then one then two again is
what the eye reads as a stutter. 15 from a 30 fps source is even. 15 from a
29.97 fps source is not.

A source such as 25 or 29.97 has no exact row on a four row ladder. The menu
then names the exact half and `c` takes it. 12.5 for a 25 fps source. 14.985 for
a 29.97 one.

10 is the minimum. Below ten frames a second the eye stops reading the result as
movement and starts reading it as a slide show.

## Which to cut first

Cut the resolution when the size is all that matters. Halving the height takes
three quarters of the pixels away. Halving the frame rate takes about a third
off the size rather than half because the frames that are left are further
apart and each one then costs more to encode.

Cut the frame rate when the picture is still. A screen recording or a talking
head holds up at 15. Cut the resolution instead when the picture moves. Sport
and a panning camera lose more from a dropped frame than from a smaller frame.

## How it reads the file

An mp4 is a tree of boxes. Each one starts with its own size so the file can be
walked by seeking from header to header. vidscale takes moov then the first trak
whose hdlr says vide. The coded frame comes from stsd. The size a player draws
and the rotation come from tkhd. The frame rate is the sample count in stts over
the time those samples span in the units mdhd gives. It is a mean so a variable
rate source reports its average. Only the headers are read so the walk costs the
same on a file of any length. ffprobe is never called. Because a) ffmpeg is
already needed for the encode and a second process buys nothing b) the walk is
about a hundred lines and c) parsing the output of another tool is the weaker
contract.

## What it writes

x264 at the chosen height with lanczos resampling. Frames are dropped before
they are scaled so a dropped frame is never resampled. The audio is copied
without being touched. The index is moved to the front so the file plays before
it has finished downloading.

The width is left for ffmpeg to work out. Because a) ffmpeg has already applied
the rotation and the pixel shape by the time the filter runs b) the source shape
is then held exactly and c) x264 needs a width divisible by two.

## Two cases worth naming

A rotated phone clip is stored landscape with a matrix that turns it. vidscale
reports the size you see rather than the stored one. The encode bakes the turn
in so the output needs no matrix.

An anamorphic source has pixels that are not square. Its stored frame is
narrower than its picture. The menu offers the picture. A 480p pick on a 720x576
DVD rip gives a 600x480 frame that a player shows at 854x480.

## Tests

    cargo test

Thirty six tests. The mp4 ones build a header in memory and write it to a temp
file so no sample video is needed in the repo.
