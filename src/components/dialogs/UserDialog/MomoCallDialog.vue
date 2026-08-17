<template>
    <Dialog v-model:open="dialogOpen">
        <DialogContent class="x-dialog sm:max-w-125">
            <DialogHeader>
                <DialogTitle>MomoCall</DialogTitle>
                <DialogDescription>
                    {{ targetLabel }} · 仅用于开发测试；需要双方连接到同一信令服务。
                </DialogDescription>
            </DialogHeader>

            <div class="space-y-3">
                <label class="block space-y-1">
                    <span class="text-sm font-medium">信令服务地址</span>
                    <Input v-model.trim="settings.signallingUrl" placeholder="ws://192.168.1.20:38700" />
                </label>
                <label class="block space-y-1">
                    <span class="text-sm font-medium">测试密钥</span>
                    <Input v-model="settings.sharedSecret" type="password" placeholder="两台设备填写相同的密钥" />
                </label>
                <p class="text-xs text-muted-foreground">{{ stateText }}</p>
            </div>

            <DialogFooter class="gap-2 sm:gap-2">
                <Button variant="outline" :disabled="busy" @click="connectOnly">连接并等待</Button>
                <Button v-if="state.phase === 'incoming'" :disabled="busy" @click="acceptCall">接听</Button>
                <Button v-else-if="activeCall" variant="destructive" :disabled="busy" @click="hangup">挂断</Button>
                <Button v-else :disabled="busy" @click="startCall">呼叫</Button>
            </DialogFooter>
            <audio ref="remoteAudio" autoplay />
        </DialogContent>
    </Dialog>
</template>

<script setup>
    import { computed, onBeforeUnmount, ref } from 'vue';
    import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
    import { Input } from '@/components/ui/input';
    import { Button } from '@/components/ui/button';
    import { toast } from 'vue-sonner';

    import { MomoCallClient } from '../../../services/momoCall/MomoCallClient.js';
    import { MomoCallPhase, createMomoCallDeviceId } from '../../../services/momoCall/momoCallProtocol.js';

    const props = defineProps({
        momoCallDialog: { type: Object, required: true },
        currentUserId: { type: String, required: true }
    });
    const emit = defineEmits(['update:visible']);

    const STORAGE_KEY = 'VRCX_MomoCallSettings';
    const DEVICE_KEY = 'VRCX_MomoCallDeviceId';
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    const settings = ref({ signallingUrl: saved.signallingUrl || '', sharedSecret: saved.sharedSecret || '' });
    const state = ref({ phase: MomoCallPhase.IDLE, error: '' });
    const busy = ref(false);
    const remoteAudio = ref(null);
    let client = null;

    const dialogOpen = computed({
        get: () => props.momoCallDialog.visible,
        set: (visible) => {
            emit('update:visible', visible);
        }
    });
    const activeCall = computed(() => !['idle', 'ended', 'error'].includes(state.value.phase));
    const targetLabel = computed(() => props.momoCallDialog.displayName || props.momoCallDialog.userId || '好友');
    const stateText = computed(() => {
        const messages = {
            idle: '已连接后可等待来电或呼叫好友。',
            connecting: '正在连接信令服务…',
            outgoing: '正在呼叫对方…',
            incoming: '收到来电。',
            negotiating: '正在建立语音连接…',
            connected: '语音已连接。',
            ended: '通话已结束。',
            error: state.value.error || '连接失败。'
        };
        return messages[state.value.phase] || '';
    });

    function getClient() {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(settings.value));
        if (client) return client;
        const deviceId = localStorage.getItem(DEVICE_KEY) || createMomoCallDeviceId();
        localStorage.setItem(DEVICE_KEY, deviceId);
        client = new MomoCallClient({
            signallingUrl: settings.value.signallingUrl,
            sharedSecret: settings.value.sharedSecret,
            userId: props.currentUserId,
            deviceId,
            onState: (nextState) => {
                state.value = nextState;
            },
            onRemoteStream: (stream) => {
                if (remoteAudio.value) remoteAudio.value.srcObject = stream;
            }
        });
        return client;
    }

    async function run(action) {
        busy.value = true;
        try {
            await action();
        } catch (error) {
            state.value = { phase: MomoCallPhase.ERROR, error: error instanceof Error ? error.message : String(error) };
            toast.error(state.value.error);
        } finally {
            busy.value = false;
        }
    }

    function connectOnly() {
        return run(() => getClient().connect());
    }

    function startCall() {
        return run(() => getClient().call(props.momoCallDialog.userId));
    }

    function acceptCall() {
        return run(() => getClient().accept());
    }

    function hangup() {
        client?.hangup();
    }

    onBeforeUnmount(() => client?.disconnect());
</script>
