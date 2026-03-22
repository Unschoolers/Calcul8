export function removeById<T extends { id: number }>(items: T[], id: number): T[] {
  return items.filter((item) => item.id !== id);
}

export function upsertById<T extends { id: number }>(
  items: T[],
  nextItem: T,
  alternateIds: number[] = []
): T[] {
  const existingIndex = items.findIndex((item) =>
    item.id === nextItem.id || alternateIds.includes(item.id)
  );
  if (existingIndex >= 0) {
    const nextItems = [...items];
    nextItems.splice(existingIndex, 1, nextItem);
    return nextItems;
  }
  return [...items, nextItem];
}
