"""Reads a PE file and reports the machine and subsystem and the DLLs it imports."""
import struct, sys

MACHINE = {0x8664: "x86-64", 0x14c: "x86", 0xaa64: "arm64"}
SUBSYS = {2: "windows (no console)", 3: "console"}

def main(path):
    d = open(path, "rb").read()
    pe = struct.unpack_from("<I", d, 0x3c)[0]
    assert d[pe:pe+4] == b"PE\0\0", "not a PE file"
    machine, nsec, _, _, _, optsize, _ = struct.unpack_from("<HHIIIHH", d, pe+4)
    opt = pe + 24
    magic = struct.unpack_from("<H", d, opt)[0]
    plus = magic == 0x20b
    subsystem = struct.unpack_from("<H", d, opt + (68 if plus else 68))[0]
    ddir = opt + (112 if plus else 96)
    imp_rva, imp_size = struct.unpack_from("<II", d, ddir + 8)

    secs = []
    off = opt + optsize
    for i in range(nsec):
        name, vsize, vaddr, rsize, raddr = struct.unpack_from("<8sIIII", d, off + i*40)
        secs.append((vaddr, vsize, raddr))

    def at(rva):
        for vaddr, vsize, raddr in secs:
            if vaddr <= rva < vaddr + max(vsize, 1):
                return raddr + (rva - vaddr)
        return None

    print(f"machine     {MACHINE.get(machine, hex(machine))}")
    print(f"subsystem   {SUBSYS.get(subsystem, subsystem)}")
    print("imports")
    p = at(imp_rva)
    seen = []
    while p:
        fields = struct.unpack_from("<IIIII", d, p)
        if not any(fields):
            break
        nm = at(fields[3])
        if nm is None:
            break
        end = d.index(b"\0", nm)
        seen.append(d[nm:end].decode())
        p += 20
    for s in sorted(seen, key=str.lower):
        print("  ", s)

main(sys.argv[1])
