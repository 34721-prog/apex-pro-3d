"""Build a complete, cache-free release. Run from any directory."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
import argparse, hashlib, json

parser=argparse.ArgumentParser()
parser.add_argument('--output',type=Path)
args=parser.parse_args()
root=Path(__file__).resolve().parents[1]
version=json.loads((root/'package.json').read_text())['version']
output=args.output or root.parent/f'Apex-Dynasty-v{version}-Cenarios.zip'
prefix=f'Apex-Dynasty-v{version}'
root_files={'vercel.json','.vercelignore','README.md','package.json','package-lock.json','index.html','vite.config.js','playwright.config.js','start.py','requirements-assets.txt','requirements-audio.txt','.gitignore'}
docs={'AUDITORIA-CENARIOS-v010.md','CENARIOS-v010.md','AUDITORIA-MOVIMENTO-v09.md','MOVIMENTO-v09.md','AUDITORIA-v081.md','CORRECOES-v081.md','VERCEL.md','ENTREGA-v08.md','AUDITORIA-v08.md','VALIDACAO-PACOTE-v08.md','CORRECAO-SOMBRAS.md','AUDITORIA-SOMBRAS.md','VALIDACAO-SOMBRAS.md','ENTREGA-v07.md','AUDITORIA-v07.md','VALIDACAO-PACOTE-v07.md','ENTREGA-v05.md','AUDITORIA-v05.md','VALIDACAO-PACOTE-v05.md','ASSETS.md','ASSETS.csv','CIRCUITOS-v04.csv','VALIDACAO-PACOTE.md'}
proofs={'before-simulation.json','after-simulation.json','before-render-fixed.json','after-render-fixed.json','before-hud.json','after-hud.json','summary.json','direction-before.json','direction-after.json','geometry.json','track-pit-matrix.json','browser-circuit-matrix.json','resolution-matrix.json','final-logic.txt','final-browser.txt','final-build.txt','assets.txt','browser-results-source.json','extracted-logic.txt','extracted-browser.txt','extracted-build.txt','extracted-install.txt','extracted-assets.txt','browser-results-extracted.json','package-validation.json','hud-1366x768.png','hud-1920x1080.png','hud-1600x900.png','hud-1280x720.png','hud-768x1024.png','hud-390x844.png','strategy-open.png','circuit-selector.png'}
proofs05={'summary.json','before-simulation.json','after-simulation.json','before-render-fixed.json','after-render-fixed.json','grid-performance.json','final-logic.txt','final-browser.txt','final-build.txt','assets.txt','seasons.json','safety-car-matrix.json','competitions.png','competitions-mobile.png','official-results.png','season-complete.png','safety-car.png','production-new-browser.txt','mobile-fixed-test.txt','extracted-logic.txt','extracted-browser.txt','extracted-build.txt','extracted-install.txt','extracted-assets.txt','browser-results-extracted.json','package-validation.json'}
proofs07={'before-render-fixed.json','before-simulation.json','after-render-fixed.json','after-simulation.json','summary.json','venue-clearance.json','venue-inspection.json','venue-inspection.txt','resources-browser.json','audio-browser.json','crowd-browser.json','audio-decoded.json','audio-decoded.txt','media-navigation.json','final-logic.txt','final-browser.txt','final-browser-followup.txt','final-build.txt','assets.txt','live-board.png','browser-results-source.json','extracted-logic.txt','extracted-browser.txt','extracted-install.txt','extracted-build.txt','extracted-assets.txt','browser-results-extracted.json','package-validation.json'}
legacy_proofs={'camera-quality-matrix.json','resource-lifecycle.json','pit-matrix.json'}
files=[]
for p in sorted(root.rglob('*')):
    if not p.is_file():continue
    r=p.relative_to(root)
    if any(part in {'node_modules','dist','.git','.cache','.npm','__pycache__','test-results','playwright-report'} for part in r.parts):continue
    allowed=(len(r.parts)==1 and r.name in root_files) or r.parts[0] in {'src','public','licenses'}
    if r.parts[0]=='playable':
        allowed=not (root/'public'/Path(*r.parts[1:])).is_file()
    if r.parts[0]=='scripts':allowed=p.suffix in {'.js','.py'}
    if r.parts[0]=='docs':allowed=len(r.parts)==2 and r.name in docs
    if r.parts[0]=='tests':
        allowed=(len(r.parts)==2 and p.suffix=='.js') or (r.parts[:3]==('tests','performance','v04') and r.name in proofs) or (r.parts[:3]==('tests','performance','v05') and r.name in proofs05) or (r.parts[:3]==('tests','performance','v03') and r.name in legacy_proofs) or (r.parts[:3]==('tests','performance','v07') and (r.name in proofs07 or (len(r.parts)==5 and r.parts[3]=='visual' and p.suffix=='.jpg')))
    if r.parts[:3]==('tests','performance','shadows'):
        allowed=p.suffix in {'.json','.txt','.jpg','.png'} and r.name not in {'format.txt','browser-new.txt','browser-followup.txt','browser-pixels.txt','node-new.txt','build-initial.txt'}
    # Historical screenshots remain in their original release ZIPs, not duplicated.
    if r.parts[:2]==('tests','performance') and len(r.parts)>2 and r.parts[2]!='v08' and p.suffix in {'.jpg','.png'}:allowed=False
    if r.parts[:3]==('tests','performance','v08'):
        allowed=p.suffix in {'.json','.txt','.jpg'} and r.name not in {'format.txt','node-first.txt','browser-manager-first.txt','browser-regression-first.txt','browser-followup.txt'}
    if r.parts[:3]==('tests','performance','v081'):
        allowed=p.suffix in {'.json','.txt','.jpg','.svg'}
    if r.parts[:3]==('tests','performance','v09'):
        allowed=p.suffix in {'.json','.txt','.jpg','.png','.mp4','.webm'}
    if r.parts[:3]==('tests','performance','environment'):
        # Keep final evidence, not partial/interrupted runner logs from recovery attempts.
        allowed=p.suffix in {'.json','.txt','.jpg','.html'} and 'review' not in r.parts and r.name not in {'browser-interrupted.txt','browser-tests.txt','browser-tests-final.txt','benchmark-after.txt'}
    if allowed:files.append((p,r))
# Code/assets/build/tests/config are frozen for extracted-copy verification.
payload={str(r):hashlib.sha256(p.read_bytes()).hexdigest() for p,r in files if r.parts[0] not in {'docs'} and not (r.parts[0]=='tests' and 'performance' in r.parts)}
manifest={'version':version,'prefix':prefix,'sha256':payload}
output.parent.mkdir(parents=True,exist_ok=True)
with ZipFile(output,'w',ZIP_DEFLATED,compresslevel=6) as z:
    for p,r in files:z.write(p,str(Path(prefix)/r))
    z.writestr(prefix+'/PAYLOAD-MANIFEST.json',json.dumps(manifest,indent=2)+'\n')
with ZipFile(output) as z:
    assert z.testzip() is None
    names=z.namelist();assert len(names)==len(set(names))
    for needed in ['src/core/Game.js','src/ui/RaceHUD.js','src/data/tracks.js','public/assets/logo-primary.png','playable/index.html','package-lock.json','tests/v04.test.js','tests/v04.spec.js','tests/v07.test.js','tests/v07.spec.js','public/assets/audio/menu.mp3','public/assets/audio/LICENSE-AUDIO.txt','src/venue/VenueVisuals.js','src/graphics/DynamicShadows.js','tests/shadows.spec.js','src/strategy/StrategyDirector.js','tests/manager.test.js','tests/manager.spec.js','start.py']:
        assert prefix+'/'+needed in names,needed
    assert not any('/node_modules/' in n or '/.git/' in n or '/dist/' in n for n in names)
print(json.dumps({'file':str(output),'files':len(files)+1,'bytes':output.stat().st_size,'sha256':hashlib.sha256(output.read_bytes()).hexdigest()},indent=2))
