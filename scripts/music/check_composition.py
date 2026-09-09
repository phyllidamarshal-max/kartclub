"""Check this arrangement's chosen triadic phrase rules, not subjective taste."""
import json
from pathlib import Path
from phrases import CHARTS, chord_pitches, parse_bar, close_voicing

report=[]
for track_id,chart in CHARTS.items():
    assert len(chart['chords'])==len(chart['a'])==len(chart['b'])==8
    count=0
    held=0
    rests=0
    transitions=[]
    previous=None
    for symbol in chart['chords']:
        current=close_voicing(chart['key'],symbol,previous)
        if previous: transitions.append(max(abs(a-b) for a,b in zip(current,previous)))
        assert len(set(current))==3 and current==sorted(current)
        previous=current
    assert max(transitions)<=7, (track_id,'abrupt accompaniment movement',transitions)
    for section in ('a','b'):
        for bar,notation in enumerate(chart[section]):
            chord={n%12 for n in chord_pitches(chart['chords'][bar])}
            for at,length,pitch in parse_bar(notation):
                assert length>=.25 and at+length<=4
                if pitch is None:
                    rests+=1
                    continue
                count+=1
                assert 55<=chart['key']+pitch<=88, (track_id,'lead register',pitch)
                if length>=.75 or at in (0,2):
                    held+=1
                    assert pitch%12 in chord,(track_id,section,bar,at,pitch,chart['chords'][bar])
    assert rests>=4, (track_id,'no space between phrases')
    report.append(dict(id=track_id,authoredBars=16,notes=count,anchoredNotes=held,
                       phraseRests=rests,maxAccompanimentVoiceStep=max(transitions)))
out=Path(__file__).resolve().parents[2]/'output/music/composition-check.json'
out.write_text(json.dumps({'revision':5,'checks':report},indent=2)+'\n','utf-8')
print(json.dumps({'tracks':len(report),'authoredBars':len(report)*16,'result':'passed'}))
