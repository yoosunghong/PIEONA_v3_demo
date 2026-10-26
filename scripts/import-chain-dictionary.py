"""Generate the server-only word list from the documented public CSV archive."""
import csv
import hashlib
import io
from pathlib import Path
import re
import sys
import zipfile

archive = Path(sys.argv[1]).read_bytes()
with zipfile.ZipFile(io.BytesIO(archive)) as source:
    content = source.read('kr_korean.csv').decode('utf-8-sig')
words = set()
for word, part in csv.reader(io.StringIO(content)):
    # Nouns only; remove dictionary compound markers, exclude phrases and affixes.
    if part != '명사' or word.startswith('-') or '^' in word:
        continue
    word = word.replace('-', '')
    if re.fullmatch('[가-힣]{2,200}', word):
        words.add(word)
destination = Path(__file__).resolve().parents[1] / 'server' / 'dictionaries'
destination.mkdir(exist_ok=True)
(destination / 'korean-nouns.txt').write_text('\n'.join(sorted(words)) + '\n', encoding='utf-8')
print(f'{len(words)} nouns; source archive SHA-256: {hashlib.sha256(archive).hexdigest()}')
