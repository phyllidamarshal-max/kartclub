"""Distinct instrumentation, accompaniment and percussion for each scene."""
from scene_arrangements import SCENES as LANDMARKS

# Bass entries: time, chord-tone index, octave lift, gate, accent.
PROFILES = {
 'coast': dict(lead='sf_steelpan', answer='sf_clean', chord='sf_guitar', bass='sf_bass',
  bridge='sf_clean', leadGain=.19, chordGain=.058, room=.11, swing=0,
  style='Sunshine surf / island ska', description='A skipping steel-pan hook, clean surf guitar and bright offbeat strums race past the lighthouse and ocean.',
  chords=[(.5,.28),(1.5,.28),(2.5,.28),(3.5,.28)],
  bassline=[(0,0,0,.55,1),(1.5,2,0,.30,.8),(2,0,1,.55,.9),(3.5,2,0,.3,.8)]),
 'coast-harbor': dict(lead='sf_sax', answer='sf_ep', chord='sf_ep', bass='sf_slap',
  bridge='sf_sax', leadGain=.16, chordGain=.047, room=.08, swing=.09,
  style='Swung dockside funk', description='A clipped Dorian sax hook, syncopated slap bass, seventh chords and swung ghost notes bring the sunset docks to life.',
  chords=[(.75,.45),(2.5,.35),(3.75,.18)],
  bassline=[(0,0,0,.3,1),(.75,0,1,.17,.75),(1.5,2,0,.27,.9),(2.25,3,0,.18,.75),(2.75,0,1,.22,.85),(3.5,2,0,.2,.8)]),
 'coast-breakwater': dict(lead='sf_shanai', answer='sf_flute', chord='sf_nylon', bass='sf_bass',
  bridge='sf_flute', leadGain=.135, chordGain=.046, room=.10, swing=0,
  style='Desert caravan / hand-drum rally', description='An ornamented Phrygian-dominant reed melody, dry plucked strings and rolling hand drums trace the dunes and sandstone ruins.',
  chords=[(0,.7),(1.5,.4),(2.5,.6)],
  bassline=[(0,0,0,.8,1),(1.5,2,0,.3,.72),(2,0,0,.6,.93),(3.5,2,0,.3,.75)]),
 'city': dict(lead='sf_lead', answer='pulse', chord='pad', bass='bass',
  bridge='crystal', leadGain=.145, chordGain=.037, room=.08, swing=0,
  style='Neon drum & bass', description='Octave-jumping synth fragments, fast breakbeats and a weighty syncopated bass line cut through the neon streets.',
  chords=[(0,1.2),(2.75,.7)],
  bassline=[(0,0,0,1.1,1),(1.5,0,1,.24,.75),(2.25,2,0,.45,.88),(3,0,0,.45,1),(3.75,0,1,.15,.7)]),
 'city-factory': dict(lead='sf_drive', answer='sf_clean', chord='sf_drive', bass='sf_bass',
  bridge='sf_clean', leadGain=.17, chordGain=.048, room=.045, swing=0, leadOctave=-12,
  style='Industrial riff / machine rock', description='Low guitar riffs, stop-start power chords, double kicks and metallic hits lock into the factory machinery.',
  chords=[(0,.17),(.25,.17),(.75,.22),(1.5,.22),(2,.17),(2.25,.17),(3,.25)],
  bassline=[(0,0,0,.18,1),(.25,0,0,.17,.7),(.75,0,0,.23,.9),(1.5,2,0,.25,.8),(2,0,0,.18,1),(2.25,0,0,.18,.7),(3,0,1,.3,.8)]),
 'city-nightshift': dict(lead='airy', answer='sf_celeste', chord='pad', bass='pulse',
  bridge='crystal', leadGain=.15, chordGain=.043, room=.22, swing=0,
  style='Lydian orbital trance', description='Long floating Lydian phrases and crystalline arpeggios rise over an offbeat pulse above the orbital raceways.',
  chords=[(0,3.75)],
  bassline=[(.5,0,0,.28,.9),(1.5,0,1,.28,.8),(2.5,2,0,.28,.9),(3.5,0,1,.28,.8)]),
 'mountain': dict(lead='sf_flute', answer='sf_violin', chord='sf_guitar', bass='sf_bass',
  bridge='sf_violin', leadGain=.19, chordGain=.051, room=.15, swing=0,
  style='Woodland jig · 6/8', description='An original flute-and-fiddle jig, acoustic strings and two dancing pulses per bar rush across the forest bridges.',
  chords=[(0,.48),(.75,.28),(1.5,.48),(2.25,.28)],
  bassline=[(0,0,0,1.0,1),(1.5,2,0,.9,.86)]),
 'mountain-pass': dict(lead='sf_piano', answer='sf_celeste', chord='sf_strings', bass='sf_bass',
  bridge='sf_celeste', leadGain=.21, chordGain=.036, room=.20, swing=0,
  style='Crystal piano chase · 3/4', description='A sweeping piano waltz and sparkling celeste race through ice tunnels, with three quick pulses and a bright major-key bridge.',
  chords=[(1,.65),(2,.65)],
  bassline=[(0,0,0,.8,1),(1,2,0,.55,.6),(2,1,1,.55,.62)]),
 'mountain-summit': dict(lead='sf_horn', answer='sf_brass', chord='sf_strings', bass='sf_bass',
  bridge='sf_oboe', leadGain=.21, chordGain=.049, room=.16, swing=0,
  style='Volcanic orchestral pursuit', description='Leaping horn calls, galloping low strings and deep drum rolls drive the chase past lava fissures and ore carts.',
  chords=[(0,.4),(.75,.19),(1,.4),(2,.4),(2.75,.19),(3,.5)],
  bassline=[(0,0,0,.4,1),(.75,0,0,.16,.7),(1,2,0,.45,.85),(2,0,0,.4,1),(2.75,0,0,.16,.7),(3,2,0,.45,.85)]),
}
SCENES = {key: {**LANDMARKS[key], **value} for key, value in PROFILES.items()}

