"""Scene orchestration and breathing space for revision-8 environmental stems."""
from copy import deepcopy
from world_arrangements import SCENES,drum_pattern as world_drums
from expansion_arrangements import PROFILES as EXPANSION,drum_pattern as expansion_drums

PROFILES=deepcopy({**SCENES,**EXPANSION})
for p in PROFILES.values():
    p['leadGain']*=.91
    p['chordGain']*=.86
    p['answerGain']=.025
    p['enableLegacyRoles']=False
    p['bassGain']=.19
    p['gate']=p.get('gate',.9)

UPDATES={
 'coast':dict(style='Sunlit surf race / breaking waves',lead='sf_steelpan',bridge='sf_clean'),
 'coast-harbor':dict(style='Sunset brass funk / working harbor',lead='sf_trumpet',answer='sf_ep',leadGain=.15),
 'coast-breakwater':dict(style='Dune caravan / drifting sand',lead='sf_shanai',leadGain=.12,bridge='sf_flute'),
 'city':dict(style='Neon rush / electric city',lead='sf_lead',bridge='crystal'),
 'city-factory':dict(style='Steam-driven industrial rock',lead='sf_drive',bridge='sf_clean'),
 'city-nightshift':dict(style='Orbital trance / station atmosphere',lead='airy',bridge='crystal'),
 'mountain':dict(style='Living woodland / flute and timber',lead='sf_flute',bridge='sf_violin',
     chords=[(.5,.35),(1.5,.25),(2.5,.35)],
     bassline=[(0,0,0,.8,1),(1.5,2,0,.4,.7),(2.5,0,1,.6,.85)],
     extras=[('sf_pizz',.75,2,-1,.23,.045,-.3),('sf_pizz',2.25,1,-1,.23,.04,.3)]),
 'mountain-pass':dict(style='Glacial piano pursuit / cold wind',lead='sf_piano',bridge='sf_celeste',
     chords=[(0,2.5)],bassline=[(0,0,0,1.2,1),(2.5,2,0,.7,.7)],
     extras=[('sf_celeste',1.5,2,0,.5,.02,.35),('sf_harp',3,1,0,.5,.025,-.35)]),
 'mountain-summit':dict(style='Volcanic orchestral chase / rolling magma',lead='sf_horn',bridge='sf_oboe',
     bassGain=.17,loopFeatherMs=4,extras=[('sf_timpani',0,0,-2,.8,.14,-.15),('sf_strings',.5,2,-1,.2,.045,-.2),
                        ('sf_strings',1.5,0,-1,.2,.045,.2),('sf_strings',2.5,2,-1,.2,.045,-.2)]),
 'forest-orchard':dict(style='Orchard sunrise / birds and acoustic bounce',lead='sf_marimba',bridge='sf_guitar',answer='sf_flute',leadGain=.19),
 'coast-causeway':dict(style='Open-water sprint / sea spray',lead='sf_clean',answer='sf_flute',bridge='sf_piano',chorusLead='sf_trumpet',leadGain=.17),
 'city-switchback':dict(style='Market-lane swing / alley echoes',lead='sf_accordion',bridge='sf_clarinet'),
 'forest-ridge':dict(style='Canopy adventure / wind and wildlife',lead='sf_pan',bridge='sf_marimba',chorusLead='sf_flute'),
 'desert-canyon':dict(style='Canyon chase / sand and sandstone',lead='sf_nylon',bridge='sf_oboe',leadGain=.21),
 'ice-lagoon':dict(style='Frozen-glass breaks / ice resonance',lead='sf_vibes',chorusLead='sf_celeste',bridge='sf_harp'),
 'harbor-dual':dict(style='Cargo-lane fanfare / harbor machinery',lead='sf_brass',bridge='sf_trumpet',leadGain=.14,
     bassline=[(0,0,0,.65,1),(.75,2,0,.22,.7),(2,0,1,.65,.9),(3.5,2,0,.23,.6)],
     chords=[(.5,.35),(1.5,.28),(2.5,.35),(3.5,.28)],
     extras=[('sf_pizz',0,0,-1,.3,.04,-.3),('sf_pizz',2,2,-1,.3,.04,.3)]),
 'factory-shift':dict(style='Clockwork electro / gears and valves',lead='sf_marimba',bridge='sf_pizz',chorusLead='sf_harpsichord',leadGain=.20),
 'space-interchange':dict(style='Magnetic chiptune / energy exchange',lead='sf_square',bridge='crystal'),
 'mine-transit':dict(style='Railway adventure / ore-cart shuffle',lead='sf_clean',bridge='sf_harmonica',leadGain=.2,
     eighthSwing=.15,chords=[(.5,.28),(1.5,.28),(2.5,.28),(3.5,.28)],
     bassline=[(0,0,0,.55,1),(1,2,0,.45,.7),(2,0,1,.55,.9),(3,1,0,.45,.7)],
     extras=[('sf_pizz',.5,2,-1,.2,.035,-.3),('sf_pizz',2.5,1,-1,.2,.035,.3)]),
}
for k,p in UPDATES.items(): PROFILES[k].update(p)

def drum_pattern(track,local,part):
    special={
      'mountain':[('kick',0,.3,0),('kick',2.5,.27,0),('wood',.5,.09,-.2),('rim',1,.14,0),('rim',3,.14,0),('tambourine',1.5,.055,.2),('tambourine',3.5,.045,.2)],
      'mountain-pass':[('kick',0,.30,0),('kick',2,.24,0),('rim',1,.12,0),('rim',3,.12,0),('shaker',.75,.035,.25),('shaker',1.5,.03,.25),('shaker',2.75,.035,.25),('ride',3.5,.04,-.25)],
      'harbor-dual':[('kick',0,.32,0),('kick',1.75,.21,0),('kick',2.5,.26,0),('snare',1,.17,0),('snare',3,.17,0),('rim',3.75,.05,-.25),('ride',.5,.055,.25),('ride',2,.045,.25)],
      'mine-transit':[('kick',0,.32,0),('kick',2,.28,0),('rim',1,.17,0),('rim',3,.17,0),('shaker',.5,.05,.25),('shaker',1.5,.04,.25),('shaker',2.5,.05,.25),('shaker',3.5,.04,.25)],
    }
    hits=list(special[track]) if track in special else (world_drums(track,local,part) if track in SCENES else expansion_drums(track,local,part))
    if local==7 and track in special: hits += [('wood',3.25,.06,-.15),('rim',3.75,.07,.15)]
    return [(kind,at,gain*(.7 if part=='c' else .93),pan) for kind,at,gain,pan in hits]
