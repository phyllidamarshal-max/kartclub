import {TRACKS,nearestTrack} from '../shared/track.ts';
for(const track of TRACKS)console.log(track.id,track.width,track.length.toFixed(0),track.obstacles.map(o=>({...o,t:nearestTrack(o.x,o.z,track).t,side:nearestTrack(o.x,o.z,track).lateral})));
