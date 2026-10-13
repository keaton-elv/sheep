// Letters about what happened on the farm while you were away. STUB — implemented by a UI agent.

export function initMailbox(): void {}

export function unreadMailCount(): number {
  return 0;
}

export function onMailChange(_fn: (unread: number) => void): () => void {
  return () => {};
}
