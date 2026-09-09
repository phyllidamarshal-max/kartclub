"""Offline sampled instruments from the MIT-licensed FluidR3 GM bank.

Only complete rendered compositions are shipped to the game. Run
`python scripts/music/setup_band.py` once before rebuilding the music.
"""
from pathlib import Path
import hashlib
import sys
import numpy as np

ROOT=Path(__file__).resolve().parents[2]
SR=44100
BANK=ROOT/'artifacts/music/FluidR3_GM.sf2'
BANK_SHA256='74594e8f4250680adf590507a306655a299935343583256f3b722c48a1bc1cb0'
sys.path.insert(0,str(ROOT/'output/music/python-runtime'))

PRESETS={'sf_piano':0,'sf_ep':4,'sf_bell':8,'sf_guitar':25,'sf_clean':27,
         'sf_drive':30,'sf_bass':34,'sf_slap':36,'sf_strings':48,'sf_pizz':45,
         'sf_trumpet':56,'sf_brass':61,'sf_sax':65,'sf_flute':73,'sf_pan':75,
         'sf_lead':81,'sf_sitar':104, 'sf_nylon':24, 'sf_steelpan':114,
         'sf_violin':40, 'sf_oboe':68, 'sf_shanai':111, 'sf_horn':60,
         'sf_celeste':8, 'sf_vibes':11, 'sf_timpani':47, 'sf_taiko':116,
         'sf_banjo':105, 'sf_acbass':32, 'sf_marimba':12, 'sf_accordion':21,
         'sf_clarinet':71, 'sf_harp':46, 'sf_harpsichord':6, 'sf_square':80,
         'sf_harmonica':22, 'sf_organ':16}
DRUMS={'kick':36,'snare':38,'hat':42,'open':46,'shaker':70,'rim':37,
       'tom':45,'wood':76,'hand':62,'metal':56,'crash':49,'ride':51,'clap':39,
       'dum':64,'tak':60,'conga':63,'tambourine':54,'lowtom':41}
_bank=None


class SampleBank:
    def __init__(self):
        import tinysoundfont
        if not BANK.exists(): raise RuntimeError('Run scripts/music/setup_band.py before rendering')
        bank_data=BANK.read_bytes()
        if hashlib.sha256(bank_data).hexdigest()!=BANK_SHA256:
            raise RuntimeError('Unexpected FluidR3 sound bank checksum')
        self.synth=tinysoundfont.Synth(gain=-6,samplerate=SR)
        # Native fopen does not handle this workspace's Chinese Windows path.
        self.sfid=self.synth.sfload(bank_data)

    def note(self,kind,pitch,gate,velocity=106,drum=False):
        channel=9 if drum else 0
        self.synth.sounds_off()
        self.synth.program_select(channel,self.sfid,0,0 if drum else PRESETS[kind],is_drums=drum)
        assert self.synth.noteon(channel,pitch,velocity), (kind,pitch)
        on=np.frombuffer(self.synth.generate(round(gate*SR)),dtype=np.float32).copy().reshape(-1,2)
        self.synth.noteoff(channel,pitch)
        release=.30 if drum else .085
        off=np.frombuffer(self.synth.generate(round(release*SR)),dtype=np.float32).copy().reshape(-1,2)
        result=np.concatenate([on,off]).mean(axis=1)
        result[-round(.035*SR):]*=np.linspace(1,0,round(.035*SR))
        result[:round(.002*SR)]*=np.linspace(0,1,round(.002*SR))
        peak=float(np.max(np.abs(result)))
        if peak<1e-5: raise RuntimeError(f'Silent sampled instrument: {kind}/{pitch}')
        return (result/peak*.90).astype(np.float32)


def bank():
    global _bank
    if _bank is None: _bank=SampleBank()
    return _bank


def sampled_voice(kind,note,length):
    return bank().note(kind,note,length)


def sampled_drum(kind):
    gate={'kick':.23,'snare':.15,'hat':.025,'open':.13,'crash':.55,'ride':.13}.get(kind,.10)
    return bank().note(kind,DRUMS[kind],gate,drum=True)
