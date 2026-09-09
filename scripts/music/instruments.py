"""Harmonic, gated instruments and a compact original racing drum kit."""
import numpy as np
from scipy.signal import butter, sosfilt

SR=44100
TAU=2*np.pi


def adsr(t, gate, attack, decay, sustain, release):
    def held(x):
        return np.where(x<attack, np.clip(x/attack,0,1),
                        sustain+(1-sustain)*np.exp(-np.maximum(0,x-attack)/decay))
    return np.where(t<gate,held(t),held(gate)*np.maximum(0,1-(t-gate)/release)**2)


def voice(kind, note, length, rng):
    if kind.startswith('sf_'):
        from sample_bank import sampled_voice
        return sampled_voice(kind,note,length)
    release=.055 if kind in ('bass','pulse') else .10 if kind in ('pad','strings') else .07
    t=np.arange(round((length+release)*SR),dtype=np.float64)/SR
    f=440*2**((note-69)/12)
    phase=TAU*f*t
    # Exact integer harmonic partials; no metallic FM ratios in pitched leads.
    params={
        'lead':(1.35,.016,.14,.64),'airy':(1.8,.027,.20,.72),
        'pulse':(1.3,.012,.12,.60),'brass':(1.35,.027,.16,.62),
        'guitar':(1.7,.008,.22,.35),'keys':(2.0,.010,.38,.45),
        'reed':(1.7,.020,.12,.72),'flute':(2.7,.022,.16,.86),
        'crystal':(2.3,.010,.28,.38),'pad':(2.0,.10,.30,.78),
        'strings':(1.65,.065,.24,.72),'bass':(1.7,.004,.09,.50),
    }
    slope,attack,decay,sustain=params[kind]
    y=np.zeros_like(t)
    for h in range(1,min(18,int(SR*.44/f))+1):
        amp=1/h**slope
        if kind=='pulse': amp*=np.sin(np.pi*h*.38)
        elif kind=='flute' and h>3: amp*=.10
        elif kind=='keys': amp*=1 if h in (1,2,3,4) else .15
        elif kind=='crystal': amp*=1 if h in (1,2,4,6) else .05
        elif kind=='reed' and h%2==0: amp*=.45
        # Higher partials decay sooner, leaving a warm, pitched sustain.
        brightness=.55+.45*np.exp(-t*(h-1)*2.4)
        y+=amp*np.sin(phase*h)*brightness
        if kind in ('lead','airy','pad','strings','brass'):
            y+=amp*.18*np.sin(phase*h*1.0017+.3)*brightness
            y+=amp*.18*np.sin(phase*h*.9983-.3)*brightness
    if kind=='bass': y=np.tanh(y*1.2)*.85
    if kind in ('guitar','keys','crystal'):
        y+=.025*sosfilt(butter(1,[1000,5000],btype='band',fs=SR,output='sos'),rng.normal(size=len(t)))*np.exp(-t/.009)
    if kind=='flute':
        y+=.012*sosfilt(butter(1,[1100,4300],btype='band',fs=SR,output='sos'),rng.normal(size=len(t)))
    y*=adsr(t,length,attack,decay,sustain,release)
    # Stable gain across patches so arrangement balance is intentional.
    y/=max(float(np.max(np.abs(y))),.1)
    return y.astype(np.float32)


def percussion(kind, rng):
    from sample_bank import sampled_drum
    return sampled_drum(kind)


def synthesized_percussion(kind, rng):
    duration={'kick':.34,'snare':.24,'hat':.09,'open':.27,'shaker':.11,
              'rim':.10,'tom':.28,'wood':.12,'hand':.23,'metal':.15,'crash':.65}[kind]
    t=np.arange(round(duration*SR))/SR
    noise=rng.normal(size=len(t))
    if kind=='kick':
        phase=TAU*(52*t+95*.016*(1-np.exp(-t/.016)))
        y=(np.sin(phase)+.22*np.sin(phase*2)*np.exp(-t/.055))*np.exp(-t/.095)
        y+=.11*noise*np.exp(-t/.003)
    elif kind=='snare':
        band=sosfilt(butter(2,[750,8200],btype='band',fs=SR,output='sos'),noise)
        y=band*np.exp(-t/.05)+.4*np.sin(TAU*185*t)*np.exp(-t/.04)
        for lag in (.008,.018): y+=.24*np.roll(band,round(lag*SR))*np.exp(-np.maximum(0,t-lag)/.025)*(t>=lag)
    elif kind in ('hat','open','shaker','crash'):
        band=sosfilt(butter(2,[5000 if kind=='shaker' else 6200,17000],btype='band',fs=SR,output='sos'),noise)
        y=band*np.exp(-t/{'hat':.022,'open':.075,'shaker':.031,'crash':.18}[kind])
    elif kind in ('tom','hand'):
        f=118 if kind=='tom' else 205
        phase=TAU*(f*t+45*.015*(1-np.exp(-t/.015)))
        y=(np.sin(phase)+.2*np.sin(2*phase))*np.exp(-t/.07)
        y+=.12*noise*np.exp(-t/.008)
    else:
        f={'rim':780,'wood':930,'metal':550}[kind]
        y=(np.sin(TAU*f*t)+.32*np.sin(TAU*f*1.57*t))*np.exp(-t/.020)
    y*=np.minimum(1,t/.001)*np.minimum(1,(duration-t)/.015)
    y/=max(float(np.max(np.abs(y))),.1)
    return y.astype(np.float32)
