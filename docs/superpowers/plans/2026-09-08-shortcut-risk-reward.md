# Shortcut risk and reward

Scope: improve the five existing optional branches in the actual game. Preserve main circuits, race duration classes, controls and junction progress rules.

References:
- [KartRider official mine guide](https://mpopkart.tiancity.com/homepage/article2019/2022/03/31/1315.html): narrow entries, planned drift initiation and precise steering.
- [QQ Speed mobile: City Internet Cafe](https://www.taptap.cn/moment/15215096967988286): shortcut entry timing, straighten after a turn, and the time cost of forcing a bad line.

Design: generous connected entry/exit funnels; individually tuned narrow sections and directional changes inside the branch. Roads and visible boundaries share the physics width. No invisible gates, forced jumps or new vehicle privileges. Measure clean traversal against the same main-road segment, including approach and exit acceleration; errors must cost real time under existing physics. AI may decline a congested or poorly aligned entry. Existing legacy/custom tracks keep fixed-width fallback.

- [x] Record baseline distance and legal-input traversal results.
- [x] Add regressions for widths, continuous joins, clean time reward and error cost.
- [x] Implement branch designs, shared width sampling, AI and readable approach signs.
- [x] Verify all five branches, late exits, crowded entries, relevant regressions and build.
- [x] Capture runtime views and report measured results and limits.
