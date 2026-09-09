"""Original environmental sound design plus credited nature recordings.

Beds evolve over a whole score. Wildlife, grit, bubbles and machinery have
irregular phrasing and stereo position, with environment space in bridge bars.
"""
import hashlib
from pathlib import Path
import numpy as np
from scipy.signal import butter,sosfilt,resample_poly
from scipy.io import wavfile
from instruments import SR
from arranger import add

ROOT=Path(__file__).resolve().parents[2]
FILES=ROOT/'artifacts/music/environment'
ELEMENTS={
 'coast':['Breaking waves','Coastal breeze','Distant gull calls'],
 'coast-harbor':['Harbor water','Distant ship horn','Mooring rope creaks','Low dock machinery'],
 'coast-breakwater':['Blowing sand','Fine airborne grit','Sandstone wind resonance'],
 'city':['Distant city wash','Electrical hum','Ventilation','Soft traffic pass-bys'],
 'city-factory':['Piston motion','Steam valves','Pipe resonance','Heavy machinery'],
 'city-nightshift':['Station ventilation','Cabin resonance','Energy pulses','Distant communications'],
 'mountain':['Recorded woodland birds','Leaf rustle','Small creature calls','Forest breeze'],
 'mountain-pass':['Cold mountain wind','Drifting snow','Deep ice resonance','Ice cave echoes'],
 'mountain-summit':['Rolling magma','Viscous bubbles','Volcanic ground rumble','Steam fissures','Falling grit'],
 'forest-orchard':['Recorded morning birds','Orchard leaves','Grass rustles','Small creature calls'],
 'coast-causeway':['Open-sea wind','Waves against the causeway','Sea spray','Distant gull calls'],
 'city-switchback':['Indistinct market murmur','Alley echoes','City air','Distant machinery'],
 'forest-ridge':['Canopy gusts','Recorded bird replies','Timber creaks','Leaf movement'],
 'desert-canyon':['Canyon wind','Sand scraping rock','Loose gravel','Sandstone echoes'],
 'ice-lagoon':['Low wind across ice','Drifting snow','Ice crystal ticks','Under-ice resonance'],
 'harbor-dual':['Cargo machinery','Pulley and chain movement','Harbor water','Distant loading'],
 'factory-shift':['Meshing gears','Ratchet ticks','Conveyor friction','Valve releases'],
 'space-interchange':['Magnetic machinery','Energy transfers','Cabin resonance','Electronic communication'],
 'mine-transit':['Ore-cart wheels','Rail joints','Cavern reflections','Loose stones','Distant machinery'],
}

def normal(x,rms=.1):
    return (x*(rms/max(1e-8,float(np.sqrt(np.mean(x.astype(np.float64)**2)))))).astype(np.float32)

def noise(rng,length,low,high):
    n=round(length*SR)
    x=rng.normal(0,1,n+SR)
    sos=butter(2,[low,high],btype='band',fs=SR,output='sos')
    return normal(sosfilt(sos,x)[SR:])

