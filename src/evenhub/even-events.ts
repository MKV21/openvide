/**
 * Robust event type extraction and normalization for Even Hub SDK events.
 *
 * KEY INSIGHT: The simulator omits eventType for CLICK_EVENT (value 0).
 * When a listEvent or textEvent is present but has no eventType,
 * it IS a click — eventType 0 is the default.
 */

export function getRawEventType(event: any): unknown {
  const raw = (event?.jsonData ?? {}) as Record<string, unknown>;

  // Check all possible locations for an explicit eventType
  const explicit =
    event?.listEvent?.eventType ??
    event?.textEvent?.eventType ??
    event?.sysEvent?.eventType ??
    event?.eventType ??
    raw.eventType ??
    raw.event_type ??
    raw.Event_Type ??
    raw.type;

  if (explicit !== undefined && explicit !== null) {
    return explicit;
  }

  // If a listEvent or textEvent exists but has no eventType,
  // it's a CLICK_EVENT (0 is the default, and the simulator omits it)
  if (event?.listEvent || event?.textEvent) {
    console.log('[getRawEventType] no explicit eventType, defaulting to 0 (CLICK)');
    return 0;
  }

  return undefined;
}

export function normalizeEventType(
  rawEventType: unknown,
  eventTypes: {
    CLICK_EVENT: number;
    SCROLL_TOP_EVENT: number;
    SCROLL_BOTTOM_EVENT: number;
    DOUBLE_CLICK_EVENT: number;
  },
): number | undefined {
  if (typeof rawEventType === 'number') {
    switch (rawEventType) {
      case 0:
        return eventTypes.CLICK_EVENT;
      case 1:
        return eventTypes.SCROLL_TOP_EVENT;
      case 2:
        return eventTypes.SCROLL_BOTTOM_EVENT;
      case 3:
        return eventTypes.DOUBLE_CLICK_EVENT;
      default:
        return undefined;
    }
  }

  if (typeof rawEventType === 'string') {
    const value = rawEventType.toUpperCase();
    if (value.includes('DOUBLE')) return eventTypes.DOUBLE_CLICK_EVENT;
    if (value.includes('CLICK')) return eventTypes.CLICK_EVENT;
    if (value.includes('SCROLL_TOP') || value.includes('UP'))
      return eventTypes.SCROLL_TOP_EVENT;
    if (value.includes('SCROLL_BOTTOM') || value.includes('DOWN'))
      return eventTypes.SCROLL_BOTTOM_EVENT;
  }

  return undefined;
}
