from pathlib import Path
import subprocess
import json

OUT = Path(__file__).resolve().parent
VIDEO = Path('C:/Users/teery/Desktop/跑跑/20260908-103408.mp4')
LOGO = Path('C:/Users/teery/Desktop/跑跑/exec-32b8a6c6-b48f-470a-9bf1-5fb017c4ca1e(1).png')
CREAM = '0xF5F1E6'
GREEN = '0x173E30'
BOLD = 'C\\:/Windows/Fonts/arialbd.ttf'
REG = 'C\\:/Windows/Fonts/arial.ttf'

def run(args):
    subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', *args], check=True)

def render_intro():
    graph = (
        '[0:v]crop=2000:900:280:150,scale=1560:1270:force_original_aspect_ratio=increase,crop=1560:1270,setsar=1,fps=24,setpts=PTS-STARTPTS[game];'
        '[1:v]format=rgba[base];'
        '[base][game]overlay=1000:0:shortest=1[scene];'
        '[2:v]crop=882:898:186:178,scale=410:-1,format=rgba,fade=t=in:st=0.15:d=0.6:alpha=1[logo];'
        '[scene][logo]overlay=295:260:shortest=1[branded];'
        f"[branded]drawbox=x=996:y=0:w=4:h=1270:color=0xCBF06B:t=fill,"
        f"drawtext=fontfile='{BOLD}':text='KART CLUB':fontsize=84:fontcolor={GREEN}:x=(1000-tw)/2:y=742:alpha='min(1,max(0,(t-0.4)/0.5))',"
        f"drawtext=fontfile='{REG}':text='GAMEPLAY PREVIEW':fontsize=27:fontcolor={GREEN}:x=(1000-tw)/2:y=862:alpha='min(1,max(0,(t-0.65)/0.5))',"
        f"drawbox=x=454:y=958:w=92:h=5:color={GREEN}:t=fill,fade=t=in:st=0:d=0.3:color={CREAM},format=yuv420p[v]"
    )
    run(['-ss','23','-i',str(VIDEO),'-f','lavfi','-i',f'color=c={CREAM}:s=2560x1270:r=24:d=4','-loop','1','-framerate','24','-i',str(LOGO),'-filter_complex',graph,'-map','[v]','-an','-t','4','-c:v','libx264','-preset','fast','-crf','18','-movflags','+faststart',str(OUT/'kart-club-intro-4s-silent.mp4')])

def render_outro():
    graph = (
        '[0:v]format=rgba[base];'
        '[1:v]crop=882:898:186:178,scale=330:-1,format=rgba,fade=t=in:st=0.1:d=0.65:alpha=1[logo];'
        '[base][logo]overlay=1115:225:shortest=1[branded];'
        f"[branded]drawtext=fontfile='{BOLD}':text='KART CLUB':fontsize=86:fontcolor={GREEN}:x=(w-tw)/2:y=655:alpha='min(1,max(0,(t-0.35)/0.5))',"
        f"drawtext=fontfile='{REG}':text='SEE YOU ON THE GRID':fontsize=30:fontcolor={GREEN}:x=(w-tw)/2:y=791:alpha='min(1,max(0,(t-0.7)/0.5))',"
        'drawbox=x=1224:y=899:w=112:h=6:color=0xA8D454:t=fill,format=yuv420p[v]'
    )
    run(['-f','lavfi','-i',f'color=c={CREAM}:s=2560x1270:r=24:d=4','-loop','1','-framerate','24','-i',str(LOGO),'-filter_complex',graph,'-map','[v]','-an','-t','4','-c:v','libx264','-preset','fast','-crf','18','-movflags','+faststart',str(OUT/'kart-club-outro-4s-silent.mp4')])

render_intro()
render_outro()
for name in ['intro','outro']:
    source=OUT/f'kart-club-{name}-4s-silent.mp4'
    run(['-ss','2','-i',str(source),'-frames:v','1','-vf','scale=1280:635',str(OUT/f'{name}-preview.jpg')])
    result=subprocess.check_output(['ffprobe','-v','error','-show_entries','stream=codec_type,width,height,r_frame_rate:format=duration','-of','json',str(source)],text=True)
    print(name, result, flush=True)