def drum_pattern(track, local, part):
    """One authored groove per scene; no shared four-on-the-floor scaffold."""
    hits=[]
    def line(kind, times, gain, pan=0):
        hits.extend((kind,p,gain*(1 if i%2==0 else .84),pan) for i,p in enumerate(times))
    if track=='coast':
        line('kick',[0,1.75,2,3.5],.37)
        line('snare',[1,3],.23,.04)
        line('hat',[0,.5,1,1.5,2,2.5,3,3.5],.052,.22)
        line('shaker',[.25,.75,1.25,1.75,2.25,2.75,3.25,3.75],.025,-.28)
        line('rim',[2.75],.075,-.13)
    elif track=='coast-harbor':
        line('kick',[0,.75,2.25,3.5],.40)
        line('snare',[1,3],.26,.05)
        line('snare',[.75,2.75,3.75],.048,-.05)
        line('hat',[j*.25 for j in range(16)],.047,.3)
        line('open',[1.5,3.5],.047,.3)
        line('conga',[.5,1.75,2.5,3.75],.06,-.3)
    elif track=='coast-breakwater':
        line('kick',[0,2.5],.32)
        line('dum',[0,1.5,2.5],.26,-.15)
        line('tak',[.5,.75,1.75,2,3,3.5,3.75],.17,.18)
        line('hand',[1,2.75,3.25],.13,-.28)
        line('tambourine',[.5,1.5,2.5,3.5],.06,.3)
        line('shaker',[j*.25 for j in range(16)],.021,.28)
    elif track=='city':
        line('kick',[0,1.5,2.75],.43)
        line('snare',[1,3],.28,.02)
        line('snare',[.75,2.25,3.75],.052,-.04)
        line('hat',[0,.25,.5,1.25,1.5,1.75,2,2.25,2.5,3.25,3.5,3.75],.049,.23)
        line('open',[.5,2.5],.065,-.25)
    elif track=='city-factory':
        line('kick',[0,.25,.75,1.5,2,2.25,3.5],.40)
        line('snare',[1,3],.28,.02)
        line('metal',[.75,2.25,3.75],.08,-.24)
        line('hat',[0,.5,1,1.5,2,2.5,3,3.5],.065,.26)
        line('lowtom',[2.75],.16,-.13)
    elif track=='city-nightshift':
        line('kick',[0,1,2,3],.37)
        line('clap',[1,3],.17,0)
        line('open',[.5,1.5,2.5,3.5],.075,.3)
        line('shaker',[j*.25 for j in range(16)],.025,-.3)
    elif track=='mountain':
        line('kick',[0,1.5],.32)
        line('rim',[1,2.5],.17,.03)
        line('tambourine',[0,.5,1,1.5,2,2.5],.060,.25)
        line('wood',[.5,2],.09,-.25)
    elif track=='mountain-pass':
        line('kick',[0],.30)
        line('rim',[1,2],.135,.02)
        line('shaker',[0,.5,1,1.5,2,2.5],.042,-.24)
        if part=='b': line('ride',[.5,1.5,2.5],.053,.24)
    else:
        line('kick',[0,.75,2,2.75],.34)
        line('lowtom',[0,1.5,2,3.5],.24,-.18)
        line('tom',[.75,1.75,2.75,3.75],.15,.24)
        line('snare',[1,3],.19,.04)
        line('ride',[0,1,2,3],.063,.28)
    # Different pickups reinforce the local meter and each world's character.
    if local==7:
        if track=='coast-breakwater': line('tak',[3,3.25,3.5,3.75],.18,.2)
        elif track=='mountain': line('wood',[2,2.25,2.5,2.75],.10,-.2)
        elif track=='mountain-pass': line('rim',[2.5,2.75],.10,.1)
        elif track=='city-nightshift': line('clap',[3,3.5,3.75],.085,.08)
        elif track=='mountain-summit': line('lowtom',[3,3.25,3.5,3.75],.19,-.1)
        else: line('snare',[3.25,3.5,3.75],.085,.1)
    return hits
