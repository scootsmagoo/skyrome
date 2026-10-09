#!/usr/bin/env python3
"""Dump a Standard MIDI file as JSON notes: {tpq, tempo(us/beat), notes:[[startBeat, durBeats, midi, vel, track]]}.

python3 tools/music/midi-dump.py .cache/midi/seikilos.mid
"""
import json, struct, sys


def vlq(b, i):
    v = 0
    while True:
        c = b[i]
        i += 1
        v = (v << 7) | (c & 0x7F)
        if not c & 0x80:
            return v, i


def parse(path):
    b = open(path, 'rb').read()
    assert b[:4] == b'MThd'
    _, ntrk, tpq = struct.unpack('>HHH', b[8:14])
    i = 14
    notes = []
    tempos = []
    sigs = []
    for tr in range(ntrk):
        assert b[i:i + 4] == b'MTrk'
        n = struct.unpack('>I', b[i + 4:i + 8])[0]
        i += 8
        end = i + n
        t = 0
        run = 0
        on = {}
        while i < end:
            d, i = vlq(b, i)
            t += d
            s = b[i]
            if s == 0xFF:
                typ = b[i + 1]
                ln, j = vlq(b, i + 2)
                data = b[j:j + ln]
                i = j + ln
                if typ == 0x51:
                    tempos.append((t, int.from_bytes(data, 'big')))
                elif typ == 0x58:
                    sigs.append((t, data[0], 2 ** data[1]))
                continue
            if s in (0xF0, 0xF7):
                ln, j = vlq(b, i + 1)
                i = j + ln
                continue
            if s & 0x80:
                run = s
                i += 1
            st = run & 0xF0
            if st in (0xC0, 0xD0):
                i += 1
                continue
            a, c = b[i], b[i + 1]
            i += 2
            ch = run & 0x0F
            if st == 0x90 and c > 0:
                on[(ch, a)] = (t, c)
            elif st == 0x80 or (st == 0x90 and c == 0):
                if (ch, a) in on:
                    t0, v = on.pop((ch, a))
                    notes.append([t0 / tpq, (t - t0) / tpq, a, v, tr])
    notes.sort()
    return {'tpq': tpq, 'tempos': tempos, 'sigs': sigs, 'notes': notes}


if __name__ == '__main__':
    print(json.dumps(parse(sys.argv[1])))
