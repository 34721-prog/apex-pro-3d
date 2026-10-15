"""Decode shipped MP3s and verify actual (not merely header) audio energy."""
from pathlib import Path
import json, subprocess, array, math, hashlib
root=Path(__file__).resolve().parents[1];m=json.loads((root/'public/assets/audio/manifest.json').read_text());rows=[]
for key,info in {**m['music'],**m['crowd']}.items():
 p=root/'public'/info['file'].lstrip('/');raw=subprocess.check_output(['ffmpeg','-v','error','-i',str(p),'-f','f32le','-acodec','pcm_f32le','-ar','24000','-ac',str(info['channels']),'-']);samples=array.array('f');samples.frombytes(raw);duration=len(samples)/24000/info['channels'];peak=max(abs(x) for x in samples);rms=math.sqrt(sum(x*x for x in samples)/len(samples));assert rms>.01 and peak<1 and abs(duration-info['duration'])<.1
 assert hashlib.sha256(p.read_bytes()).hexdigest()==info['sha256']
 rows.append({'id':key,'seconds':duration,'decodedPeak':peak,'decodedRMS':rms,'clippedSamples':sum(abs(x)>=1 for x in samples),'bytes':p.stat().st_size})
(root/'tests/performance/v07/audio-decoded.json').write_text(json.dumps(rows,indent=2)+'\n');print(json.dumps(rows,indent=2))
