/**
 * How many participants a session may hold.
 *
 * Every mode has to seat this many: check a mode's layout against it before
 * raising it again. The one hard ceiling in the app is Poker Night, where
 * Texas Hold'em needs `2n + 5` cards from a single honest 52-card deck — see
 * POKER_MAX_PLAYERS.
 */
export const MAX_PARTICIPANTS = 30;
