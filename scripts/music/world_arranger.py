"""Offline performance of each world's authored score and accompaniment."""
import hashlib
import numpy as np
from scipy.signal import butter, sosfilt
from instruments import SR, voice, percussion
from arranger import add
from mastering import master
from score_model import bars, chord_pitches, voicing, parse_bar
from world_arrangements import SCENES, drum_pattern


def swing_time(at, amount, eighth=0):
    fraction = at % 1
    if eighth:
        warped = fraction*(1+2*eighth) if fraction<=.5 else .5+eighth+(fraction-.5)*(1-2*eighth)
        return at-fraction+warped
    return at + (amount if abs(fraction-.25)<1e-7 or abs(fraction-.75)<1e-7 else 0)


def render(score, track_id, profile=None, percussion_pattern=drum_pattern):
    profile = SCENES[track_id] if profile is None else profile
    beat, beats = 60 / score['bpm'], score['beats']
    count = round(len(score['form'])*8*beats*beat*SR)
    music = np.zeros((count,2),np.float32)
    leads, drums, wet = np.zeros_like(music), np.zeros_like(music), np.zeros_like(music)
    duck = np.zeros(count,np.float32)
    rng = np.random.default_rng(int.from_bytes(hashlib.sha256(track_id.encode()).digest()[:4],'little'))
    cache, kit = {}, {}

    def play(kind, note, at, gate, gain, pan=0, lead=False, send=None):
        start = swing_time(at,profile['swing'],profile.get('eighthSwing',0))
        end = swing_time(at+gate,profile['swing'],profile.get('eighthSwing',0))
        length = max(.035,(end-start)*beat)
        key = (kind,note,round(length,5))
        if key not in cache: cache[key] = voice(kind,note,length,rng)
        sample = cache[key]
        add(leads if lead else music,sample,start*beat,gain,pan)
        add(wet,sample,start*beat,gain*(profile['room'] if send is None else send),pan)

    def hit(kind,at,gain,pan=0):
        if kind not in kit: kit[kind]=percussion(kind,rng)
        start = swing_time(at,profile['swing'],profile.get('eighthSwing',0))*beat
        add(drums,kit[kind],start,gain,pan)
        if kind=='kick':
            depth=profile.get('duck',.23 if track_id in ('city','city-nightshift') else .10)
            dip=depth*np.exp(-np.arange(round(.16*SR))/(SR*.045))
            ix=(round(start*SR)+np.arange(len(dip)))%count
            duck[ix]=np.maximum(duck[ix],dip)

    previous=None
    for bar_index,(section,part,local,symbol,melody) in enumerate(bars(score)):
        at=bar_index*beats
        energy={'a':.94,'b':1.06,'c':.84}[part]
        if section==len(score['form'])-1: energy*=1.035
        chord=chord_pitches(symbol)
        voices=voicing(score['key'],symbol,previous)
        previous=voices
        for pos,gate in profile['chords']:
            for j,note in enumerate(voices):
                strum=j*.015 if profile['chord'] in ('sf_guitar','sf_nylon') else 0
                pan=(j-(len(voices)-1)/2)*.28
                play(profile['chord'],note,at+pos+strum,gate,
                     profile['chordGain']*energy,pan)
        root=score['key']+chord[0]
        while root>47: root-=12
        while root<35: root+=12
        for pos,index,octave,gate,accent in profile['bassline']:
            relative=chord[index%len(chord)]-chord[0]
            play(profile['bass'],root+relative+octave*12,at+pos,gate,
                 profile.get('bassGain',.22)*energy*accent,send=0)

        for pos,length,pitch in melody:
            if pitch is None:
                # Replies fit inside the written rest, not over the next note.
                if length>=.5:
                    reply=score['key']+chord[-1]
                    while reply>82: reply-=12
                    play(profile['answer'],reply,at+pos,min(length*.75,.6),
                         profile.get('answerGain',.065)*energy,-.25,send=.08)
                continue
            instrument=profile['bridge'] if part=='c' else profile['lead']
            if part=='b': instrument=profile.get('chorusLead',instrument)
            if track_id=='mountain' and part=='b': instrument='sf_violin'
            gate=length*profile.get('gate',.78 if track_id in ('city','city-factory') else .95)
            accent=1.06 if pos in (0,beats/2) else .96
            note=score['key']+pitch+profile.get('leadOctave',0)
            play(instrument,note,at+pos,gate,profile['leadGain']*energy*accent,0,True)
            if track_id=='coast' and part=='b' and length>=.75:
                play('sf_clean',note-12,at+pos,gate,.032*energy,-.2)
            elif track_id=='mountain-summit' and part=='b':
                play('sf_brass',note-12,at+pos,gate,.048*energy,.18)
            elif track_id=='mountain-pass' and part=='b':
                play('sf_celeste',note,at+pos,gate,.029*energy,.2,True,.16)

        # These roles are specific to the scene, rather than one shared eight-
        # note accompaniment made louder on every map.
        legacy_id=track_id if profile.get('enableLegacyRoles',True) else ''
        if legacy_id=='coast-breakwater':
            positions=[0,.75,1.5,2,2.75,3.5]
            for j,pos in enumerate(positions):
                note=score['key']+chord[(0,2,1,2,0,1)[j]]-12
                play('sf_nylon',note,at+pos,.36,.060*energy,-.25,send=.035)
        elif legacy_id=='city-nightshift':
            pattern=(0,2,1,3,2,1,0,2)
            for j in range(16):
                note=score['key']+chord[pattern[j%8]%len(chord)]+12
                while note>90: note-=12
                play('crystal',note,at+j*.25,.17,.035*energy,
                     -.4 if j%2 else .4,send=.18)
        elif legacy_id=='mountain':
            for j,pos in enumerate((.5,1,2,2.5)):
                play('sf_pizz',score['key']+chord[j%len(chord)]-12,
                     at+pos,.27,.060*energy,-.25)
        elif legacy_id=='mountain-pass':
            for j,pos in enumerate((0,.5,1,1.5,2,2.5)):
                note=score['key']+chord[(0,2,1,2,0,1)[j]%len(chord)]-12
                play('sf_piano',note,at+pos,.36,.08*energy,-.28)
        elif legacy_id=='mountain-summit':
            for j,pos in enumerate((0,.5,.75,1,1.5,2,2.5,2.75,3,3.5)):
                play('sf_strings',root+12+(7 if j%3==2 else 0),at+pos,.24,.075*energy,-.25)
            if local in (0,4):
                play('sf_timpani',root,at,.8,.25*energy,send=.12)
        elif legacy_id=='city' and part=='b':
            for j,pos in enumerate((.5,1.75,2.5,3.75)):
                play('pulse',score['key']+chord[j%len(chord)]+12,at+pos,.14,.025*energy,
                     -.33 if j%2 else .33,send=.03)

        for kind,pos,index,octave,gate,gain,pan in profile.get('extras',()):
            note=score['key']+chord[index%len(chord)]+octave*12
            play(kind,note,at+pos,gate,gain*energy,pan)
        for kind,pos,gain,pan in percussion_pattern(track_id,local,part):
            hit(kind,at+pos,gain*energy,pan)
        if local==0 and part!='c':
            kind='tambourine' if track_id in ('coast-breakwater','mountain') else 'crash'
            hit(kind,at,.08*energy,.24)
        if local==7 and part=='c' and track_id in ('city','city-nightshift','city-factory'):
            for j in range(8): hit('snare',at+beats-2+j*.25,.035+j*.008,.06)

    # Circular short reflections and filtering keep the loop sample-continuous.
    wet=sosfilt(butter(2,[350,5300],btype='band',fs=SR,output='sos'),
                np.concatenate([wet[-SR:],wet]),axis=0)[SR:]
    room=np.zeros_like(music)
    for delay,gain,swap in ((.021,.34,False),(.043,.27,True),(.076,.18,False),(.121,.11,True)):
        room+=np.roll(wet[:,::-1] if swap else wet,round(delay*SR),axis=0)*gain
    mix=music*(1-duck[:,None])+leads*(1-duck[:,None]*.10)+drums+room
    mix=sosfilt(butter(2,30,btype='high',fs=SR,output='sos'),
                np.concatenate([mix[-SR:],mix]),axis=0)[SR:]
    mix-=mix.mean(axis=0)
    return master(np.tanh(mix*1.08)/1.08,SR)


def melody_reference(score):
    """Same piano, C tonic and 120 quarter-notes/minute: expose melody alone."""
    beat=.5
    out=np.zeros((round((8*score['beats']*beat+.15)*SR),2),np.float32)
    rng=np.random.default_rng(120)
    cache={}
    for bar,notation in enumerate(score['a']['notes']):
        for pos,length,pitch in parse_bar(notation,score['beats']):
            if pitch is None: continue
            key=(pitch,length)
            if key not in cache: cache[key]=voice('sf_piano',60+pitch,length*.94*beat,rng)
            add(out,cache[key],(bar*score['beats']+pos)*beat,.20)
    result=master(out,SR)
    result[-round(.06*SR):]*=np.linspace(1,0,round(.06*SR))[:,None]
    return result
