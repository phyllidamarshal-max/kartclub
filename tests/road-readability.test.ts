import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { TRACKS, trackPoint, angleDiff } from "../shared/track.ts";
import { roadsideClear } from "../client/scenery.ts";
import { roadTurnMarkers, buildRoadReadability } from "../client/road-readability.ts";

test("turn signs follow actual turn direction and remain outside all drivable branches", () => {
  for (const track of TRACKS) {
    const before=JSON.stringify(track), markers=roadTurnMarkers(track);
    assert.ok(markers.length > 0 && markers.length <= 24, track.id);
    for (const marker of markers) {
      const a=trackPoint(marker.t-9/track.length,track), b=trackPoint(marker.t+9/track.length,track);
      assert.equal(marker.turn,Math.sign(angleDiff(b.heading,a.heading)));
      assert.ok(roadsideClear(track,marker.x,marker.z,1.7),`${track.id} ${marker.t}`);
    }
    const scene=new THREE.Scene();
    buildRoadReadability(scene,track);
    assert.ok(scene.getObjectByName("road-turn-signs"));
    assert.equal(JSON.stringify(track),before,"visual construction must not alter collision/race geometry");
  }
});
