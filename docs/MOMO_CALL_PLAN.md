# MomoCall 实施计划

MomoCall 是 VRCMomo 与 VRCX Jirai 之间的独立一对一语音能力。它不读取、不上传、也不验证 VRChat Cookie；VRChat 用户 ID 只作为联系人地址，例如 `usr_xxx`。

## 0. 身份与边界

```text
VRChat 用户 ID -> MomoCall 联系人地址
设备密钥 / 会话令牌 -> MomoCall 服务认证
WebRTC -> 音频和媒体协商
信令服务 -> 只转发呼叫、SDP、ICE 与挂断事件
TURN -> P2P 无法直连时转发加密媒体
```

- 仅允许已建立好友关系的用户发起呼叫（正式服务端强制）。
- 一个用户可以拥有桌面、Android 等多个已授权设备。
- 任意一个设备接听后，其余设备停止响铃。
- 不把 VRChat Cookie、密码或私密 API 会话发送给 MomoCall 服务。
- 目前 `tools/momo-call-server` 是带共享密钥的 LAN 开发信令器，不是正式服务。

## 1. 桌面端基础（已完成）

路径：

- `src/services/momoCall/momoCallProtocol.js`：版本化信令包与状态机枚举。
- `src/services/momoCall/MomoCallClient.js`：WebSocket 信令、WebRTC 音频轨、接听/拒绝/挂断。
- `src/components/dialogs/UserDialog/MomoCallDialog.vue`：好友资料菜单中的测试呼叫窗口。
- `tools/momo-call-server/`：可在局域网启动的开发信令器。

完成标准：两个桌面客户端用同一 LAN 信令器注册后，能够转发呼叫消息并进行 WebRTC 协商。已完成协议、构建和信令转发验证。

## 2. Android 接入（下一段）

目标：让 VRCMomo Android 与桌面端使用同一协议并可进行最小一对一语音测试。

1. 在 VRCMomo 创建 `network/momocall` 协议数据模型，字段与桌面端保持相同。
2. 新增 Android `MomoCallService`：前台时保持信令连接；不主动使用 VRChat Cookie。
3. 通过 VRChat 用户 ID 作为呼叫目标；设备 ID 与 MomoCall 会话令牌单独保存。
4. 接入 Android WebRTC 音频、运行时麦克风权限、接听/拒绝/挂断 UI。
5. 来电使用 Android 系统通知，并能点击进入通话页。
6. 首轮只连接开发信令器；不宣称后台常驻或外网可用。

完成标准：一台 VRCMomo Android 与一台 VRCX Jirai 桌面客户端，连接同一个局域网信令器时，可完成双向呼叫和音频通话。

## 3. 多设备待机与 VR Overlay

1. 桌面登录后常驻 MomoCall 信令连接。
2. 桌面全局来电卡片与 VR Overlay 来电状态。
3. Android 前台服务来电通知。
4. 同账号的多个设备同时响铃；首个接听者发出 `call.claimed`，其他设备停止响铃。

## 4. 正式服务

1. WSS / HTTPS 部署。
2. 首次设备配对与轮换令牌；服务端保存设备而非 VRChat Cookie。
3. 好友关系校验、速率限制、呼叫超时、忙线和最小审计日志。
4. 配置 STUN 与自建 TURN；P2P 可用时直连，不可用时由 TURN 中继。
5. 生产环境再考虑后台可靠性、电池策略与崩溃恢复。

## 明确暂不做

- 群语音、房间语音。
- 通话录音、服务器保存音频。
- 用 VRChat Cookie 作为 MomoCall 登录凭据。
- 把开发信令器暴露到公网上。
