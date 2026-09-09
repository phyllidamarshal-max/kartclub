"""Validate ten new written scores and compare motifs across all nineteen."""
import json
from pathlib import Path
from expansion_scores import EXPANSION_SCORES
from expansion_arrangements import PROFILES, drum_pattern
from world_scores import SCORES
from world_arrangements import SCENES, drum_pattern as old_drums
from score_model import parse_bar,chord_pitches,voicing,bars
from check_world_composition import similarity

OUT=Path(__file__).resolve().parents[2]/'output/music/expansion-v7'

def main():
    maps=json.loads((OUT/'maps.json').read_text('utf-8'))
    assert {m['id'] for m in maps}==set(EXPANSION_SCORES)==set(PROFILES)
    checks=[]
    for key,score in EXPANSION_SCORES.items():
        notes,rests=0,0
        for part in ('a','b','c'):
            previous=None
            for row,symbol in zip(score[part]['notes'],score[part]['chords']):
                chord=chord_pitches(symbol)
                previous=voicing(score['key'],symbol,previous)
                assert len(previous)==len(set(previous))
                anchors=0
                for at,gate,pitch in parse_bar(row,score['beats']):
                    assert gate>=.25
                    if pitch is None: rests+=1; continue
                    assert 55<=score['key']+pitch<=90,(key,pitch)
                    notes+=1
                    anchors+=pitch%12 in {p%12 for p in chord}
                assert anchors,(key,part,row)
        assert rests>=6,(key,'missing phrase space')
        for local in range(8):
            assert all(0<=at<score['beats'] for _,at,_,_ in drum_pattern(key,local,'b'))
        checks.append(dict(id=key,authoredBars=24,playbackBars=len(list(bars(score))),notes=notes,rests=rests,
                           meter=score['meter'],mode=score['mode'],form=score['form']))
    combined={**SCORES,**EXPANSION_SCORES}
    pairs=similarity(combined,True)
    assert max(p['sharedTransposedBars'] for p in pairs)<=.125,pairs[:5]
    worst=max(pairs,key=lambda p:p['intervalRhythmSimilarity'])
    assert worst['intervalRhythmSimilarity']<.45,worst
    assert len({tuple(p['bassline']) for p in [*SCENES.values(),*PROFILES.values()]})==19
    grooves=[tuple(old_drums(k,0,'a')) for k in SCORES]+[tuple(drum_pattern(k,0,'a')) for k in EXPANSION_SCORES]
    assert len(set(grooves))==19
    report=dict(revision=7,newTracks=len(checks),allTracks=len(combined),checks=checks,pairs=pairs,
                note='Written interval/rhythm comparison, not a subjective listening score.')
    (OUT/'composition-check.json').write_text(json.dumps(report,indent=2)+'\n','utf-8')
    print(json.dumps(dict(newTracks=10,totalTracks=19,authoredNewBars=240,worstSharedBarPair=pairs[0],worstIntervalPair=worst,result='passed')))

if __name__=='__main__': main()
