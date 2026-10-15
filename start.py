"""Serve the compiled game and shared local assets; no third-party Python packages."""
import argparse
import functools
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit

parser = argparse.ArgumentParser(description='Apex Dynasty — servidor local')
parser.add_argument('--port', type=int, default=8080)
args = parser.parse_args()
root = Path(__file__).resolve().parent
folder = root / 'playable'
public = (root / 'public').resolve()
if not (folder / 'index.html').exists():
    raise SystemExit('Compilação não encontrada. Use npm ci && npm run build e copie dist para playable.')

class GameHandler(SimpleHTTPRequestHandler):
    def translate_path(self, path):
        compiled = Path(super().translate_path(path))
        if compiled.exists():
            return str(compiled)
        # The release stores assets once in public/, shared by source and build.
        relative = unquote(urlsplit(path).path).lstrip('/')
        asset = (public / relative).resolve()
        if relative.startswith('assets/') and public in asset.parents and asset.is_file():
            return str(asset)
        return str(compiled)

handler = functools.partial(GameHandler, directory=str(folder))
print(f'Apex Dynasty 0.10: http://localhost:{args.port}', flush=True)
print('Arquivos locais. Encerre com Ctrl+C.', flush=True)
with ThreadingHTTPServer(('0.0.0.0', args.port), handler) as server:
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
