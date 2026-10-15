"""Original Apex Dynasty synthesis. Optional build tools: numpy + ffmpeg, no samples."""
from pathlib import Path
import numpy as np, math, wave, subprocess, json, hashlib, tempfile
ROOT=Path(__file__).resolve().parents[1]; DEST=ROOT/'public/assets/audio'; DEST.mkdir(parents=True,exist_ok=True)
SR=24000
rng=np.random.default_rng(7307)
def hz(note): return 440*2**((note-69)/12)
def env(n,attack=.012,release=.1):
    a=np.ones(n); na=min(n//3,max(1,int(attack*SR))); nr=min(n//2,max(1,int(release*SR)));a[:na]=np.linspace(0,1,na);a[-nr:]=np.linspace(1,0,nr);return a

def voice(note,duration,kind):
    t=np.arange(int(duration*SR))/SR; f=hz(note)
    if kind=='bass': y=np.sin(2*np.pi*f*t)+.3*np.sin(4*np.pi*f*t)+.12*np.sin(6*np.pi*f*t);y*=np.exp(-t*1.8)
    elif kind=='pad': y=sum(np.sin(2*np.pi*f*(1+d)*t+idx*.3)/(idx+2) for idx,d in enumerate([-.004,0,.004]));y+=.12*np.sin(4*np.pi*f*t)
    elif kind=='lead': y=sum(np.sin(2*np.pi*f*k*t)*np.exp(-t*(3+k*.5))/k for k in [1,2,3,4,5]);
    else:y=np.sin(2*np.pi*f*t)*np.exp(-t*6)+.28*np.sin(2*np.pi*f*2*t)*np.exp(-t*12)
    return y*env(len(t),.08 if kind=='pad' else .006,.2 if kind=='pad' else .035)
def drum(kind):
    dur={'kick':.28,'snare':.17,'hat':.055,'open':.18}[kind];t=np.arange(int(dur*SR))/SR
    if kind=='kick': y=np.sin(2*np.pi*(47*t+9*(1-np.exp(-t*27))))*np.exp(-t*19)+rng.normal(0,.045,len(t))*np.exp(-t*95)
    elif kind=='snare': y=(rng.normal(0,.44,len(t))+.34*np.sin(2*np.pi*187*t))*np.exp(-t*25)
    else:
        noise=rng.normal(0,.3,len(t));y=(noise-np.roll(noise,1))*.45*np.exp(-t*(85 if kind=='hat' else 22))
    return y*env(len(t),.001,.014)
DRUM={k:drum(k) for k in ['kick','snare','hat','open']}
def render_music(key,bpm,bars,style):
    beat=60/bpm; duration=bars*4*beat; data=np.zeros((round(duration*SR),2));
    def add(sig,when,gain,pan=0):
        start=round(when*SR);n=min(len(sig),len(data)-start)
        if n<=0:return
        data[start:start+n,0]+=sig[:n]*gain*math.sqrt((1-pan)/2);data[start:start+n,1]+=sig[:n]*gain*math.sqrt((1+pan)/2)
    roots=[45,41,48,43] if style!='victory' else [48,43,45,41]
    melody=[0,7,12,10,7,3,7,12,14,12,7,3,5,7,3,0]
    for bar in range(bars):
        root=roots[(bar//2)%4];chord=[0,3 if root%12==9 else 4,7,10 if bar%8==7 else 12];section=(bar//8)%4
        for j,n in enumerate(chord[:3]):add(voice(root+24+n,beat*3.85,'pad'),bar*4*beat,.047 if style!='race' else .025,(j-1)*.5)
        for step in range(8):
            if style=='championship' and step%2:continue
            add(voice(root+(12 if step in [3,7] else 0),beat*.4,'bass'),(bar*4+step*.5)*beat,.20 if style not in ['selection','championship'] else .125)
        if style!='grid' or bar>0:
            for tick in range(8):
                add(DRUM['hat'],(bar*4+tick*.5)*beat,.11 if style!='race' else .065,.35 if tick%2 else -.35)
            for b in [0,2]+([2.75] if bar%4==3 else []):add(DRUM['kick'],(bar*4+b)*beat,.4 if style not in ['race','championship'] else .22)
            for b in [1,3]:add(DRUM['snare'],(bar*4+b)*beat,.18 if style not in ['selection','championship','race'] else .085,-.08)
        if style=='grid':
            for step in range(8+(bar//2)*2):add(DRUM['snare'],(bar*4+step*4/(8+(bar//2)*2))*beat,.055+bar*.012)
        else:
            for step in range(8):
                if style=='race' and step%3:continue
                if style=='championship' and step%2:continue
                octave=36 if style in ['selection','championship'] else 24
                interval=melody[(step+bar*3+section*4)%len(melody)]
                add(voice(root+octave+interval,beat*.43,'lead' if style in ['menu','victory'] else 'pluck'),(bar*4+step*.5)*beat,.065 if style!='race' else .033,math.sin(step*1.7)*.4)
        if bar%8==7:add(DRUM['open'],(bar*4+3.5)*beat,.08,.2)
    # Quiet stereo echoes add room without a sample/reverb library.
    for delay,amount in [(beat*.75,.16),(beat*1.5,.065)]:
        d=int(delay*SR);data[d:,0]+=data[:-d,1]*amount;data[d:,1]+=data[:-d,0]*amount
    data=np.tanh(data*1.2);data*=min(1,.78/np.max(np.abs(data)));fade=int(.008*SR);data[:fade]*=np.linspace(0,1,fade)[:,None];data[-fade:]*=np.linspace(1,0,fade)[:,None]
    return data,duration

def crowd(seconds,cheer=False):
    n=int(seconds*SR);t=np.arange(n)/SR;y=np.zeros(n)
    # Independent harmonic voice-like sources; no words or copied recordings.
    for i in range(65 if not cheer else 36):
        f=105+i*3.1+rng.uniform(-8,8);phase=2*np.pi*(f*t+1.7*np.sin(t*.6+i));voiced=sum(np.sin(phase*k)*math.exp(-((k*f-850)/700)**2)/k for k in range(1,13))
        mod=np.maximum(0,np.sin(t*(.3+i*.009)+i*1.76))**3
        y+=voiced*mod*.018
    noise=rng.normal(0,1,n);soft=np.convolve(noise,np.ones(21)/21,mode='same');y+=soft*(.12 if not cheer else .22)
    for i in range(8 if not cheer else 4):
        at=rng.uniform(0,seconds-1);d=int(at*SR);u=np.arange(min(SR//2,n-d))/SR;y[d:d+len(u)]+=.02*np.sin(2*np.pi*(1700+i*100)*u)*np.sin(np.pi*np.arange(len(u))/len(u))**2
    if cheer:y*=np.sin(np.pi*np.minimum(1,t/seconds))**.55
    y=np.tanh(y*2.2);y*=.72/max(.01,np.max(np.abs(y)));y*=env(n,.04,.04);return y[:,None]

manifest={'version':'0.7','sampleRateSource':SR,'license':'LICENSE-AUDIO.txt','music':{},'crowd':{}}
tracks=[('menu',120,32,'menu','Gridline / tema Apex'),('selection',112,24,'selection','Garage Pulse'),('grid',128,8,'grid','Five Lights'),('race',128,32,'race','Slipstream'),('victory',120,16,'victory','Champions Avenue'),('championship',112,24,'championship','Season Horizon')]
def save_audio(name,data,kind,meta):
    path=DEST/(name+'.mp3')
    with tempfile.TemporaryDirectory() as d:
        wav=Path(d)/'render.wav'
        with wave.open(str(wav),'wb') as w:w.setnchannels(data.shape[1]);w.setsampwidth(2);w.setframerate(SR);w.writeframes((data*32767).astype('<i2').tobytes())
        subprocess.run(['ffmpeg','-loglevel','error','-y','-i',str(wav),'-codec:a','libmp3lame','-b:a','96k' if kind=='music' else '64k','-metadata','artist=Apex Dynasty Procedural Studio','-metadata','title='+meta['title'],str(path)],check=True)
    meta.update(file='/assets/audio/'+path.name,duration=round(len(data)/SR,4),peak=float(np.max(np.abs(data))),rms=float(np.sqrt(np.mean(data**2))),channels=data.shape[1],bytes=path.stat().st_size,sha256=hashlib.sha256(path.read_bytes()).hexdigest());manifest[kind][name]=meta;print(name,meta['duration'],meta['bytes'])
for key,bpm,bars,style,title in tracks:
    data,duration=render_music(key,bpm,bars,style);save_audio(key,data,'music',{'title':title,'bpm':bpm,'bars':bars,'scene':style})
save_audio('crowd-bed',crowd(17.3),'crowd',{'title':'Grandstand voices / original synthetic bed'})
save_audio('crowd-cheer',crowd(4.6,True),'crowd',{'title':'Grandstand lift / original synthetic cheer'})
(DEST/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
(ROOT/'src/audio/Tracks.js').write_text('export const musicTracks='+json.dumps(manifest['music'],indent=2)+';\nexport const crowdTracks='+json.dumps(manifest['crowd'],indent=2)+';\n')
