"""Check notation and report melody overlap without conflating it with taste."""
import json
from difflib import SequenceMatcher
from itertools import combinations
from pathlib import Path
from score_model import parse_bar, chord_pitches, bars
from world_scores import SCORES
from world_arrangements import SCENES, drum_pattern
from phrases import CHARTS

OUT=Path(__file__).resolve().parents[2]/'output/music/world-v6'

def normalized_bar(row,beats=4):
    events=parse_bar(row,beats)
    pitches=[p for _,_,p in events if p is not None]
    root=pitches[0] if pitches else 0
    return tuple((None if p is None else p-root,d) for _,d,p in events)

def fingerprint(rows,beats=4):
    events=[(p,d) for row in rows for _,d,p in parse_bar(row,beats) if p is not None]
    return [(b[0]-a[0],b[1]) for a,b in zip(events,events[1:])]

def similarity(collection,modern):
    result=[]
    for (a,x),(b,y) in combinations(collection.items(),2):
        rows_x=x['a']['notes']+x['b']['notes'] if modern else x['a']+x['b']
        rows_y=y['a']['notes']+y['b']['notes'] if modern else y['a']+y['b']
        bx=x['beats'] if modern else 4
        by=y['beats'] if modern else 4
        xs={normalized_bar(r,bx) for r in rows_x}
        ys={normalized_bar(r,by) for r in rows_y}
        overlap=len(xs&ys)/min(len(xs),len(ys))
        match=SequenceMatcher(None,fingerprint(rows_x,bx),fingerprint(rows_y,by),autojunk=False).ratio()
        result.append({'a':a,'b':b,'sharedTransposedBars':round(overlap,4),'intervalRhythmSimilarity':round(match,4)})
    return sorted(result,key=lambda p:(p['sharedTransposedBars'],p['intervalRhythmSimilarity']),reverse=True)

def main():
    checks=[]
    for key,score in SCORES.items():
        count,rests=0,0
        for part in ('a','b','c'):
            for i,row in enumerate(score[part]['notes']):
                chord=chord_pitches(score[part]['chords'][i])
                assert len(chord) in (3,4)
                anchored=0
                for pos,gate,pitch in parse_bar(row,score['beats']):
                    assert gate>=.25 and pos+gate<=score['beats']
                    if pitch is None: rests+=1; continue
                    count+=1
                    assert 55<=score['key']+pitch<=90,(key,part,i,pitch)
                    if pitch%12 in {p%12 for p in chord}: anchored+=1
                assert anchored,(key,part,i,'no harmonic anchor')
        assert rests>=6,(key,'no breathing space')
        for local in range(8):
            assert all(0<=p<score['beats'] for _,p,_,_ in drum_pattern(key,local,'b'))
        checks.append({'id':key,'authoredBars':24,'playbackBars':len(list(bars(score))),
                       'notes':count,'rests':rests,'meter':score['meter'],'mode':score['mode'],
                       'form':score['form'],'style':SCENES[key]['style']})
    before=similarity(CHARTS,False)
    after=similarity(SCORES,True)
    assert max(x['sharedTransposedBars'] for x in after)<=.125,after[:3]
    assert max(x['intervalRhythmSimilarity'] for x in after)<.45,after[:3]
    assert len({tuple(SCENES[k]['bassline']) for k in SCORES})==9
    assert len({tuple(drum_pattern(k,0,'a')) for k in SCORES})==9
    report={'revision':6,'checks':checks,'beforePairs':before,'afterPairs':after,
            'note':'Relative-pitch and rhythm checks establish written differences, not perceived quality or cultural authenticity.'}
    OUT.mkdir(parents=True,exist_ok=True)
    (OUT/'composition-check.json').write_text(json.dumps(report,indent=2)+'\n','utf-8')
    print(json.dumps({'scores':len(checks),'authoredBars':sum(c['authoredBars'] for c in checks),
                      'beforeWorstPair':before[0],'afterWorstPair':after[0],'result':'passed'}))

if __name__=='__main__': main()