def taper(x,seconds=.07):
    x=x.copy();n=min(len(x)//2,round(seconds*SR))
    x[:n]*=np.linspace(0,1,n);x[-n:]*=np.linspace(1,0,n)
    return x

def tone(rng,length,freq,decay=1,inharmonic=False):
    t=np.arange(round(length*SR))/SR
    out=np.zeros(len(t))
    for j,ratio in enumerate((1,1.413,2.731,4.07) if inharmonic else (1,2,3)):
        out+=np.sin(2*np.pi*freq*ratio*t+rng.uniform(0,6.28))*np.exp(-t*(j+1)/decay)/(j+1)**1.4
    return taper(normal(out),.012)

def animal(rng,gull=False):
    # Original stylized creature/gull voice; the ordinary forest birds are recordings.
    duration=rng.uniform(.38,.8) if gull else rng.uniform(.2,.42)
    t=np.arange(round(duration*SR))/SR
    f=(850 if gull else 1650)+(550 if gull else 900)*np.sin(np.pi*t/duration)
    f+=90*np.sin(2*np.pi*28*t)
    phase=2*np.pi*np.cumsum(f)/SR
    env=np.sin(np.pi*t/duration)**1.6
    return normal((np.sin(phase)+.22*np.sin(2*phase))*env)

def bubble(rng):
    d=rng.uniform(.15,.55);t=np.arange(round(d*SR))/SR
    f=rng.uniform(95,260)*(1+.9*np.exp(-t/.045))
    env=(1-np.exp(-t/.008))*np.exp(-t/(d*.23))
    x=np.sin(2*np.pi*np.cumsum(f)/SR)*env
    x+=noise(rng,d,150,1400)*.7*env
    return normal(taper(x,.014))

def grain_cloud(rng,length,material='sand'):
    x=noise(rng,length,1000 if material=='snow' else 500,7500)*.13
    for at in rng.uniform(0,length,int(length*(55 if material=='sand' else 12))):
        d=rng.uniform(.007,.04);n=round(d*SR);start=round(at*SR)
        grain=rng.normal(0,1,n)*np.hanning(n)*rng.uniform(.02,.08)
        end=min(start+n,len(x));x[start:end]+=grain[:end-start]
    return taper(normal(x),min(.7,length*.2))

def recorded(name,offset,length,rate=1):
    sr,x=wavfile.read(FILES/(name+'.wav'));assert sr==SR
    start=round(offset*SR);end=min(len(x),start+round(length*SR))
    x=x[start:end].astype(np.float32)
    if rate!=1:x=resample_poly(x,100,round(rate*100))
    # Remove recording handling/low-frequency noise while retaining natural calls.
    low=900 if name in ('birds','wrens') else 65
    x=sosfilt(butter(2,low,btype='high',fs=SR,output='sos'),x).astype(np.float32)
    return taper(normal(x),.25)

def render_environment(key,score):
    duration=len(score['form'])*8*4*60/score['bpm']
    n=round(duration*SR);duration=n/SR
    seed=int.from_bytes(hashlib.sha256(('environment-v8/'+key).encode()).digest()[:4],'little')
    rng=np.random.default_rng(seed);out=np.zeros((n,2),np.float32);events=[]
    def event(kind,at,sample,gain,pan=None,echo=0):
        pan=float(rng.uniform(-.6,.6) if pan is None else pan)
        add(out,sample,at,gain,pan)
        if echo:
            for delay,level in ((.19,.28),(.41,.14),(.69,.07)):
                add(out,sample,at+delay,gain*level*echo,-pan)
        events.append(dict(element=kind,time=round(at%duration,3),duration=round(len(sample)/SR,3),pan=round(pan,3)))
    def times(gap,start=1):
        t=start
        while t<duration-1:
            yield t;t+=rng.uniform(gap*.7,gap*1.3)
    def bed(kind,low,high,level,cycles):
        # Overlapping faded slices avoid an audible reset and repeated short gusts.
        for at in np.arange(-4,duration,4.7):
            x=noise(rng,9,low,high);x*=np.sin(np.linspace(0,np.pi,len(x)))**1.7
            modulation=.7+.3*np.sin(2*np.pi*cycles*(at+4)/duration)
            event(kind,float(at),x,level*modulation,pan=rng.uniform(-.5,.5))
    forest=key in ('mountain','forest-orchard','forest-ridge')
    coast=key in ('coast','coast-causeway','coast-harbor','harbor-dual')
    cold=key in ('mountain-pass','ice-lagoon')
    sand=key in ('coast-breakwater','desert-canyon')
    factory=key in ('city-factory','factory-shift')
    space=key in ('city-nightshift','space-interchange')
    if forest:
        bed('canopy wind' if key=='forest-ridge' else 'forest air',170,1300,.10 if key=='forest-ridge' else .065,3)
        for at in times(6.5,0.8):
            event('leaves',at,grain_cloud(rng,3,'sand'),.15 if key=='forest-ridge' else .10)
        name='wrens' if key=='forest-ridge' else 'birds'
        for i,at in enumerate(times(8,1.1)):
            # Different sections of the two recordings, separated by quiet space.
            offset=(i*3.7+(2 if key=='forest-orchard' else 0))%(7 if name=='wrens' else 15)
            event('recorded birds',at,recorded(name,offset,3.8),.48 if key=='mountain' else .40,echo=.6 if key=='forest-ridge' else .15)
        if key!='forest-ridge':
            for at in times(18,9):
                event('small creature call',at,animal(rng),.22)
                event('grass movement',at+.25,grain_cloud(rng,.65,'sand'),.13)
        else:
            for at in times(17,10):event('timber creak',at,tone(rng,1.2,rng.uniform(170,240),.6,True),.12)
    elif coast:
        harbor=key in ('coast-harbor','harbor-dual')
        bed('sea breeze',120,1800,.12 if key=='coast-causeway' else .055,4)
        for i,at in enumerate(times(8.7 if harbor else 6.2,.5)):
            event('harbor water' if harbor else 'breaking wave',at,recorded('wave',0,8,rate=.88 if key=='coast-causeway' else 1.0),.24 if harbor else .44,pan=(-.45 if i%2 else .4))
        if not harbor:
            for at in times(17,5):event('distant gull',at,animal(rng,True),.19,echo=.1)
        else:
            for at in times(27,8):event('distant ship horn',at,tone(rng,2.4,110,.9),.15,echo=.8)
            for at in times(11,3):event('mooring creak' if key=='coast-harbor' else 'pulley resonance',at,tone(rng,.6,190 if key=='coast-harbor' else 340,.22,True),.12)
            bed('dock machinery',55,210,.065,2)
            if key=='harbor-dual':
                for at in times(7,2):
                    for j in range(5):event('chain movement',at+j*.11,tone(rng,.13,650+j*43,.06,True),.055)
    elif sand:
        bed('desert wind',85,1050,.19 if key=='desert-canyon' else .16,3)
        for at in times(6.9,.4):
            event('sand gust',at,grain_cloud(rng,rng.uniform(3,5),'sand'),.40,echo=.65 if key=='desert-canyon' else .05)
        for at in times(12,4):
            x=noise(rng,3,380 if key=='desert-canyon' else 260,700)
            x*=np.sin(np.linspace(0,np.pi,len(x)))**2
            event('rock wind resonance',at,x,.23,echo=.7)
        if key=='desert-canyon':
            for at in times(10,7):event('loose gravel',at,grain_cloud(rng,.8,'sand'),.22,echo=.8)
    elif cold:
        for at in times(12,0):event('cold wind',at,recorded('cold-wind',rng.uniform(0,10),15),.36 if key=='mountain-pass' else .23,echo=.2)
        bed('snow air',1500,5500,.04,3)
        for at in times(9.3,2):event('drifting snow',at,grain_cloud(rng,4,'snow'),.13)
        for at in times(13,5):event('ice resonance',at,tone(rng,3.5,rng.uniform(100,160),1.2,True),.3,echo=1)
        if key=='ice-lagoon':
            for at in times(7,1):event('ice crystal tick',at,tone(rng,.6,rng.uniform(1400,2200),.14,True),.11,echo=.8)
    elif key=='mountain-summit':
        bed('volcanic ground rumble',38,145,.33,3)
        bed('rolling magma',140,650,.19,5)
        for at in times(.75,.2):
            event('viscous magma bubble',at,bubble(rng),rng.uniform(.34,.68),echo=.4)
        for at in times(8,3):
            event('steam fissure',at,taper(noise(rng,2.5,600,3600),.65),.2,echo=.5)
        for at in times(12,6):event('falling grit',at,grain_cloud(rng,1,'sand'),.13,echo=1)
    elif factory or key=='mine-transit':
        bed('distant machinery',45,210,.15,2)
        clock=key=='factory-shift';mine=key=='mine-transit'
        step=60/score['bpm']*(.5 if clock else 1)
        for i,at in enumerate(np.arange(0,duration,step)):
            if clock:
                event('ratchet tick',float(at),tone(rng,.13,550+(i%3)*90,.045,True),.065 if i%2 else .1)
            elif mine:
                event('rail joint',float(at),tone(rng,.2,160+(i%4)*35,.075,True),.14 if i%2 else .2,echo=.6)
                event('wheel roll',float(at+.10),taper(noise(rng,.2,350,1900),.025),.075)
            else:
                event('piston motion',float(at),tone(rng,.28,100+(i%2)*32,.1,True),.17 if i%2 else .22)
        for at in times(8.5,2):event('conveyor friction' if clock else 'steam valve' if not mine else 'cavern air',at,taper(noise(rng,2,450,2400),.5),.15,echo=.8 if mine else .25)
        for at in times(13,6):event('pipe ring' if not mine else 'falling stones',at,tone(rng,1.5,320,.45,True),.13,echo=1)
    elif space:
        bed('station ventilation',100,1300,.12,2)
        # Interior machinery and designed energy sound, not literal sound in vacuum.
        for at in times(7.7,.3):
            t=np.arange(round(3*SR))/SR
            phase=2*np.pi*(90*t+16*t*t)
            x=(np.sin(phase)+.22*np.sin(2.07*phase))*np.sin(np.pi*t/3)**2
            event('energy transfer',at,normal(x),.3,echo=.8)
        for at in times(11,4):event('cab resonance',at,tone(rng,2.8,165 if key=='city-nightshift' else 240,1,True),.17,echo=1)
        for at in times(17,9):
            for i,f in enumerate((640,810,705)):
                event('distant communications',at+i*.23,tone(rng,.11,f,.045),.055,echo=.8)
    else:
        bed('distant city air',85,850,.12,2)
        bed('ventilation',400,1900,.06,5)
        for at in times(10,2):
            x=noise(rng,3.3,100,1300)*np.sin(np.linspace(0,np.pi,round(3.3*SR)))**2
            event('distant traffic',at,x,.18,echo=.6 if key=='city-switchback' else .1)
        for at in times(15,6):event('electrical hum',at,tone(rng,2,120,.9),.085)
        if key=='city-switchback':
            for at in times(10,1):
                # Indistinct speech-like crowd texture, with no intelligible words.
                x=noise(rng,3,250,1400);t=np.arange(len(x))/SR
                x*=.3+.7*np.sin(2*np.pi*3.6*t)**2
                event('market murmur',at,taper(x,.5),.15,echo=.65)

    # Slow section-level contrast makes wildlife/air clearer during the bridge.
    beat=60/score['bpm'];t=np.arange(n)/SR
    section=np.minimum((t/(32*beat)).astype(int),len(score['form'])-1)
    target=np.array([1.28 if score['form'][s]=='c' else .96 for s in section],np.float32)
    from scipy.ndimage import uniform_filter1d
    out*=uniform_filter1d(target,size=round(SR*.6),mode='wrap')[:,None]
    # Keep the environmental bed about 12 dB below the instrumental RMS.
    from mastering import master
    out=master(out,SR,target_db=-27.5,ceiling=.30)
    assert np.isfinite(out).all()
    return out,events
