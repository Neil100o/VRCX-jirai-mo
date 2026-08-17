import {
    MOMO_CALL_PROTOCOL_VERSION,
    MomoCallMessageType,
    MomoCallPhase,
    createMomoCallId,
    isMomoCallMessage,
    isNonEmptyString
} from './momoCallProtocol.js';

/**
 * Minimal signalling/WebRTC client. It deliberately contains no UI and no
 * VRChat cookie handling: caller identity is supplied by the host app and the
 * relay authenticates a separately configured development secret.
 */
export class MomoCallClient {
    /** @param {{signallingUrl: string, userId: string, deviceId: string, sharedSecret?: string, iceServers?: RTCIceServer[], WebSocketImpl?: typeof WebSocket, RTCPeerConnectionImpl?: typeof RTCPeerConnection, getUserMedia?: typeof navigator.mediaDevices.getUserMedia, onState?: (state: object) => void, onRemoteStream?: (stream: MediaStream) => void}} options */
    constructor(options) {
        if (!isNonEmptyString(options?.signallingUrl)) throw new Error('A MomoCall signalling URL is required.');
        if (!isNonEmptyString(options?.userId)) throw new Error('A MomoCall user ID is required.');
        if (!isNonEmptyString(options?.deviceId)) throw new Error('A MomoCall device ID is required.');
        this.options = options;
        this.WebSocketImpl = options.WebSocketImpl || globalThis.WebSocket;
        this.RTCPeerConnectionImpl = options.RTCPeerConnectionImpl || globalThis.RTCPeerConnection;
        this.getUserMedia = options.getUserMedia || navigator.mediaDevices?.getUserMedia?.bind(navigator.mediaDevices);
        this.ws = null;
        this.peer = null;
        this.localStream = null;
        this.pendingIce = [];
        this.callId = null;
        this.peerUserId = null;
        this.phase = MomoCallPhase.IDLE;
    }

    emitState(extra = {}) {
        this.options.onState?.({ phase: this.phase, callId: this.callId, peerUserId: this.peerUserId, ...extra });
    }

    async connect() {
        if (this.ws?.readyState === this.WebSocketImpl.OPEN) return;
        this.phase = MomoCallPhase.CONNECTING;
        this.emitState();
        await new Promise((resolve, reject) => {
            const ws = new this.WebSocketImpl(this.options.signallingUrl);
            this.ws = ws;
            ws.addEventListener('open', () => {
                this.send({
                    type: MomoCallMessageType.REGISTER,
                    userId: this.options.userId,
                    deviceId: this.options.deviceId,
                    sharedSecret: this.options.sharedSecret || ''
                });
            });
            ws.addEventListener('message', (event) => {
                void this.handleSignal(event.data, resolve, reject);
            });
            ws.addEventListener('error', () => reject(new Error('Unable to connect to the MomoCall signalling service.')));
            ws.addEventListener('close', () => {
                if (this.phase !== MomoCallPhase.IDLE && this.phase !== MomoCallPhase.ENDED) {
                    this.phase = MomoCallPhase.ERROR;
                    this.emitState({ error: 'Signalling connection closed.' });
                }
            });
        });
    }

    /** @param {string} targetUserId */
    async call(targetUserId) {
        if (!isNonEmptyString(targetUserId)) throw new Error('A target user is required.');
        await this.connect();
        this.callId = createMomoCallId();
        this.peerUserId = targetUserId;
        this.phase = MomoCallPhase.OUTGOING;
        this.emitState();
        this.sendCall(MomoCallMessageType.INVITE);
    }

    async accept() {
        if (!this.callId || !this.peerUserId) throw new Error('There is no incoming call to accept.');
        this.phase = MomoCallPhase.NEGOTIATING;
        this.emitState();
        this.sendCall(MomoCallMessageType.ACCEPT);
    }

    reject() {
        if (this.callId) this.sendCall(MomoCallMessageType.REJECT);
        this.closeCall(MomoCallPhase.ENDED);
    }

    hangup() {
        if (this.callId) this.sendCall(MomoCallMessageType.HANGUP);
        this.closeCall(MomoCallPhase.ENDED);
    }

    disconnect() {
        this.closeCall(MomoCallPhase.IDLE);
        this.ws?.close();
        this.ws = null;
    }

