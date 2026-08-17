import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';

const port = Number(process.env.PORT || 38700);
const sharedSecret = process.env.MOMOCALL_SHARED_SECRET || '';
if (!sharedSecret) {
    console.error('MOMOCALL_SHARED_SECRET must be set. Refusing to start an unauthenticated relay.');
    process.exit(1);
}

const server = createServer((_, response) => {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ name: 'MomoCall development relay', status: 'ok' }));
});
const wss = new WebSocketServer({ server });
/** @type {Map<string, Set<import('ws').WebSocket>>} */
const devicesByUser = new Map();

function removeSocket(socket) {
    const userId = socket.momoCallUserId;
    if (!userId) return;
    const devices = devicesByUser.get(userId);
    devices?.delete(socket);
    if (!devices?.size) devicesByUser.delete(userId);
}

function send(socket, message) {
    if (socket.readyState === socket.OPEN) socket.send(JSON.stringify({ version: 1, ...message }));
}

wss.on('connection', (socket) => {
    socket.on('message', (raw) => {
        let message;
        try {
            message = JSON.parse(raw.toString());
        } catch {
            return send(socket, { type: 'error', message: 'Malformed JSON.' });
        }
        if (message.version !== 1 || typeof message.type !== 'string') {
            return send(socket, { type: 'error', message: 'Unsupported MomoCall protocol version.' });
        }
        if (message.type === 'register') {
            if (typeof message.userId !== 'string' || typeof message.deviceId !== 'string' || message.sharedSecret !== sharedSecret) {
                return send(socket, { type: 'error', message: 'Registration rejected.' });
            }
            removeSocket(socket);
            socket.momoCallUserId = message.userId;
            socket.momoCallDeviceId = message.deviceId;
            const devices = devicesByUser.get(message.userId) || new Set();
            devices.add(socket);
            devicesByUser.set(message.userId, devices);
            return send(socket, { type: 'registered' });
        }
        if (!socket.momoCallUserId || typeof message.targetUserId !== 'string' || typeof message.callId !== 'string') {
            return send(socket, { type: 'error', message: 'Register before sending call messages.' });
        }
        const targetDevices = devicesByUser.get(message.targetUserId);
        if (!targetDevices?.size) return send(socket, { type: 'error', message: 'The target user has no connected MomoCall device.' });
        const forwarded = { ...message, fromUserId: socket.momoCallUserId };
        for (const target of targetDevices) send(target, forwarded);
    });
    socket.on('close', () => removeSocket(socket));
});

server.listen(port, '0.0.0.0', () => {
    console.log(`MomoCall development relay listening on ws://0.0.0.0:${port}`);
});
