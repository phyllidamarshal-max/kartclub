from pathlib import Path
p=Path('client/main.ts');s=p.read_text(encoding='utf-8')
s=s.replace('focusDialog, releaseDialog }', 'focusDialog, releaseDialog, withPending }')
s=s.replace('<kbd ', '<kbd data-no-i18n ').replace('<kbd>', '<kbd data-no-i18n>')
s=s.replace('class="key-button"', 'class="key-button" data-no-i18n')
# Avoid inventing zero balances while the race service is unavailable.
for field in ['received','reserved','pending','paid']:
    s=s.replace('${money(p?.'+field+')}', '${p ? money(p.'+field+') : "—"}')
s=s.replace('${money(net.account?.pons)}', '${net.account ? money(net.account.pons) : "—"}')
s=s.replace('${money(net.account?.tickets)}', '${net.account ? money(net.account.tickets) : "—"}')
# Remove legacy units from direct fragments. Longer source messages stay catalog keys.
s=s.replace('100 $PONS','100 points').replace('<small>$PONS</small>','<small>points</small>').replace('<small>PONS</small>','<small>points</small>')
s=s.replace(')} PONS',' )} points') if False else s
s=s.replace('${net.account ? money(net.account.pons) : "—"} PONS','${net.account ? money(net.account.pons) : "—"} points')
s=s.replace('${money(a.amount)} PONS','${money(a.amount)} points').replace('${money(r.award)} PONS','${money(r.award)} points')
s=s.replace('function claims() {\n', 'function claims() {\n  if (!net.account) return `<div class="empty-state"><p>Account unavailable</p><small>Connect to the race service to view your actual rewards.</small></div>`;\n')
# Keep selection focus and scroll when the track grid updates.
s=s.replace('    lobby();\n    return;\n  }\n  if (el.dataset.track)', '    lobby();\n    document.querySelector<HTMLElement>(`[data-mode="${selection.raceMode}"]`)?.focus();\n    return;\n  }\n  if (el.dataset.track)')
s=s.replace('    const openModal = modal;\n', '    const openModal = modal;\n    const scrollTop = document.querySelector(".modal-scroll")?.scrollTop || 0;\n')
s=s.replace('    showModal(openModal);\n    return;', '    showModal(openModal);\n    const scroll = document.querySelector(".modal-scroll");\n    if (scroll) scroll.scrollTop = scrollTop;\n    document.querySelector<HTMLElement>(`[data-track="${selection.trackId}"]`)?.focus({ preventScroll: true });\n    return;')
s=s.replace('    void act(el.dataset.action).catch((e) => toast((e as Error).message));', '    void withPending(el, () => act(el.dataset.action!)).catch((e) => toast((e as Error).message));')
a=s.index('else if (el.dataset.claim)'); b=s.index('\n});',a)
old=s[a:b]
s=s[:a]+old.replace('    void net\n', '    void withPending(el, () => net\n').replace('      .catch((e) => toast(e.message));', '      ).catch((e) => toast(e.message));')+s[b:]
# Translate only changed text nodes in the animation loop, not the whole interface.
s=s.replace('  drawMinimap(cars);\n  translateScreen();', '  drawMinimap(cars);\n  for (const id of ["objective", "race-feedback", "race-status", "boost-label"])\n    localize($("#" + id));')
p.write_text(s,encoding='utf-8')