    /** @param {string|ArrayBuffer} raw @param {() => void} connected @param {(error: Error) => void} connectFailed */
    async handleSignal(raw, connected, connectFailed) {
        let message;
        try {
            message = JSON.parse(String(raw));
        } catch {
            return;
        }
        if (!isMomoCallMessage(message)) return;
        if (message.type === MomoCallMessageType.REGISTERED) {
            this.phase = MomoCallPhase.IDLE;
            this.emitState();
            connected();
            return;
        }
        if (message.type === MomoCallMessageType.ERROR) {
            const error = new Error(String(message.message || 'MomoCall signalling error.'));
            this.phase = MomoCallPhase.ERROR;
            this.emitState({ error: error.message });
            connectFailed(error);
            return;
        }
        if (message.type === MomoCallMessageType.INVITE) {
            this.callId = String(message.callId);
            this.peerUserId = String(message.fromUserId);
            this.phase = MomoCallPhase.INCOMING;
            this.emitState();
            return;
        }
        if (!this.callId || message.callId !== this.callId) return;
        if (message.type === MomoCallMessageType.REJECT || message.type === MomoCallMessageType.HANGUP) {
            this.closeCall(MomoCallPhase.ENDED);
            return;
        }
        if (message.type === MomoCallMessageType.ACCEPT) {
            await this.createOffer();
            return;
        }
        if (message.type === MomoCallMessageType.OFFER) {
            await this.acceptOffer(message.sdp);
            return;
        }
        if (message.type === MomoCallMessageType.ANSWER) {
            await this.peer?.setRemoteDescription(message.sdp);
            await this.flushIce();
            return;
        }
        if (message.type === MomoCallMessageType.ICE && message.candidate) {
            if (this.peer?.remoteDescription) await this.peer.addIceCandidate(message.candidate);
            else this.pendingIce.push(message.candidate);
        }
    }

    async ensurePeer() {
        if (this.peer) return this.peer;
        if (!this.getUserMedia) throw new Error('Microphone access is not available in this environment.');
        if (!this.RTCPeerConnectionImpl) throw new Error('WebRTC is not available in this environment.');
        this.localStream = await this.getUserMedia({ audio: true, video: false });
        const peer = new this.RTCPeerConnectionImpl({ iceServers: this.options.iceServers || [] });
        for (const track of this.localStream.getTracks()) peer.addTrack(track, this.localStream);
        peer.addEventListener('icecandidate', (event) => {
            if (event.candidate) this.sendCall(MomoCallMessageType.ICE, { candidate: event.candidate });
        });
        peer.addEventListener('track', (event) => {
            const stream = event.streams[0];
            if (stream) this.options.onRemoteStream?.(stream);
        });
        peer.addEventListener('connectionstatechange', () => {
            if (peer.connectionState === 'connected') {
                this.phase = MomoCallPhase.CONNECTED;
                this.emitState();
            }
        });
        this.peer = peer;
        return peer;
    }

    async createOffer() {
        const peer = await this.ensurePeer();
        const offer = await peer.createOffer();
        await peer.setLocalDescription(offer);
        this.phase = MomoCallPhase.NEGOTIATING;
        this.emitState();
        this.sendCall(MomoCallMessageType.OFFER, { sdp: offer });
    }

    /** @param {RTCSessionDescriptionInit} offer */
    async acceptOffer(offer) {
        const peer = await this.ensurePeer();
        await peer.setRemoteDescription(offer);
        await this.flushIce();
        const answer = await peer.createAnswer();
        await peer.setLocalDescription(answer);
        this.sendCall(MomoCallMessageType.ANSWER, { sdp: answer });
    }

    async flushIce() {
        const candidates = this.pendingIce.splice(0);
        for (const candidate of candidates) await this.peer?.addIceCandidate(candidate);
    }

    /** @param {string} type @param {object} extra */
    sendCall(type, extra = {}) {
        this.send({ type, callId: this.callId, targetUserId: this.peerUserId, fromUserId: this.options.userId, ...extra });
    }

    /** @param {object} body */
    send(body) {
        if (this.ws?.readyState !== this.WebSocketImpl.OPEN) throw new Error('MomoCall is not connected.');
        this.ws.send(JSON.stringify({ version: MOMO_CALL_PROTOCOL_VERSION, ...body }));
    }

    /** @param {string} phase */
    closeCall(phase) {
        this.peer?.close();
        this.peer = null;
        this.localStream?.getTracks().forEach((track) => track.stop());
        this.localStream = null;
        this.pendingIce = [];
        this.callId = null;
        this.peerUserId = null;
        this.phase = phase;
        this.emitState();
    }
}
