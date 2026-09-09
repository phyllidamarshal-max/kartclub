"""Reproducible offline audio tool setup; no runtime/game dependencies added."""
from pathlib import Path
import hashlib
import io
import subprocess
import sys
import tarfile
import urllib.request

ROOT=Path(__file__).resolve().parents[2]
folder=ROOT/'artifacts/music'
folder.mkdir(parents=True,exist_ok=True)
subprocess.run([sys.executable,'-m','pip','install','--target',str(ROOT/'output/music/python-runtime'),
                'tinysoundfont==0.3.7','pyaudio==0.2.14'],check=True)
archive=folder/'fluid-soundfont-gm_3.1-5.2_all.deb'
url='https://ftp.debian.org/debian/pool/main/f/fluid-soundfont/'+archive.name
if not archive.exists():
    with urllib.request.urlopen(url,timeout=60) as response, archive.open('wb') as out:
        while chunk:=response.read(1024*1024): out.write(chunk)
raw=archive.read_bytes()
assert raw[:8]==b'!<arch>\n'
pos=8
while pos<len(raw):
    header=raw[pos:pos+60];name=header[:16].decode().strip().rstrip('/');size=int(header[48:58]);pos+=60
    if name.startswith('data.tar'):
        with tarfile.open(fileobj=io.BytesIO(raw[pos:pos+size]),mode='r:*') as tar:
            for member in tar.getmembers():
                # Extract only exact expected files to fixed local destinations.
                if member.name.endswith('/FluidR3_GM.sf2'):
                    data=tar.extractfile(member).read()
                    assert hashlib.sha256(data).hexdigest()=='74594e8f4250680adf590507a306655a299935343583256f3b722c48a1bc1cb0'
                    (folder/'FluidR3_GM.sf2').write_bytes(data)
                elif member.name.endswith('/copyright'):
                    (folder/'FluidR3-copyright.txt').write_bytes(tar.extractfile(member).read())
    pos+=size+(size%2)
print('Offline instrument bank ready; game playback uses rendered Ogg/AAC only.')
