#!/usr/bin/env python3
"""python3 -I scripts/sfx/oga-info.py slug...: title, author, licences and the licence line of OpenGameArt pages (for CREDITS.md)."""
import re
import subprocess
import sys

for slug in sys.argv[1:]:
    h = subprocess.run(['curl', '-sL', f'https://opengameart.org/content/{slug}'], capture_output=True, text=True).stdout
    title = re.search(r'<title>([^<]*)', h)
    title = title.group(1).replace(' | OpenGameArt.org', '').strip() if title else '?'
    users = re.findall(r'<a href="/users/([^"]+)"[^>]*class="username"[^>]*>([^<]+)</a>', h) or re.findall(r'<a href="/users/([^"]+)"[^>]*>([^<]+)</a>', h)
    lic = re.findall(r"license-name'>([^<]*)", h)
    j = h.find('License(s)')
    line = re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', ' ', h[j:j + 300]))[:80] if j >= 0 else '?'
    print(f'{slug}\n  title:  {title}\n  by:     {users[:2]}\n  licences: {lic}\n  line: {line}')
