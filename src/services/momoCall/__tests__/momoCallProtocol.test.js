import { describe, expect, test } from 'vitest';
import {
    MOMO_CALL_PROTOCOL_VERSION,
    MomoCallMessageType,
    MomoCallPhase,
    createMomoCallDeviceId,
    isMomoCallMessage,
    isTerminalMomoCallPhase
} from '../momoCallProtocol.js';

describe('MomoCall protocol', () => {
    test('accepts a valid call invite', () => {
        expect(
            isMomoCallMessage({
                version: MOMO_CALL_PROTOCOL_VERSION,
                type: MomoCallMessageType.INVITE,
                callId: 'call-1',
                fromUserId: 'usr_sender',
                targetUserId: 'usr_receiver'
            })
        ).toBe(true);
    });

    test('rejects messages without a sender or call id', () => {
        expect(isMomoCallMessage({ version: 1, type: MomoCallMessageType.INVITE, callId: 'call-1' })).toBe(false);
        expect(isMomoCallMessage({ version: 1, type: MomoCallMessageType.INVITE, fromUserId: 'usr_sender' })).toBe(false);
    });

    test('creates a distinct device identifier', () => {
        expect(createMomoCallDeviceId()).toMatch(/^device-/);
    });

    test('recognizes safe terminal states', () => {
        expect(isTerminalMomoCallPhase(MomoCallPhase.IDLE)).toBe(true);
        expect(isTerminalMomoCallPhase(MomoCallPhase.CONNECTED)).toBe(false);
    });
});
