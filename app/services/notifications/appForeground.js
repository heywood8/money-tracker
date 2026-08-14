/**
 * Is the app on screen right now?
 *
 * Read by the background bank checker to decide whether the "operations added"
 * receipt is worth posting. A run does not *start* under an open app — the
 * scheduler bails out and re-enqueues when its `inForeground` flag is set — but
 * it can very easily *finish* under one: a wakeup released from Doze, or one
 * already in flight as the user launches the app, reports its result after the
 * app is in front of them. That is the case this guards, and it is a common one
 * because opening the app also triggers an ingestion of its own, so the wakeup
 * is often reporting a booking the user just watched appear.
 *
 * `AppState.currentState` answers it in every context the task runs in: in a
 * headless JS context (app killed or backgrounded) Android reports the React
 * context's lifecycle state as 'background', while a run whose app has come to
 * the front reports 'active'. A transitional 'inactive' (shade pulled down,
 * permission dialog on top) counts as not-foreground: it is the uncertain state,
 * and there posting is the safer failure — an unwanted tray row is a smaller
 * loss than a booking the user never learns about.
 */

import { AppState } from 'react-native';

/**
 * Whether the app is currently in the foreground.
 * @returns {boolean}
 */
export const isAppInForeground = () => AppState.currentState === 'active';

export default isAppInForeground;
