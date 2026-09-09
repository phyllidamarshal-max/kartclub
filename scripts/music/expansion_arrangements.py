"""Each new circuit has its own authored groove, bass rhythm and instrument roles."""
PROFILES={
 'forest-orchard':dict(lead='sf_banjo',answer='sf_violin',chord='sf_guitar',bass='sf_acbass',bridge='sf_violin',
  leadGain=.19,chordGain=.058,room=.095,swing=0,gate=.89,
  style='Orchard bluegrass sprint',description='Quick banjo turns, fiddle replies and a bouncing acoustic rhythm carry the race through orchard clearings and the timber camp.',
  chords=[(.5,.28),(1,.4),(2.5,.28),(3,.4)],
  bassline=[(0,0,0,.66,1),(1,2,0,.35,.65),(2,0,1,.6,.9),(3,2,0,.35,.65)],
  extras=[('sf_guitar',.25,2,-1,.18,.05,-.3),('sf_guitar',1.75,1,-1,.18,.05,.3),('sf_guitar',2.25,2,-1,.18,.05,-.3),('sf_guitar',3.75,1,-1,.18,.05,.3)]),
 'coast-causeway':dict(lead='sf_marimba',answer='sf_flute',chord='sf_nylon',bass='sf_bass',bridge='sf_piano',chorusLead='sf_piano',
  leadGain=.20,chordGain=.053,room=.12,swing=0,
  style='Tropical causeway samba',description='A sunny mallet-and-piano theme, interlocking hand percussion and flowing syncopation follow the open lighthouse causeway.',
  chords=[(.75,.30),(1.25,.32),(2.75,.30),(3.25,.32)],
  bassline=[(0,0,0,.48,1),(1.75,2,0,.18,.75),(2.5,0,1,.40,.9),(3.75,2,0,.18,.7)],
  extras=[('sf_nylon',0,0,-1,.45,.07,-.25),('sf_nylon',1.5,2,-1,.22,.06,-.25),('sf_nylon',2,1,-1,.4,.055,.25),('sf_nylon',3.5,3,-1,.22,.055,.25)]),
 'city-switchback':dict(lead='sf_accordion',answer='sf_clarinet',chord='sf_ep',bass='sf_acbass',bridge='sf_clarinet',
  leadGain=.15,chordGain=.045,room=.085,swing=0,eighthSwing=.12,
  style='Street-corner electro swing',description='An accordion hook and clarinet replies bounce through linked market turns over swung eighth notes and clipped electronic drums.',
  chords=[(.5,.28),(1.5,.28),(2.5,.28),(3.5,.28)],
  bassline=[(0,0,0,.55,1),(1,1,0,.48,.75),(2,2,0,.55,.9),(3,0,1,.48,.8)],
  extras=[('sf_organ',1.75,2,0,.17,.028,-.25),('sf_organ',3.75,1,0,.17,.028,.25)]),
 'forest-ridge':dict(lead='sf_marimba',answer='sf_pan',chord='sf_pizz',bass='bass',bridge='sf_pan',chorusLead='sf_pan',
  leadGain=.19,chordGain=.053,room=.16,swing=0,
  style='Canopy marimba / jungle breaks',description='A spacious pentatonic mallet theme, pan-flute answers and layered wooden percussion mark the forked paths high above the forest.',
  chords=[(0,.3),(1.75,.22),(2.5,.32)],
  bassline=[(0,0,0,.7,1),(1.75,2,0,.2,.7),(2.5,0,0,.45,.95),(3.25,1,1,.25,.65)],
  extras=[('sf_marimba',.75,2,-1,.25,.068,-.35),('sf_marimba',1.5,0,0,.2,.048,.35),('sf_marimba',2.75,1,-1,.25,.055,-.35),('sf_marimba',3.5,2,-1,.2,.065,.35)]),
 'desert-canyon':dict(lead='sf_nylon',answer='sf_oboe',chord='sf_guitar',bass='sf_bass',bridge='sf_nylon',
  leadGain=.23,chordGain=.049,room=.085,swing=0,gate=.87,
  style='Canyon guitar / desert rally',description='Fast nylon-guitar runs, handclaps and galloping percussion echo through sandstone turns and shifting sand pockets.',
  chords=[(0,.4),(.75,.24),(2,.4),(2.75,.24)],
  bassline=[(0,0,0,.6,1),(1.5,2,0,.34,.8),(2.75,0,1,.27,.82),(3.5,2,0,.28,.72)],
  extras=[('sf_nylon',.5,2,-1,.22,.060,-.3),('sf_nylon',1.25,1,-1,.22,.055,.3),('sf_nylon',2.5,2,-1,.22,.060,-.3),('sf_nylon',3.25,1,-1,.22,.055,.3)]),
 'ice-lagoon':dict(lead='sf_vibes',answer='sf_harp',chord='pad',bass='bass',bridge='sf_harp',chorusLead='sf_celeste',
  leadGain=.19,chordGain=.039,room=.21,swing=0,duck=.19,
  style='Crystalline liquid breaks',description='Sustained glassy chords, bell hooks and rippling harp figures skate across the frozen lagoon over a quick broken beat.',
  chords=[(0,3.5)],
  bassline=[(0,0,0,1.18,1),(1.75,0,1,.18,.68),(2.5,2,0,.58,.9),(3.5,0,1,.28,.74)],
  extras=[('sf_harp',.5,0,0,.3,.035,-.4),('sf_harp',1.25,2,0,.3,.037,.4),('sf_harp',2,1,0,.3,.035,-.4),('sf_harp',2.75,3,0,.3,.037,.4),('sf_harp',3.5,2,0,.25,.030,-.3)]),
 'harbor-dual':dict(lead='sf_trumpet',answer='sf_accordion',chord='sf_brass',bass='sf_acbass',bridge='sf_accordion',
  leadGain=.155,chordGain=.036,room=.13,swing=0,
  style='Nautical fanfare / 6/8 march',description='Bright trumpet calls and accordion replies trade across the twin docks, carried by a buoyant six-eight march.',
  chords=[(.5,.35),(1,.3),(2,.35),(2.5,.3)],
  bassline=[(0,0,0,.9,1),(1,2,0,.28,.55),(1.5,0,1,.8,.84),(2.5,2,0,.27,.58)],
  extras=[('sf_pizz',0,0,-1,.35,.065,-.25),('sf_pizz',.75,1,-1,.2,.040,.25),('sf_pizz',1.5,2,-1,.35,.06,-.25),('sf_pizz',2.25,0,0,.2,.04,.25)]),
 'factory-shift':dict(lead='sf_harpsichord',answer='sf_pizz',chord='sf_organ',bass='pulse',bridge='sf_celeste',
  leadGain=.21,chordGain=.036,room=.075,swing=0,gate=.80,duck=.16,
  style='Clockwork electro / baroque motor',description='Interlocking harpsichord figures, pizzicato springs and an electronic motor pulse chase the moving assembly lines.',
  chords=[(0,.32),(1.25,.19),(2,.32),(3.25,.19)],
  bassline=[(0,0,0,.32,1),(.75,2,0,.19,.72),(1.25,0,1,.19,.66),(2,0,0,.32,1),(2.75,1,0,.19,.72),(3.25,0,1,.19,.66)],
  extras=[('sf_pizz',.5,0,0,.16,.065,-.25),('sf_pizz',1.5,2,-1,.16,.06,.25),('sf_pizz',2.5,1,0,.16,.055,-.25),('sf_pizz',3.5,2,0,.16,.055,.25)]),
 'space-interchange':dict(lead='sf_square',answer='sf_lead',chord='pad',bass='bass',bridge='crystal',
  leadGain=.14,chordGain=.035,room=.12,swing=0,gate=.78,duck=.20,
  style='Starlane chiptune sprint',description='A bright square-wave theme jumps between registers while quick arpeggio signals and punchy drums trace the orbital interchange.',
  chords=[(0,1.35),(2.5,.85)],
  bassline=[(0,0,0,.36,1),(.5,0,1,.21,.7),(1.25,2,0,.26,.85),(2,0,0,.36,1),(2.75,0,1,.21,.7),(3.25,2,0,.26,.85)],
  extras=[('pulse',.75,0,1,.13,.026,-.4),('pulse',1.5,2,1,.13,.026,.4),('pulse',2.25,1,1,.13,.026,-.4),('pulse',3.75,2,1,.13,.026,.4)]),
 'mine-transit':dict(lead='sf_harmonica',answer='sf_clean',chord='sf_clean',bass='sf_bass',bridge='sf_clean',
  leadGain=.17,chordGain=.052,room=.095,swing=0,
  style='Locomotive blues / 12/8 shuffle',description='Harmonica bends and twanging guitar ride a rolling twelve-eight train rhythm through ore-cart crossings and mineral chambers.',
  chords=[(1,.32),(2.5,.32),(4,.32),(5.5,.32)],
  bassline=[(0,0,0,.82,1),(1.5,2,0,.75,.8),(3,0,1,.82,.9),(4.5,3,0,.75,.76)],
  extras=[('sf_clean',0,0,-1,.65,.06,-.3),('sf_clean',1.5,2,-1,.65,.06,-.3),('sf_clean',3,0,0,.65,.055,.3),('sf_clean',4.5,2,-1,.65,.055,.3)]),
}

