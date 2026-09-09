"""Original arcade band arrangements informed by published KartRider OST notes."""
from scene_arrangements import SCENES as LANDMARKS

SETTINGS={
 'coast':('sf_brass','sf_clean','sf_guitar','house','sf_bass','sf_clean',
          'Sunshine brass / arcade house','Bright brass fanfares, acoustic strums, electric guitar and a fast house pulse along the seaside.'),
 'coast-harbor':('sf_sax','sf_brass','sf_ep','funk','sf_slap','sf_clean',
          'Harbor funk / brass sprint','A punchy sax-and-brass theme with slap bass, tight drums and electric guitar through the sunset docks.'),
 'coast-breakwater':('sf_sitar','sf_pan','sf_guitar','desert','sf_bass','sf_strings',
          'Desert rally / orchestral dance','Sitar and pan-flute colors over urgent strings, hand drums and an electronic racing pulse.'),
 'city':('sf_lead','sf_brass','lead','house','sf_bass','sf_drive',
          'Neon booster / electro rock','A bright synth hook, electric-guitar accents and rolling bass build into a full neon-racing chorus.'),
 'city-factory':('sf_drive','sf_brass','sf_clean','breaks','sf_bass','sf_drive',
          'Factory pursuit / racing rock','Distorted guitar, driving bass and live-kit breaks race through the machinery; short fills launch each phrase.'),
 'city-nightshift':('sf_lead','sf_bell','pad','trance','sf_bass','sf_strings',
          'Orbital rush / symphonic trance','An expansive synth theme, rising strings and fast electronic drums lift the race into an orbital chorus.'),
 'mountain':('sf_flute','sf_brass','sf_guitar','folk','sf_bass','sf_pizz',
          'Forest adventure / orchestral pop','A lively flute theme, bouncing strings, guitar strums and full drums carry the woodland adventure.'),
 'mountain-pass':('sf_piano','sf_bell','sf_strings','ice','sf_bass','sf_drive',
          'Ice sprint / piano rock','Clear piano and bell colors meet electric guitar, bright strings and a fast racing drum groove.'),
 'mountain-summit':('sf_brass','sf_drive','sf_strings','mine','sf_bass','sf_drive',
          'Lava pursuit / symphonic rock','Brass and strings ride over driving electric guitar, heavy toms and a rapid bass line through the lava mine.'),
}
BPM={'coast':152,'coast-harbor':148,'coast-breakwater':158,'city':164,
     'city-factory':168,'city-nightshift':160,'mountain':152,'mountain-pass':156,'mountain-summit':172}
SCENES={}
for track_id,values in SETTINGS.items():
    lead,answer,chord,groove,bass,drive,style,description=values
    SCENES[track_id]={**LANDMARKS[track_id],'lead':lead,'answer':answer,'chord':chord,
        'groove':groove,'bass':bass,'drive':drive,'leadGain':.18,'chordGain':.050,
        'room':.15 if groove in ('trance','ice','folk') else .11,'style':style,'description':description}


def drum_pattern(groove):
    if groove in ('house','trance','ice','folk','desert'): kicks=[0,1,2,3]
    elif groove=='funk': kicks=[0,.75,1.5,2,2.75,3.5]
    elif groove=='breaks': kicks=[0,.75,1.5,2,2.75,3.5]
    else: kicks=[0,.5,1.5,2,2.5,3.5]
    hits=[('kick',p,.46 if p in (0,2) else .36,0) for p in kicks]
    hits += [('snare',1,.28,.02),('snare',3,.31,.02)]
    hits += [('hat',j*.25,.033 if j%2 else .065,.24) for j in range(16)]
    if groove in ('house','trance','ice'):
        hits += [('open',p,.074,.25) for p in (.5,1.5,2.5,3.5)]
        hits += [('clap',p,.075,-.12) for p in (1,3)]
    ornament={'house':'shaker','funk':'rim','desert':'hand','breaks':'metal',
              'folk':'wood','mine':'tom','trance':'shaker','ice':'shaker'}[groove]
    hits += [(ornament,p,.064 if ornament in ('hand','tom') else .043,-.27) for p in (.75,2.25,3.75)]
    return hits
