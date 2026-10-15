"""Copy only the generated build; public assets stay in their single shared folder."""
from pathlib import Path
import shutil
root=Path(__file__).resolve().parents[1]
assert (root/'dist/index.html').is_file(), 'Run npm run build first'
dest=root/'playable'
if dest.exists():shutil.rmtree(dest)
dest.mkdir();shutil.copy(root/'dist/index.html',dest/'index.html');(dest/'assets').mkdir()
for f in (root/'dist/assets').glob('index-*'):shutil.copy(f,dest/'assets'/f.name)
print('playable updated; assets shared from public/')
