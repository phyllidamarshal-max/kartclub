"""Stereo-linked offline level matching with short lookahead peak control."""
import numpy as np
from scipy.ndimage import minimum_filter1d, uniform_filter1d


def master(mix,sr,target_db=-15.5,ceiling=.84):
    target=10**(target_db/20)
    # Make every smoothed gain sample no greater than its required local gain:
    # the minimum window contains the entire shorter averaging window.
    # Circular windows preserve the exact repeating boundary.
    hold=2*round(.012*sr)+1
    smoothing=2*round(.004*sr)+1
    out=mix.astype(np.float64)
    for _ in range(4):
        rms=float(np.sqrt(np.mean(out**2)))
        out*=target/max(rms,1e-9)
        peaks=np.max(np.abs(out),axis=1)
        required=np.minimum(1,ceiling/np.maximum(peaks,1e-9))
        safe=minimum_filter1d(required,size=hold,mode='wrap')
        gain=uniform_filter1d(safe,size=smoothing,mode='wrap')
        out*=gain[:,None]
    assert np.max(np.abs(out))<ceiling+.001
    return out.astype(np.float32)
