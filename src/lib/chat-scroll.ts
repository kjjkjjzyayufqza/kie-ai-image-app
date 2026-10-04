export const CHAT_BOTTOM_THRESHOLD_PX = 96;

export function isNearChatBottom(
  viewport: Pick<HTMLElement, "scrollTop" | "scrollHeight" | "clientHeight">,
  threshold = CHAT_BOTTOM_THRESHOLD_PX,
): boolean {
  const distance =
    viewport.scrollHeight - viewport.clientHeight - viewport.scrollTop;
  return distance <= threshold;
}
