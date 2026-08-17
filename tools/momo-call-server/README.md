# MomoCall signalling relay (development)

This is a small WebSocket relay for **local development only**. It routes encrypted WebRTC signalling envelopes between devices. It does not relay audio, store VRChat sessions, or verify VRChat login cookies.

## Run locally

```powershell
cd tools/momo-call-server
npm install
$env:MOMOCALL_SHARED_SECRET = "replace-with-a-long-random-secret"
npm start
```

The default bind address is `0.0.0.0:38700`. For a LAN test, use `ws://<computer-LAN-IP>:38700` in both test clients and the same shared secret.

Do **not** expose this development relay to the public internet. A production service needs HTTPS/WSS, real account-to-device authorization, rate limiting, audit logging, and a TURN service for restrictive NATs.
