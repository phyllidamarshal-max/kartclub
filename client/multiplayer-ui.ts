import type { Snapshot } from "../shared/protocol.ts";
import { getTrack } from "../shared/track.ts";
import { MODE_NAMES } from "../shared/gameplay.ts";
import { invitationUrl } from "./multiplayer.ts";
import { tr } from "./i18n.ts";

const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ]!,
  );

export function serviceMarkup(
  state: "checking" | "online" | "offline",
  error = "",
) {
  return `<div class="multiplayer-service ${state}" role="status"><span class="status-dot ${state === "offline" ? "off" : ""}"></span><span>${tr(state === "online" ? "赛事服务已连接" : state === "checking" ? "正在连接赛事服务器…" : "赛事服务暂不可用")}${state === "offline" && error ? `<small>${escape(tr(error))}</small>` : ""}</span>${state === "offline" ? `<button class="text-button" data-action="reconnect-service">${tr("重新连接")}</button>` : ""}</div>`;
}

export function friendRoomMarkup(
  s: Snapshot | null,
  sessionId: string | undefined,
  roomId: string,
  pageUrl: string,
  palette: string[],
  connected: boolean,
) {
  const invite = roomId ? invitationUrl(pageUrl, roomId) : "";
  const me = s?.players.find((player) => player.id === sessionId);
  return `<span class="eyebrow">PADDOCK / MULTIPLAYER</span><h2>${tr("发车前的最后准备")}</h2>
    <div class="room-code">${tr("房间码")} <b dir="ltr" data-no-i18n>${escape(roomId || tr("连接中"))}</b><button class="text-button" data-action="copy">${tr("复制房间码")}</button></div>
    <div class="room-invite"><label for="invite-link">${tr("邀请好友")}</label><div><input id="invite-link" aria-label="${tr("邀请链接")}" readonly dir="ltr" data-no-i18n value="${escape(invite)}"><button class="button outline" data-action="copy-invite">${tr("复制邀请链接")}</button></div></div>
    <div class="room-slots">${Array.from(
      { length: s?.maxPlayers || 8 },
      (_, slot) => {
        const player = s?.players.find((candidate) => candidate.slot === slot);
        return `<div class="slot ${player ? "occupied" : ""} ${player?.ready ? "is-ready" : ""}"><span class="slot-avatar" style="--slot-color:${palette[slot % palette.length]}">${String(slot + 1).padStart(2, "0")}</span><b ${player ? 'data-no-i18n dir="auto"' : ""}>${player ? escape(player.name) : tr("等待车手")}</b><small>${tr(player ? (!player.connected ? "重连中" : player.ready ? "✓ 已准备" : "准备中") : "空席")}${player?.id === sessionId ? ` · ${tr("你")}` : ""}</small></div>`;
      },
    ).join("")}</div>
    ${s ? `<div class="room-summary"><span>${tr("{n} 圈", { n: s.laps })} · ${escape(tr(getTrack(s.trackId).name))} · ${tr(MODE_NAMES[s.raceMode])}</span><span>${tr(s.free ? "免费 / 人" : "10 TICKET / 人")}</span></div>` : ""}
    <p class="form-note">${tr("至少2人全部准备后自动发车。关闭此面板将离开房间。")}</p>
    <p class="room-wait" aria-live="off"><span>${tr("等待剩余")}</span> <b id="room-wait" dir="ltr">${waitingTime(s?.waitingRemaining)}</b> · <span>${tr("{n} 人已准备", { n: s?.players.filter((player) => player.ready && player.connected).length || 0 })}</span></p>
    <button class="button primary full" data-action="ready" ${!connected || !me || s?.phase !== "waiting" ? "disabled" : ""}>${tr(!connected ? "重连中" : me?.ready ? "取消准备" : "准备出发")} <span>→</span></button>`;
}

export function waitingTime(seconds: number | undefined) {
  if (seconds === undefined) return "—";
  const remaining = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, "0")}`;
}
