// Builds a Game Boy Advance cartridge from nothing. Every byte is produced
// here. No toolchain is needed and no third party data is included.
//
// The cartridge puts the display into mode 3 then paints the framebuffer with a
// two axis colour ramp. Red climbs across and green climbs down. That gives the
// headless test something unmistakable to look for.
import { writeFileSync } from "node:fs";

// ---------------------------------------------------------------- assembler
// Just enough ARM7TDMI to write the program below.

const COND = { al: 0xe, ne: 0x1 };
const OP = { sub: 2, orr: 12, mov: 13 };
const SHIFT = { lsl: 0, lsr: 1 };

// ARM cannot carry an arbitrary literal. An operand is an 8 bit field rotated
// right by an even amount so the value has to be rebuilt as one.
function imm12(value) {
  for (let rot = 0; rot < 16; rot++) {
    const bits = rot * 2;
    const rolled = bits === 0 ? value >>> 0 : ((value << bits) | (value >>> (32 - bits))) >>> 0;
    if (rolled <= 0xff) return (rot << 8) | rolled;
  }
  throw new Error(`0x${value.toString(16)} is not an ARM immediate`);
}

const dataImm = (op, rd, rn, value, s = 0) =>
  ((COND.al << 28) | (1 << 25) | (OP[op] << 21) | (s << 20) | (rn << 16) | (rd << 12) | imm12(value)) >>> 0;

const dataReg = (op, rd, rn, rm, shift, amount) =>
  ((COND.al << 28) | (OP[op] << 21) | (rn << 16) | (rd << 12) | (amount << 7) | (SHIFT[shift] << 5) | rm) >>> 0;

const str = (rd, rn) => (0xe5800000 | (rn << 16) | (rd << 12)) >>> 0;

// Post indexed so the destination register walks the framebuffer by itself.
const strhPost = (rd, rn, offset) =>
  (0xe0c000b0 | (rn << 16) | (rd << 12) | ((offset & 0xf0) << 4) | (offset & 0x0f)) >>> 0;

// Offsets are counted in words from the instruction after next.
const branch = (from, to, cond = "al") =>
  ((COND[cond] << 28) | (0b1010 << 24) | ((to - from - 2) & 0xffffff)) >>> 0;

// ------------------------------------------------------------------ program
// r0 walks VRAM. r2 counts rows. r3 counts columns. r4 holds the colour.

const ROW = 6;
const COL = 7;
const HALT = 15;

const program = [
  /*  0 */ dataImm("mov", 0, 0, 0x04000000),       // r0 = the IO registers
  /*  1 */ dataImm("mov", 1, 0, 0x400),            // BG2 on
  /*  2 */ dataImm("orr", 1, 1, 3),                // mode 3
  /*  3 */ str(1, 0),                              // DISPCNT = 0x0403
  /*  4 */ dataImm("mov", 0, 0, 0x06000000),       // r0 = the framebuffer
  /*  5 */ dataImm("mov", 2, 0, 160),              // 160 rows
  /*  6 */ dataImm("mov", 3, 0, 240),              // 240 columns
  /*  7 */ dataReg("mov", 4, 0, 2, "lsr", 3),      // row / 8
  /*  8 */ dataReg("mov", 4, 0, 4, "lsl", 5),      // into the green field
  /*  9 */ dataReg("orr", 4, 4, 3, "lsr", 3),      // column / 8 into the red field
  /* 10 */ strhPost(4, 0, 2),                      // paint one pixel and step on
  /* 11 */ dataImm("sub", 3, 3, 1, 1),             // subs r3, r3, #1
  /* 12 */ branch(12, COL, "ne"),
  /* 13 */ dataImm("sub", 2, 2, 1, 1),             // subs r2, r2, #1
  /* 14 */ branch(14, ROW, "ne"),
  /* 15 */ branch(HALT, HALT),                     // stop here
];

// ------------------------------------------------------------------- header
// A branch at 0x00 over the header. The fixed 0x96 at 0xB2. A checksum at 0xBD.
// The boot logo field at 0x04 is left as zeros. Only the real BIOS reads it and
// mGBA starts the cartridge directly.

const ENTRY = 0xc0;
// A real cartridge runs from 4 MiB to 32 MiB. The size is settable so the
// pipeline can be tested at the sizes that actually ship.
const megabytes = Number(process.argv[3] ?? 0.25);
const rom = Buffer.alloc(Math.round(megabytes * 1024 * 1024));

rom.writeUInt32LE(branch(0, ENTRY / 4), 0x00);
rom.write("RAMPTEST", 0xa0, "ascii");
rom.write("RMPE", 0xac, "ascii");
rom.write("00", 0xb0, "ascii");
rom[0xb2] = 0x96;

let check = 0;
for (let at = 0xa0; at <= 0xbc; at++) check = (check + rom[at]) & 0xff;
rom[0xbd] = (-(check + 0x19)) & 0xff;

program.forEach((word, i) => rom.writeUInt32LE(word, ENTRY + i * 4));

const out = process.argv[2];
writeFileSync(out, rom);
console.log(`${out}: ${rom.length} bytes, ${program.length} instructions at 0x${ENTRY.toString(16)}`);
console.log(program.map((w) => w.toString(16).padStart(8, "0")).join(" "));
