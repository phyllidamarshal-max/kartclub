"""A common racing pulse with scene-specific instrumentation and grooves."""
from scene_arrangements import SCENES as LANDMARKS

SETTINGS={
 'coast':('guitar','flute','guitar','pop',.17,.050,.10,'Coastal racing pop','A flowing guitar hook, a bright woodwind response and punchy pop drums for the sunlit seaside.'),
 'coast-harbor':('keys','reed','keys','funk',.18,.050,.10,'Sunset funk sprint','Warm electric keys and short reed responses ride a tight syncopated bass groove through the docks.'),
 'coast-breakwater':('reed','guitar','guitar','desert',.15,.045,.09,'Desert rally dance','A winding reed theme over plucked chords, hand percussion and a firm racing backbeat.'),
 'city':('lead','keys','lead','house',.15,.047,.07,'Neon melodic house','A repeating synth hook, offbeat chords, rolling bass and a full four-on-the-floor chorus.'),
 'city-factory':('pulse','keys','pulse','breaks',.145,.042,.06,'Industrial racing breaks','A tight harmonic synth riff, syncopated breaks and restrained metallic accents echo the machinery.'),
 'city-nightshift':('airy','crystal','pad','trance',.17,.052,.16,'Orbital melodic trance','A sustained rising theme and sparkling arpeggios over a driving electronic pulse in open space.'),
 'mountain':('flute','guitar','guitar','folk',.17,.050,.12,'Woodland adventure pop','A connected flute melody, acoustic-style strums and skipping hand percussion through the forest.'),
 'mountain-pass':('crystal','airy','pad','ice',.18,.052,.14,'Glacier melodic dance','A clear crystal melody with a warm synth foundation and steady dance drums through icy hairpins.'),
 'mountain-summit':('brass','guitar','strings','mine',.16,.052,.09,'Lava chase electro','A bold brass-like hook, low string chords and forceful drums build a racing chase through the mine.'),
}

SCENES={}
for track_id,values in SETTINGS.items():
    lead,answer,chord,groove,lead_gain,chord_gain,room,style,description=values
    SCENES[track_id]={**{k:LANDMARKS[track_id][k] for k in ('biome','landmark')},
        'lead':lead,'answer':answer,'chord':chord,'groove':groove,'leadGain':lead_gain,
        'chordGain':chord_gain,'room':room,'style':style,'description':description}


def drum_pattern(groove):
    if groove in ('house','trance','ice'): kicks=[0,1,2,3]
    elif groove=='funk': kicks=[0,1.5,2.75,3.5]
    elif groove=='breaks': kicks=[0,1.5,2,2.75]
    elif groove=='mine': kicks=[0,.75,2,2.5,3.5]
    else: kicks=[0,1.5,2,2.75]
    hits=[('kick',p,.46 if p in (0,2) else .39,0) for p in kicks]
    hits += [('snare',1,.25,.04),('snare',3,.27,.04)]
    hits += [('hat',j*.5,.055 if j%2==0 else .084,.25) for j in range(8)]
    if groove in ('house','trance','ice'): hits += [('open',p,.075,.18) for p in (.5,1.5,2.5,3.5)]
    ornament={'pop':'shaker','funk':'rim','desert':'hand','breaks':'metal',
              'folk':'wood','mine':'tom','house':'hat','trance':'shaker','ice':'shaker'}[groove]
    hits += [(ornament,p,.075 if ornament in ('hand','tom') else .047,-.27) for p in (.75,2.25,3.75)]
    return hits
