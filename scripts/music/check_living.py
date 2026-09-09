"""Check independent authored phrases and explicit scene-event specifications."""
import json
from pathlib import Path
from living_scores import SCORES
from living_arrangements import PROFILES,drum_pattern
from environment_audio import ELEMENTS
from score_model import parse_bar,chord_pitches,voicing
from check_world_composition import similarity,normalized_bar
from world_scores import SCORES as ORIGINAL
from expansion_scores import EXPANSION_SCORES

OUT=Path(__file__).resolve().parents[2]/'output/music/living-v8'

def main():
    assert set(SCORES)==set(PROFILES)==set(ELEMENTS)
    old={**ORIGINAL,**EXPANSION_SCORES};checks=[]
    for k,s in SCORES.items():
        rests=0;old_rows={normalized_bar(r,old[k]['beats']) for p in 'ab' for r in old[k][p]['notes']}
        matches=0
        for p in 'abc':
            previous=None
            for notation,ch in zip(s[p]['notes'],s[p]['chords']):
                events=parse_bar(notation)
                pitches=chord_pitches(ch)
                assert any(n is not None and n%12 in {c%12 for c in pitches} for _,_,n in events),(k,p,notation)
                previous=voicing(s['key'],ch,previous)
                assert len(previous)==len(set(previous))
                rests+=sum(n is None for _,_,n in events)
                assert all(55<=s['key']+n<=90 for _,_,n in events if n is not None)
                if p!='c': matches+=normalized_bar(notation) in old_rows
        assert rests>=12 and matches<=2,(k,rests,matches)
        assert len(ELEMENTS[k])>=3
        for local in range(8):assert all(0<=at<4 for _,at,_,_ in drum_pattern(k,local,'b'))
        for pos,*_ in PROFILES[k]['bassline']:assert 0<=pos<4
        checks.append(dict(id=k,authoredBars=20,rests=rests,oldMatchingBars=matches,elements=ELEMENTS[k]))
    pairs=similarity(SCORES,True)
    assert max(p['sharedTransposedBars'] for p in pairs)<=.125,pairs[:3]
    assert max(p['intervalRhythmSimilarity'] for p in pairs)<.45
    report=dict(revision=8,tracks=19,authoredBars=380,checks=checks,pairs=pairs,
                note='20 newly authored bars per map; four bridge bars repeated once. Structural checks do not claim subjective quality.')
    OUT.mkdir(parents=True,exist_ok=True)
    (OUT/'composition-check.json').write_text(json.dumps(report,indent=2)+'\n','utf-8')
    print(json.dumps(dict(tracks=19,authoredBars=380,worstShared=pairs[0],worstInterval=max(pairs,key=lambda p:p['intervalRhythmSimilarity']),result='passed')))

if __name__=='__main__':main()
