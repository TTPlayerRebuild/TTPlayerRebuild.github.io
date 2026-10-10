"""Generate the browser's CP936 codec from Windows NLS, without best-fit encoding.

Run on Windows: python scripts/generate-cp936.py
This is a data-generation tool; Pages builds use the checked-in output.
"""
import ctypes
import json
import struct
from pathlib import Path

kernel = ctypes.WinDLL('kernel32', use_last_error=True)
decode = kernel.MultiByteToWideChar
decode.argtypes = [ctypes.c_uint, ctypes.c_ulong, ctypes.c_char_p, ctypes.c_int,
                   ctypes.c_wchar_p, ctypes.c_int]
encode = kernel.WideCharToMultiByte
encode.argtypes = [ctypes.c_uint, ctypes.c_ulong, ctypes.c_wchar_p, ctypes.c_int,
                   ctypes.c_char_p, ctypes.c_int, ctypes.c_char_p, ctypes.POINTER(ctypes.c_int)]
inverse = {i: i for i in range(128)}
single = {}
table = []
wide = ctypes.create_unicode_buffer(2)
for byte in range(128, 256):
    if decode(936, 8, bytes([byte]), 1, wide, 2) == 1:
        single[byte] = ord(wide[0])
        inverse[ord(wide[0])] = byte
for lead in range(0x81, 0xff):
    for trail in range(0x40, 0xff):
        if trail == 0x7f:
            continue
        point = ord(wide[0]) if decode(936, 8, bytes([lead, trail]), 2, wide, 2) == 1 else 0
        table.append(point)
        if point:
            inverse[point] = (lead << 8) | trail

overrides = []
output = ctypes.create_string_buffer(8)
for point in range(0x10000):
    substituted = ctypes.c_int()
    size = encode(936, 0x400, chr(point), 1, output, 8, None, ctypes.byref(substituted))
    value = int.from_bytes(output.raw[:size], 'big') if size and not substituted.value else None
    if inverse.get(point) != value:
        overrides.append([point, value])
assets = Path(__file__).resolve().parent.parent / 'public' / 'assets'
(assets / 'cp936.bin').write_bytes(struct.pack('<' + 'H' * len(table), *table))
(assets / 'cp936.json').write_text(json.dumps({'single': single, 'overrides': overrides},
                                            separators=(',', ':')) + '\n', encoding='utf-8')
print(f'CP936: {len(table)} double-byte entries; {len(overrides)} encoding overrides.')
