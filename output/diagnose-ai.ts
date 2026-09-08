import {aiInput} from '../shared/ai.ts';
import {TRACKS,continuousTrack} from '../shared/track.ts';
import {spawnCar,stepCar} from '../shared/race.ts';
import {drivingZoneAt} from '../shared/levels.ts';
for(const track of TRACKS){const c=spawnCar(1,'diagnose',track);for(let i=0;i<60*240&&c.lap<1;i++){const input=aiInput(c,track,'hard',i/60),old=c.collisionCount,p=continuousTrack(c.x,c.z,c.lastT,track,c.routeBranch),slip=c.slipAngle;stepCar(c,input,1/60,track);if(c.collisionCount>old)console.log(JSON.stringify({track:track.id,t:p.t,lateral:p.lateral,kind:c.lastCollisionKind,impact:c.lastCollisionStrength,speed:c.speed,slip,input,zone:drivingZoneAt(track.id,p.t,p.lateral)}));}}

