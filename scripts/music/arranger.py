"""Schedule complete musical phrases, then mix separate music and drum buses."""
import hashlib
import numpy as np
from scipy.signal import butter, sosfilt
from instruments import SR, voice, percussion
from arcade_arrangements import SCENES, drum_pattern
from phrases import CHARTS, melody_events, chord_pitches, close_voicing
from mastering import master

BARS=32


def add(target, samples, at, gain, pan=0):
    start=round(at*SR)%len(target)
    weights=np.array([np.cos((pan+1)*np.pi/4),np.sin((pan+1)*np.pi/4)])*gain
    stereo=samples[:,None]*weights
    count=min(len(samples),len(target)-start)
    target[start:start+count]+=stereo[:count]
    if count<len(samples): target[:len(samples)-count]+=stereo[count:]


def render(score):
    profile=SCENES[score['id']]
    chart=CHARTS[score['id']]
    key=chart['key']
    beat=60/score['bpm']
    count=round(BARS*4*beat*SR)
    music=np.zeros((count,2),np.float32)
    drums=np.zeros_like(music)
    wet=np.zeros_like(music)
    lead_bus=np.zeros_like(music)
    duck=np.zeros(count,np.float32)
    rng=np.random.default_rng(int.from_bytes(hashlib.sha256(score['id'].encode()).digest()[:4],'little'))
    samples={}
    kit={kind:percussion(kind,rng) for kind in ('kick','snare','hat','open','shaker','rim','tom','wood','hand','metal','crash','ride','clap')}

    def play(kind,note,at,length,gain,pan=0,lead=False,send=.10):
        cache_key=(kind,note,round(length,5))
        if cache_key not in samples: samples[cache_key]=voice(kind,note,length,rng)
        sample=samples[cache_key]
        add(lead_bus if lead else music,sample,at*beat,gain,pan)
        add(wet,sample,at*beat,gain*send,pan)

    def hit(kind,at,gain,pan=0):
        add(drums,kit[kind],at*beat,gain,pan)
        if kind=='kick':
            # A quick, modest accompaniment dip lets the kick read clearly.
            dip=.24*np.exp(-np.arange(round(.19*SR))/(SR*.055))
            start=round(at*beat*SR)%count
            indices=(start+np.arange(len(dip)))%count
            duck[indices]=np.maximum(duck[indices],dip)
        elif kind=='snare': add(wet,kit[kind],at*beat,gain*.06,pan)

    previous=None
    for bar in range(BARS):
        section=bar//8
        local=bar%8
        absolute=bar*4
        symbol=chart['chords'][local]
        chord=chord_pitches(symbol)
        voiced=close_voicing(key,symbol,previous)
        previous=voiced
        # The third section has a two-bar breath, a two-bar build and a full
        # arrival. This contrast is authored, not random gain pumping.
        breakdown=section==2 and local<2
        buildup=section==2 and local in (2,3)
        energy=.80 if breakdown else (.97,1.04,1.05,1.10)[section]
        groove=profile['groove']

        # Voice-leading preserves nearby common tones across chord changes.
        if profile['chord'] in ('pad','sf_strings'):
            positions=[0]
            gate=3.80
        elif groove in ('house','trance','ice'):
            positions=[.5,1.5,2.5,3.5]
            gate=.34
        else:
            positions=[0,1.5,2.5]
            gate=.66
        for p in positions:
            for j,note in enumerate(voiced):
                strum=j*.016 if profile['chord'] in ('sf_guitar','sf_clean') else 0
                play(profile['chord'],note,absolute+p+strum,gate*beat,
                     profile['chordGain']*energy,(j-1)*.35,send=profile['room'])

        # Root/fifth movement supports the actual chord. Short gates prevent
        # sub-bass from spilling across the next bass note or chord boundary.
        root=key+chord[0]
        while root>47: root-=12
        while root<35: root+=12
        bass_positions=([0,2] if breakdown else [j*.5 for j in range(8)])
        for j,p in enumerate(bass_positions):
            pitch=root+(7 if j in (3,7) else 12 if j in (2,6) else 0)
            bass_gain=.26*energy*(1 if j%2==0 else .79)
            play(profile['bass'],pitch,absolute+p,(.85 if breakdown else .40)*beat,bass_gain,send=0)
            if groove in ('house','trance','ice'):
                play('bass',pitch,absolute+p,.34*beat,.075*energy,send=0)

        # Guitar/strings give the midrange continuous forward motion. These
        # are chord tones, with restrained syncopation between melody accents.
        if not breakdown:
            for j,p in enumerate((0,.5,1,1.5,2,2.5,3,3.5)):
                n=root+12+(7 if j in (3,7) else 0)
                part_gain=(.053 if section==0 else .073)*energy*(1 if j%2==0 else .76)
                play(profile['drive'],n,absolute+p,.30*beat,part_gain,-.32,send=.08)
                if section in (1,3) and profile['drive'] in ('sf_drive','sf_clean'):
                    play(profile['drive'],n+(5 if j in (3,7) else 7),absolute+p,.30*beat,part_gain*.55,.32,send=.08)

        # Play the score exactly as authored. Responses occupy explicit rests.
        for p,length,pitch in melody_events(score['id'],section,bar):
            if pitch is None:
                if length>=.75:
                    for j,offset in enumerate((chord[2],chord[1])):
                        play(profile['answer'],key+offset,absolute+p+j*.5,.37*beat,
                             .052*energy,-.18,send=profile['room'])
                continue
            gate=length*.96*beat
            accent=1.04 if p in (0,2) else .93
            play(profile['lead'],key+pitch,absolute+p,gate,
                 profile['leadGain']*energy*accent,0,lead=True,send=profile['room'])
            # A low-level harmonic sustain supports percussive lead patches.
            if profile['lead'] in ('sf_guitar','sf_piano','sf_bell','sf_sitar'):
                play('airy',key+pitch,absolute+p,gate,profile['leadGain']*.23*energy,
                     -.05,lead=True,send=.06)
            if section==3 and local<7:
                play('sf_strings',key+pitch,absolute+p,gate,.039,.12,lead=True,send=.09)
            if section==1 and p in (0,2) and not groove in ('breaks','mine'):
                play('sf_brass',key+pitch,absolute+p,min(gate,.38*beat),.034,.18,lead=True,send=.08)

        # Arpeggios use chord tones in a separate register and are subordinate
        # to the theme; they never alter the theme's melody or rhythm.
        if not breakdown and (section in (1,3) or groove in ('trance','ice')):
            for j in range(8):
                offset=chord[(0,1,2,1,0,1,2,1)[j]]
                arp_note=key+offset+12
                while arp_note>88: arp_note-=12
                kind='sf_bell' if groove in ('trance','ice') else 'sf_pizz'
                play(kind,arp_note,absolute+j*.5+.25,.20*beat,.019*energy,
                     -.3 if j%2 else .3,send=.09)

        for kind,p,gain,pan in drum_pattern(groove):
            if breakdown and (kind not in ('kick','snare') or p not in (0,2,3)): continue
            hit(kind,absolute+p,gain*energy,pan)
        if section==3 or (section==2 and local>=4):
            for j in range(8): hit('ride',absolute+j*.5,.055 if j%2==0 else .035,.30)
        if buildup:
            for j in range(8 if local==2 else 16):
                hit('snare',absolute+j*(.5 if local==2 else .25),.048+j*.005,.02)
        # Short fills announce eight-bar arrivals. Keep the backbeat intact.
        if local in (3,7):
            for j,p in enumerate((3,3.25,3.5,3.75)):
                hit('tom' if groove in ('mine','desert','folk') else 'snare',absolute+p,.085+j*.028,(-.18+j*.18))
        if (local==0 and not breakdown) or (section==2 and local==4):
            hit('crash',absolute,.11,.25)
        if local==7 or buildup and local==3:
            reverse=kit['crash'][::-1].copy()
            reverse*=np.linspace(0,1,len(reverse))
            add(drums,reverse,(absolute+4)*beat-len(reverse)/SR,.075,-.18)

    # Compact early reflections provide space without several beats of old
    # melody accumulating over the next harmony. No unrelated tonal drone.
    wet=sosfilt(butter(2,[350,4800],btype='band',fs=SR,output='sos'),
                np.concatenate([wet[-SR:],wet]),axis=0)[SR:]
    room=np.zeros_like(music)
    for delay,gain,swap in ((.023,.34,False),(.043,.27,True),(.071,.20,False),(.109,.13,True)):
        room+=np.roll(wet[:,::-1] if swap else wet,round(delay*SR),axis=0)*gain
    mix=music*(1-duck[:,None])+lead_bus*(1-duck[:,None]*.18)+drums+room
    # Gentle low-frequency cleanup, initialized from the previous loop tail.
    mix=sosfilt(butter(2,30,btype='high',fs=SR,output='sos'),
                np.concatenate([mix[-SR:],mix]),axis=0)[SR:]
    mix-=mix.mean(axis=0)
    # A shallow soft knee catches only strong transients, then one linked
    # stereo gain sets the master. No per-note or per-channel normalization.
    mix=np.tanh(mix*1.12)/1.12
    return master(mix,SR)
