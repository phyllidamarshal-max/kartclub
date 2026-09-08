# Variable-width racing routes

User steering extends the nine-world work: redesign the driveable road to create passing choices, narrow technical sections and rewarding alternate routes, inspired by KartRider/QQ Speed.

Design: each lap has a wide starting/passing zone, smooth transitions to one or more narrow sections, and widening on corner exits. Profiles are deliberately different per world. Existing race progress remains canonical and connected; shortcuts join defined progress points and cannot award teleport progress. No jump physics is implied.

Shared interface: `Track.widthProfile?: readonly {t:number,width:number}[]`, `Track.shortcutWidth?:number`, `trackWidth(t,track):number`, `trackWidthRange(track):{min:number,max:number}`. Profiles are immutable and periodic; empty profile uses nominal track.width. Rendering and continuous collision projection use the same width function. Shortcuts use shortcutWidth or legacy 7m.

- [x] Add nine handcrafted width profiles, physics/projection tests and immutable profile assembly in shared/road-design.ts and shared/track.ts.
- [x] Evaluate safe alternate-route candidates; add original smooth branches to selected worlds with narrower roads and visibly open entry/exit junctions.
- [x] Render road, curbs, markings, guardrails, ground platforms, tunnel clearance and minimap from the same actual boundaries; add narrowing warning signs.
- [x] Update route cards to show true min–max width, distinguish passing and precision sections, and keep locale support.
- [x] Verify collision bounds, continuous progress, AI completion, branch entry/exit, resources, browser driving and nine-scene gallery. Preserve earned career stars and version best times separately.

Reference reading: official KartRider Pirate Shark Island guide describes narrow coast roads and route/speed decisions (https://mpopkart.tiancity.com/homepage/article2019/2021/05/16/1009.html); QQ Speed official-attributed We Are in Love route guide discusses U-turn shortcut slowdown versus regular-route boost charging (https://www.gamersky.com/handbooksy/201905/1185146.shtml). Designs and assets are original.
