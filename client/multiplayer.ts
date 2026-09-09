/** Connection and invitation policy shared by the UI and network client. */
export function gameEndpoint(pageUrl: string, configured = ""): string {
  const page = new URL(pageUrl);
  const endpoint = new URL(configured.trim() || page.origin);
  if (endpoint.protocol === "ws:") endpoint.protocol = "http:";
  if (endpoint.protocol === "wss:") endpoint.protocol = "https:";
  if (
    !["http:", "https:"].includes(endpoint.protocol) ||
    endpoint.username ||
    endpoint.password ||
    endpoint.search ||
    endpoint.hash
  )
    throw Error("赛事服务器地址无效，请配置 HTTP(S) 服务地址");
  if (page.protocol === "https:" && endpoint.protocol !== "https:")
    throw Error("HTTPS 网页必须连接 HTTPS 赛事服务器");
  return endpoint.href.replace(/\/$/, "");
}

export function transportUrl(url: URL, devProxy: boolean): string {
  if (devProxy && (url.protocol === "ws:" || url.protocol === "wss:"))
    url.pathname = "/socket" + url.pathname;
  return url.href;
}

export function parseRoomCode(value: string): string {
  let code = value.trim();
  if (/^https?:\/\//i.test(code)) {
    try {
      code = new URL(code).searchParams.get("room") || "";
    } catch {
      throw Error("请输入有效的房间码或邀请链接");
    }
  }
  if (!/^[a-f0-9]{8}$/i.test(code)) throw Error("请输入有效的房间码或邀请链接");
  return code.toUpperCase();
}

export function invitationUrl(pageUrl: string, roomId: string): string {
  const url = new URL(pageUrl);
  url.search = "";
  url.hash = "";
  url.searchParams.set("room", parseRoomCode(roomId));
  return url.href;
}

export function multiplayerError(error: unknown): string {
  const message =
    error && typeof error === "object" && "message" in error
      ? String(error.message)
      : String(error);
  if (
    /room.*(not found|not defined|does not exist)|invalid room/i.test(message)
  )
    return "房间不存在或已结束，请向好友获取新的邀请链接";
  if (/locked|full|maxClients/i.test(message))
    return "房间已满或比赛已经开始，请等待好友的下一场邀请";
  if (/fetch|network|timeout|timed out|abort|WebSocket|ECONN/i.test(message))
    return "无法连接赛事服务器，请检查网络后重试";
  return message;
}

export async function copyInvitation(value: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    /* HTTP/LAN or denied clipboard: use selection. */
  }
  const input = document.createElement("textarea");
  input.value = value;
  input.style.cssText = "position:fixed;left:-9999px;top:0";
  document.body.append(input);
  input.select();
  try {
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    input.remove();
  }
}
