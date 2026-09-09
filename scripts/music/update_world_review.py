"""Update the existing review room after installing the nine scene scores."""
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
path=ROOT/'output/music/review.html'
html=path.read_text('utf-8')
html=html.replace('/audio/music/manifest.json?v=5','/audio/music/manifest.json?v=6')
html=html.replace('Nine worlds.<br>Nine soundtracks.','Nine worlds.<br>Nine distinct themes.')
html=html.replace('The arcade band edition. Brass fanfares, electric guitars, piano and live-kit drums at 148–172 BPM. Pick a world for the full race, or jump to the build-and-chorus highlights below.',
                  'From desert hand drums to woodland jigs and neon breakbeats: each world has its own melody, rhythm and character. Play a complete loop or compare the nine themes below.')
html=html.replace('Compare previous &amp; rewritten tracks ↓','Hear the nine new themes ↓')
start=html.index('<section id="compare"')
end=html.index('</section>',start)+len('</section>')
html=html[:start]+'''<section id="compare" aria-label="Compare scene themes" class="comparisons">
<h2>Nine scenes. Nine musical identities.</h2>
<p class="intro">Start with each new chorus. Open the comparison to hear the previous version or the new melody on the same piano, in the same key and at 120 BPM. This lets you compare the actual notes and rhythms.</p>
<div class="comparison-grid" id="theme-comparisons"></div>
</section>'''+html[end:]
anchor="document.addEventListener('click',event=>{"
insert='''$('#theme-comparisons').innerHTML=manifest.tracks.map((t,i)=>`<article><h3>${scenes[i]}</h3><p>${t.title} · ${t.meter}</p><audio aria-label="New ${scenes[i]} chorus" controls preload="none" src="/output/music/world-v6/${t.id}-highlight.wav"></audio><details><summary>Compare arrangement and melody</summary><p>Previous arrangement</p><audio aria-label="Previous ${scenes[i]} arrangement" controls preload="none" src="/output/music/previous-v5/${t.id}-highlight.wav"></audio><p>New theme alone · same piano, key &amp; tempo</p><audio aria-label="${scenes[i]} melody on the same piano" controls preload="none" src="/output/music/world-v6/${t.id}-melody.wav"></audio></details></article>`).join('');
'''
if "$('#theme-comparisons').innerHTML=" not in html:
    html=html.replace(anchor,insert+anchor,1)
path.write_text(html,'utf-8')

credits=ROOT/'public/audio/music/CREDITS.txt'
text=credits.read_text('utf-8').replace('arcade band edition (revision 5)','scene identities edition (revision 6)')
note='''
Revision 6 replaces all nine scene compositions with 216 authored bars across
independent A, B and bridge sections. Loops use different forms and meters.
The desert piece uses Phrygian-dominant color, plucked strings, a reed patch and
hand drums. It is an original cinematic scene score, not an authentic maqam
performance or a recording of traditional regional instruments.
Rebuild: scripts/music/render_worlds.py; validate: scripts/music/validate.py --staging;
install locally: scripts/music/publish_worlds.py. New melodies can be compared on
one piano, key and tempo in output/music/world-v6/*-melody.wav.
'''
if 'Revision 6 replaces' not in text:
    text=text.replace('Lobby addition:',note+'\nLobby addition:',1)
credits.write_text(text,'utf-8')
