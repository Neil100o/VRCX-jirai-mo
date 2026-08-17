/**
 * Shared, transport-safe message definitions for MomoCall.
 *
 * The signalling relay only routes these envelopes. Audio, SDP and ICE data are
 * never persisted by VRCX and are exchanged directly between call participants.
 */
export const MOMO_CALL_PROTOCOL_VERSION = 1;

export const MomoCallMessageType = Object.freeze({
    REGISTER: 'register',
    REGISTERED: 'registered',
    ERROR: 'error',
    INVITE: 'call.invite',
    ACCEPT: 'call.accept',
    REJECT: 'call.reject',
    OFFER: 'call.offer',
    ANSWER: 'call.answer',
    ICE: 'call.ice',
    HANGUP: 'call.hangup'
});

export const MomoCallPhase = Object.freeze({
    IDLE: 'idle',
    CONNECTING: 'connecting',
    OUTGOING: 'outgoing',
    INCOMING: 'incoming',
    NEGOTIATING: 'negotiating',
    CONNECTED: 'connected',
    ENDED: 'ended',
    ERROR: 'error'
});

const CALL_TYPES = new Set([
    MomoCallMessageType.INVITE,
    MomoCallMessageType.ACCEPT,
    MomoCallMessageType.REJECT,
    MomoCallMessageType.OFFER,
    MomoCallMessageType.ANSWER,
    MomoCallMessageType.ICE,
    MomoCallMessageType.HANGUP
]);

/** @param {unknown} value */
export function isNonEmptyString(value) {
    return typeof value === 'string' && value.trim().length > 0;
}

/**
 * @param {unknown} message
 * @returns {message is Record<string, unknown>}
 */
export function isMomoCallMessage(message) {
    if (!message || typeof message !== 'object') return false;
    const value = /** @type {Record<string, unknown>} */ (message);
    if (value.version !== MOMO_CALL_PROTOCOL_VERSION || !isNonEmptyString(value.type)) return false;
    if (value.type === MomoCallMessageType.REGISTER) {
        return isNonEmptyString(value.userId) && isNonEmptyString(value.deviceId);
    }
    if (CALL_TYPES.has(value.type)) {
        return isNonEmptyString(value.callId) && isNonEmptyString(value.fromUserId);
    }
    return value.type === MomoCallMessageType.REGISTERED || value.type === MomoCallMessageType.ERROR;
}

/** @returns {string} */
export function createMomoCallId() {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
    return `call-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

/** @returns {string} */
export function createMomoCallDeviceId() {
    return `device-${createMomoCallId()}`;
}

/** @param {string} phase */
export function isTerminalMomoCallPhase(phase) {
    return phase === MomoCallPhase.IDLE || phase === MomoCallPhase.ENDED || phase === MomoCallPhase.ERROR;
}