def drum_pattern(track,local,part):
    hits=[]
    def line(kind,times,gain,pan=0):
        hits.extend((kind,t,gain*(1 if i%2==0 else .82),pan) for i,t in enumerate(times))
    if track=='forest-orchard':
        line('kick',[0,2,3.75],.32); line('rim',[1,3],.18,.02)
        line('wood',[.5,1.5,2.5,3.5],.077,-.25)
        line('tambourine',[0,.5,1,1.5,2,2.5,3,3.5],.042,.25)
    elif track=='coast-causeway':
        line('kick',[0,1.75,2.5,3.75],.33); line('lowtom',[1.5,3.5],.10,-.1)
        line('rim',[.75,1.5,2.75],.15,.05); line('conga',[.5,1.25,2.25,3.25],.12,-.27)
        line('shaker',[j*.25 for j in range(16)],.033,.28)
    elif track=='city-switchback':
        line('kick',[0,1.5,2,3.5],.38); line('clap',[1,3],.18,.01)
        line('hat',[0,.5,1,1.5,2,2.5,3,3.5],.062,.27)
        line('rim',[.5,2.5],.068,-.25); line('snare',[2.75,3.75],.060,.05)
    elif track=='forest-ridge':
        line('kick',[0,1.75,2.5],.37); line('snare',[1,3],.21,.05)
        line('dum',[.75,2.25,3.5],.16,-.27); line('tak',[.5,1.25,2,2.75,3.75],.12,.22)
        line('wood',[1.5,3.25],.09,-.3); line('shaker',[0,.5,1,1.5,2,2.5,3,3.5],.028,.3)
    elif track=='desert-canyon':
        line('kick',[0,1.5,2.75],.34); line('clap',[1,2.5,3.5],.15,.05)
        line('dum',[0,2],.23,-.2); line('tak',[.5,.75,1.75,2.25,3.25,3.75],.15,.25)
        line('tambourine',[.75,1.75,2.75,3.75],.055,-.25)
    elif track=='ice-lagoon':
        line('kick',[0,1.75,2.5,3.5],.38); line('snare',[1,3],.25,.02)
        line('rim',[.75,2.25,3.75],.051,-.12)
        line('hat',[0,.5,.75,1.25,1.5,2,2.5,2.75,3.25,3.75],.046,.28)
        line('open',[.25,2.25],.038,-.28)
    elif track=='harbor-dual':
        line('kick',[0,1.5],.34); line('snare',[1,2.5],.21,.03)
        line('ride',[0,.5,1,1.5,2,2.5],.052,.25)
        line('lowtom',[.75,2.25],.10,-.23)
    elif track=='factory-shift':
        line('kick',[0,.75,1.25,2,2.75,3.25],.38); line('snare',[1,3],.24,.04)
        line('metal',[.5,1.75,2.5,3.75],.064,-.25)
        line('hat',[j*.25 for j in range(16) if j%4!=3],.04,.28)
        line('wood',[.25,2.25],.065,-.1)
    elif track=='space-interchange':
        line('kick',[0,.5,1.5,2,2.75,3.5],.39); line('snare',[1,3],.24,.02)
        line('open',[.75,2.25],.052,-.27)
        line('hat',[0,.25,.5,1.25,1.5,1.75,2.25,2.5,3.25,3.5,3.75],.044,.27)
        line('clap',[3.75],.065,-.06)
    elif track=='mine-transit':
        line('kick',[0,2.5,3,5.5],.37); line('snare',[1.5,4.5],.25,.04)
        line('hat',[0,1,1.5,2.5,3,4,4.5,5.5],.064,.25)
        line('rim',[.5,2,3.5,5],.063,-.2); line('lowtom',[2.5,5.5],.11,-.27)
    else: raise KeyError(track)
    if local==7:
        ends={'harbor-dual':3,'mine-transit':6}
        end=ends.get(track,4)
        kind='tak' if track in ('desert-canyon','forest-ridge') else 'wood' if track=='forest-orchard' else 'snare'
        line(kind,[end-.75,end-.5,end-.25],.075,.12)
    return hits
