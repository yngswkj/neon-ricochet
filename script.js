const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// レスポンシブ対応
let canvasWidth = GAME_CONFIG.CANVAS.DEFAULT_WIDTH;
let canvasHeight = GAME_CONFIG.CANVAS.DEFAULT_HEIGHT;
let scale = 1;

// デバッグ用変数を追加
let lastDebugTime = 0;
const DEBUG_LOG_INTERVAL = 1000; // 1秒間隔でログ出力
let touchDebugInfo = { enabled: GAME_CONFIG.DEVELOPER.ENABLED };

function resizeCanvas() {
    const container = document.getElementById('gameContainer');
    const containerWidth = container.clientWidth;
    const containerHeight = container.clientHeight;

    // モバイル対応
    if (window.innerWidth < GAME_CONFIG.CANVAS.MOBILE_BREAKPOINT) {
        canvasWidth = GAME_CONFIG.CANVAS.MOBILE_WIDTH;
        canvasHeight = GAME_CONFIG.CANVAS.MOBILE_HEIGHT;
    } else {
        canvasWidth = GAME_CONFIG.CANVAS.DEFAULT_WIDTH;
        canvasHeight = GAME_CONFIG.CANVAS.DEFAULT_HEIGHT;
    }

    const scaleX = containerWidth / canvasWidth;
    const scaleY = containerHeight / canvasHeight;
    scale = Math.min(scaleX, scaleY) * GAME_CONFIG.CANVAS.SCALE_FACTOR;

    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    canvas.style.width = (canvasWidth * scale) + 'px';
    canvas.style.height = (canvasHeight * scale) + 'px';
}

window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// ゲーム状態
let gameState = 'start';
let currentStage = 1;
let shots = 0;
let shotLimit = 3;
let timeScale = 1;

// プレイヤー更新：マルチプレイヤー用の配列を追加
const players = [];

// プレイヤー
const player = {
    x: canvasWidth / 2,
    y: canvasHeight - GAME_CONFIG.PLAYER.START_OFFSET_Y,
    vx: 0,
    vy: 0,
    radius: GAME_CONFIG.PLAYER.RADIUS,
    isDragging: false,
    dragStartX: 0,
    dragStartY: 0,
    isMoving: false,
    maxBounces: GAME_CONFIG.PLAYER.MAX_BOUNCES,
    bounceCount: 0,
    power: 1,
    speed: 1,
    trail: []
};

// 初期プレイヤーを配列に追加
players.push(player);

// ゲーム要素
const targets = [];
const obstacles = [];
const powerUps = [];
const particles = [];
const effects = [];
const activePowerUps = {};
const pendingPowerUps = {}; // 次のショットで有効になるパワーアップ

// エフェクトクラス
class Effect {
    constructor(x, y, type, options = {}) {
        this.x = x;
        this.y = y;
        this.type = type;
        this.life = 1;
        this.maxLife = options.maxLife || 1;
        this.color = options.color || '#0ff';
        this.size = options.size || 20;
        this.speed = options.speed || 1;
        this.angle = options.angle || 0;
        this.particles = [];
    }

    update(dt) {
        this.life -= dt * 0.05 * this.speed;

        if (this.type === 'explosion') {
            this.size += dt * 5;
        } else if (this.type === 'ring') {
            this.size += dt * 10;
        } else if (this.type === 'shockwave') {
            this.size += dt * 15;
        }

        return this.life > 0;
    }

    render(ctx) {
        ctx.save();
        ctx.globalAlpha = this.life;

        switch (this.type) {
            case 'ring':
                ctx.strokeStyle = this.color;
                ctx.lineWidth = 3;
                ctx.shadowColor = this.color;
                ctx.shadowBlur = 20;
                ctx.beginPath();
                ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
                ctx.stroke();
                break;

            case 'explosion':
                // 複数のリング
                for (let i = 0; i < 3; i++) {
                    ctx.strokeStyle = this.color;
                    ctx.lineWidth = 2 - i * 0.5;
                    ctx.globalAlpha = this.life * (1 - i * 0.3);
                    ctx.beginPath();
                    ctx.arc(this.x, this.y, this.size + i * 20, 0, Math.PI * 2);
                    ctx.stroke();
                }

                // 光の十字
                ctx.fillStyle = this.color;
                ctx.globalAlpha = this.life;
                const crossSize = this.size * 2;
                ctx.fillRect(this.x - crossSize, this.y - 2, crossSize * 2, 4);
                ctx.fillRect(this.x - 2, this.y - crossSize, 4, crossSize * 2);
                break;

            case 'shockwave':
                // カラーをRGBに変換
                let r = 0, g = 255, b = 255;
                if (this.color === '#f00') { r = 255; g = 0; b = 0; }
                else if (this.color === '#0f0') { r = 0; g = 255; b = 0; }
                else if (this.color === '#00f') { r = 0; g = 0; b = 255; }
                else if (this.color === '#ff0') { r = 255; g = 255; b = 0; }
                else if (this.color === '#f0f') { r = 255; g = 0; b = 255; }

                const gradient = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, this.size);
                gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0)`);
                gradient.addColorStop(0.7, `rgba(${r}, ${g}, ${b}, 0.25)`);
                gradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
                ctx.fillStyle = gradient;
                ctx.beginPath();
                ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
                ctx.fill();
                break;

            case 'powerup_aura':
                // パワーアップオーラ
                for (let i = 0; i < 5; i++) {
                    ctx.strokeStyle = this.color;
                    ctx.lineWidth = 1;
                    ctx.globalAlpha = this.life * (0.5 - i * 0.1);
                    ctx.beginPath();
                    const offset = Math.sin(Date.now() * 0.001 + i) * 5;
                    ctx.arc(this.x, this.y, this.size + i * 10 + offset, 0, Math.PI * 2);
                    ctx.stroke();
                }
                break;

            case 'trail':
                // 特殊なトレイルエフェクト
                ctx.strokeStyle = this.color;
                ctx.lineWidth = 5;
                ctx.shadowColor = this.color;
                ctx.shadowBlur = 15;
                ctx.beginPath();
                ctx.moveTo(this.x, this.y);
                const trailLength = 30;
                ctx.lineTo(
                    this.x - Math.cos(this.angle) * trailLength,
                    this.y - Math.sin(this.angle) * trailLength
                );
                ctx.stroke();
                break;
        }

        ctx.restore();
    }
}

// ステージデータ（画面サイズに応じて調整）
function getStageData() {
    const w = canvasWidth;
    const h = canvasHeight;

    return [
        // ステージ1: 基本
        {
            targets: [
                { x: w * 0.25, y: h * 0.3, type: 'soft' },
                { x: w * 0.5, y: h * 0.25, type: 'hard' },
                { x: w * 0.75, y: h * 0.3, type: 'soft' }
            ],
            obstacles: [],
            powerUps: [],
            shotLimit: 2
        },
        // ステージ2: 障害物導入
        {
            targets: [
                { x: w * 0.2, y: h * 0.25, type: 'hard' },
                { x: w * 0.8, y: h * 0.25, type: 'hard' },
                { x: w * 0.5, y: h * 0.15, type: 'soft', hp: 2 }
            ],
            obstacles: [
                { x: w * 0.5, y: h * 0.4, width: w * 0.25, height: 20, angle: 0 }
            ],
            powerUps: [],
            shotLimit: 2
        },
        // ステージ3: 回転障害物とHP敵
        {
            targets: [
                { x: w * 0.15, y: h * 0.3, type: 'soft' },
                { x: w * 0.85, y: h * 0.3, type: 'soft' },
                { x: w * 0.5, y: h * 0.1, type: 'hard', hp: 3 }
            ],
            obstacles: [
                { x: w * 0.5, y: h * 0.5, width: w * 0.2, height: 20, angle: 0, rotating: true, speed: 0.02 }
            ],
            powerUps: [
                { x: w * 0.5, y: h * 0.65, type: 'predict' }
            ],
            shotLimit: 3
        },
        // ステージ4: 複雑な配置と動く敵
        {
            targets: [
                { x: w * 0.15, y: h * 0.2, type: 'hard', hp: 2 },
                { x: w * 0.85, y: h * 0.2, type: 'hard', hp: 2 },
                { x: w * 0.15, y: h * 0.5, type: 'soft', moving: true, moveType: 'horizontal', speed: 50 },
                { x: w * 0.85, y: h * 0.5, type: 'soft', moving: true, moveType: 'horizontal', speed: -50 }
            ],
            obstacles: [
                { x: w * 0.3, y: h * 0.35, width: 20, height: h * 0.15, angle: 0 },
                { x: w * 0.7, y: h * 0.35, width: 20, height: h * 0.15, angle: 0 }
            ],
            powerUps: [
                { x: w * 0.5, y: h * 0.35, type: 'multishot' }
            ],
            shotLimit: 3
        },
        // ステージ5: パワーアップ活用と動く敵
        {
            targets: [
                { x: w * 0.5, y: h * 0.15, type: 'hard', hp: 5, moving: true, moveType: 'circular', speed: 30 },
                { x: w * 0.3, y: h * 0.3, type: 'soft', hp: 2 },
                { x: w * 0.7, y: h * 0.3, type: 'soft', hp: 2 },
                { x: w * 0.5, y: h * 0.45, type: 'hard', hp: 3 }
            ],
            obstacles: [
                { x: w * 0.5, y: h * 0.25, width: w * 0.25, height: 20, angle: 0 },
                { x: w * 0.5, y: h * 0.4, width: w * 0.25, height: 20, angle: 0 }
            ],
            powerUps: [
                { x: w * 0.15, y: h * 0.65, type: 'penetrate' },
                { x: w * 0.85, y: h * 0.65, type: 'power' },
                { x: w * 0.5, y: h * 0.7, type: 'homing' }
            ],
            shotLimit: 3
        }
    ];
}

// パワーアップタイプ
const powerUpTypes = {
    penetrate: { color: '#f0f', duration: 1 },
    speed: { color: '#00f', duration: 1 },
    power: { color: '#f00', duration: 1 },
    multishot: { color: '#0f0', duration: 1 },
    homing: { color: '#ff0', duration: 1 },
    predict: { color: '#0ff', duration: 1 }
};

// 音楽システム
let synth, bassSynth, drumSynth, fxSynth;
let musicStarted = false;
let audioInitialized = false;

function initAudio() {
    if (audioInitialized) return;

    try {
        // メインシンセ
        synth = new Tone.PolySynth(Tone.Synth, {
            oscillator: { type: 'sawtooth' },
            envelope: { attack: 0.01, decay: 0.1, sustain: 0.5, release: 0.3 },
            volume: GAME_CONFIG.AUDIO.MAIN_VOLUME
        }).toDestination();

        // ベースシンセ
        bassSynth = new Tone.MonoSynth({
            oscillator: { type: 'square' },
            envelope: { attack: 0.01, decay: 0.1, sustain: 0.9, release: 0.1 },
            volume: GAME_CONFIG.AUDIO.BASS_VOLUME
        }).toDestination();

        // ドラムシンセ
        drumSynth = new Tone.MembraneSynth({
            pitchDecay: 0.05,
            octaves: 10,
            oscillator: { type: 'sine' },
            envelope: { attack: 0.001, decay: 0.4, sustain: 0.01, release: 1.4 },
            volume: GAME_CONFIG.AUDIO.DRUM_VOLUME
        }).toDestination();

        // エフェクト用シンセ
        fxSynth = new Tone.PolySynth(Tone.Synth, {
            oscillator: { type: 'sine' },
            envelope: { attack: 0.001, decay: 0.2, sustain: 0, release: 0.5 },
            volume: GAME_CONFIG.AUDIO.FX_VOLUME
        }).toDestination();

        // リバーブとディレイを追加（エラーを避けるため try-catch で囲む）
        try {
            const reverb = new Tone.Reverb(1.5).toDestination();
            const delay = new Tone.Delay(0.1, 0.3).toDestination();
            if (reverb.wet) reverb.wet.value = 0.3;
            if (delay.wet) delay.wet.value = 0.2;
            fxSynth.connect(reverb);
            fxSynth.connect(delay);
        } catch (e) {
            console.log('エフェクト設定をスキップ:', e);
        }

        audioInitialized = true;
    } catch (error) {
        console.error('音声初期化エラー:', error);
        // 音声なしで続行
        audioInitialized = true;
    }
}

async function startAudioContext() {
    if (musicStarted) return;

    try {
        console.log('[音声] Tone.context.state:', Tone.context.state);
        if (Tone.context.state !== 'running') {
            await Tone.start();
            console.log('[音声] Tone.start() 成功');
        }
        musicStarted = true;
        console.log('[音声] Audio context started successfully');
    } catch (error) {
        console.error('[音声] 音声コンテキスト開始エラー:', error);
        musicStarted = true; // エラーでも続行（操作は有効にする）
    }
}

function playShootSound() {
    if (!musicStarted || !fxSynth || !drumSynth) return;

    try {
        // より気持ちの良い発射音
        fxSynth.triggerAttackRelease(['C5', 'E5', 'G5'], '16n');
        drumSynth.triggerAttackRelease('C2', '32n');
        setTimeout(() => {
            fxSynth.triggerAttackRelease(['E5', 'G5', 'C6'], '32n');
        }, 50);
    } catch (error) {
        console.log('発射音再生エラー:', error);
    }
}

function playBounceSound() {
    if (!musicStarted || !fxSynth) return;

    try {
        const note = SOUND_NOTES.BOUNCE[Math.floor(Math.random() * SOUND_NOTES.BOUNCE.length)];
        fxSynth.triggerAttackRelease(note, '64n');
    } catch (error) {
        console.log('反射音再生エラー:', error);
    }
}

function playTargetHitSound() {
    if (!musicStarted || !fxSynth || !drumSynth) return;

    try {
        // 破壊音を豪華に
        fxSynth.triggerAttackRelease(['C5', 'E5', 'G5', 'C6'], '16n');
        drumSynth.triggerAttackRelease('C1', '16n');
        setTimeout(() => {
            fxSynth.triggerAttackRelease(['E5', 'G5', 'B5', 'E6'], '32n');
        }, 50);
        setTimeout(() => {
            fxSynth.triggerAttackRelease(['G5', 'B5', 'D6', 'G6'], '32n');
        }, 100);
    } catch (error) {
        console.log('ヒット音再生エラー:', error);
    }
}

function playPowerUpSound() {
    if (!musicStarted || !fxSynth) return;

    try {
        SOUND_NOTES.POWERUP.forEach((note, i) => {
            setTimeout(() => {
                fxSynth.triggerAttackRelease(note, '32n');
            }, i * 30);
        });
    } catch (error) {
        console.log('パワーアップ音再生エラー:', error);
    }
}

function playFailSound() {
    if (!musicStarted || !synth) return;

    try {
        // 下降音
        synth.triggerAttackRelease(['C3', 'G2'], '8n');
        setTimeout(() => {
            synth.triggerAttackRelease(['G2', 'C2'], '4n');
        }, 200);
    } catch (error) {
        console.log('失敗音再生エラー:', error);
    }
}

function playClearSound() {
    if (!musicStarted || !fxSynth) return;

    try {
        SOUND_NOTES.FANFARE.forEach(([note, time]) => {
            setTimeout(() => {
                fxSynth.triggerAttackRelease(note, '16n');
            }, time);
        });
    } catch (error) {
        console.log('クリア音再生エラー:', error);
    }
}

// 開発者モード用変数
let godMode = false;

// ゲーム初期化
function init() {
    canvas.addEventListener('mousedown', onMouseDown);
    canvas.addEventListener('touchstart', onTouchStart, { passive: false });

    // マウス移動とマウスアップはwindowで監視（キャンバス外でも操作可能）
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('touchend', onTouchEnd, { passive: false });

    // ESCキーでヘルプを閉じる
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (document.getElementById('helpModal').style.display === 'flex') {
                hideHelp();
            }
            if (document.getElementById('devModal').style.display === 'flex') {
                hideDevPanel();
            }
        }
    });

    // 開発者モードボタンの表示制御
    if (GAME_CONFIG.DEVELOPER.ENABLED) {
        document.getElementById('devButton').style.display = 'flex';
    }
}

// ステージ読み込み
function loadStage(stageNum) {
    // プレイヤー配列をリセット
    players.length = 0;
    players.push(player);

    // クリア
    targets.length = 0;
    obstacles.length = 0;
    powerUps.length = 0;
    particles.length = 0;
    effects.length = 0;

    // プレイヤーリセット
    player.x = canvasWidth / 2;
    player.y = canvasHeight - 100;
    player.vx = 0;
    player.vy = 0;
    player.isMoving = false;
    player.trail = [];
    shots = 0;

    // パワーアップリセット
    for (const type in activePowerUps) {
        delete activePowerUps[type];
        const icon = document.getElementById(type + 'Icon');
        icon.style.display = 'none';
        icon.style.opacity = '1';
        icon.classList.remove('active');
    }
    for (const type in pendingPowerUps) {
        delete pendingPowerUps[type];
        const icon = document.getElementById(type + 'Icon');
        icon.style.display = 'none';
        icon.style.opacity = '1';
    }
    player.speed = 1;
    player.power = 1;
    timeScale = 1;

    // パワーアップステータス表示をクリア
    document.getElementById('powerUpStatus').innerHTML = '';

    // ステージデータ読み込み
    const stages = getStageData();
    const stage = stages[stageNum - 1];
    if (!stage) {
        alert('全ステージクリア！おめでとう！');
        currentStage = 1;
        loadStage(1);
        return;
    }

    // ショット制限設定
    shotLimit = stage.shotLimit || 3;

    // ターゲット配置
    for (const t of stage.targets) {
        const target = {
            x: t.x,
            y: t.y,
            radius: 20,
            type: t.type || 'soft',
            hits: 0,
            maxHits: t.hp || 1,
            pulse: Math.random() * Math.PI * 2,
            moving: t.moving || false,
            moveType: t.moveType || 'horizontal',
            speed: t.speed || 0,
            originalX: t.x,
            originalY: t.y,
            moveAngle: 0
        };
        targets.push(target);
    }

    // 障害物配置
    for (const o of stage.obstacles) {
        obstacles.push({
            x: o.x,
            y: o.y,
            width: o.width,
            height: o.height,
            angle: o.angle || 0,
            rotating: o.rotating || false,
            speed: o.speed || 0
        });
    }

    // パワーアップ配置
    for (const p of stage.powerUps) {
        powerUps.push({
            x: p.x,
            y: p.y,
            type: p.type,
            radius: 20,
            pulse: 0,
            collected: false
        });
    }

    // UI更新
    document.getElementById('stage').textContent = currentStage;
    document.getElementById('shots').textContent = shots;
    document.getElementById('shotsLeft').textContent = Math.max(0, shotLimit - shots);
    document.getElementById('targetsLeft').textContent = targets.length;
    document.getElementById('totalTargets').textContent = targets.length;

    // ショット制限の警告リセット
    document.getElementById('shotLimit').classList.remove('warning', 'danger');
}

// マウス/タッチイベント（座標をスケールに対応）
function getCanvasCoordinates(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const x = (clientX - rect.left) / scale;
    const y = (clientY - rect.top) / scale;

    // デバッグ情報
    if (touchDebugInfo.enabled) {
        console.log('[座標変換]', {
            clientX, clientY,
            rectLeft: rect.left, rectTop: rect.top,
            scale,
            canvasX: x, canvasY: y,
            playerX: player.x, playerY: player.y,
            distance: Math.hypot(x - player.x, y - player.y),
            touchArea: player.radius * GAME_CONFIG.PLAYER.TOUCH_AREA_MULTIPLIER
        });
    }

    return { x, y };
}

function onMouseDown(e) {
    console.log('[マウスダウン] ゲーム状態:', gameState, 'プレイヤー移動中:', player.isMoving);

    if (gameState !== 'playing') {
        console.log('[マウスダウン] ゲーム状態が"playing"ではないため無視');
        return;
    }
    if (player.isMoving) {
        console.log('[マウスダウン] プレイヤーが移動中のため無視');
        return;
    }

    const coords = getCanvasCoordinates(e.clientX, e.clientY);
    const distance = Math.hypot(coords.x - player.x, coords.y - player.y);
    const touchArea = player.radius * GAME_CONFIG.PLAYER.TOUCH_AREA_MULTIPLIER;

    console.log('[マウスダウン] 距離チェック:', {
        distance,
        touchArea,
        withinRange: distance < touchArea
    });

    // タッチしやすいように判定を大きくする
    if (distance < touchArea) {
        console.log('[マウスダウン] ドラッグ開始');
        player.isDragging = true;
        player.dragStartX = coords.x;
        player.dragStartY = coords.y;

        // ドラッグ開始時にペンディングパワーアップを有効化
        console.log('[ドラッグ開始] pendingPowerUpsをチェック:', pendingPowerUps);
        for (const [type] of Object.entries(pendingPowerUps)) {
            console.log(`[ドラッグ開始] ペンディングパワーアップを有効化: ${type}`);
            activatePowerUp(type);
            delete pendingPowerUps[type];
        }

        e.preventDefault(); // デフォルトのドラッグ動作を防止
    } else {
        console.log('[マウスダウン] タッチエリア外のため無視');
    }
}

function onMouseMove(e) {
    if (!player.isDragging) return;
    const coords = getCanvasCoordinates(e.clientX, e.clientY);

    const dx = coords.x - player.x;
    const dy = coords.y - player.y;
    const distance = Math.hypot(dx, dy);

    if (distance > GAME_CONFIG.DRAG.MAX_DISTANCE) {
        // 最大距離を超える場合は方向を保ったまま距離を制限
        const angle = Math.atan2(dy, dx);
        player.dragStartX = player.x + Math.cos(angle) * GAME_CONFIG.DRAG.MAX_DISTANCE;
        player.dragStartY = player.y + Math.sin(angle) * GAME_CONFIG.DRAG.MAX_DISTANCE;
    } else {
        player.dragStartX = coords.x;
        player.dragStartY = coords.y;
    }

    e.preventDefault();
}

function onMouseUp(e) {
    if (!player.isDragging || player.isMoving) return;

    const dx = player.x - player.dragStartX;
    const dy = player.y - player.dragStartY;

    if (Math.hypot(dx, dy) > GAME_CONFIG.DRAG.MIN_SHOT_DISTANCE) {
        console.log('[ショット] ショット実行 - 現在のactivePowerUps:', activePowerUps);

        if (activePowerUps.multishot) {
            // マルチショット：3方向に発射
            const baseAngle = Math.atan2(dy, dx);
            const angles = [baseAngle - 0.3, baseAngle, baseAngle + 0.3];

            for (let i = 0; i < angles.length; i++) {
                const angle = angles[i];
                const distance = Math.hypot(dx, dy);
                const newDx = Math.cos(angle) * distance;
                const newDy = Math.sin(angle) * distance;

                if (i === 0) {
                    // メインプレイヤー
                    player.vx = newDx * GAME_CONFIG.PLAYER.SHOT_POWER * player.speed;
                    player.vy = newDy * GAME_CONFIG.PLAYER.SHOT_POWER * player.speed;
                    player.isMoving = true;
                    player.bounceCount = 0;
                } else {
                    // 追加のプレイヤー
                    const newPlayer = {
                        x: player.x,
                        y: player.y,
                        vx: newDx * GAME_CONFIG.PLAYER.SHOT_POWER * player.speed,
                        vy: newDy * GAME_CONFIG.PLAYER.SHOT_POWER * player.speed,
                        radius: player.radius,
                        isMoving: true,
                        bounceCount: 0,
                        power: player.power,
                        speed: player.speed,
                        trail: [],
                        maxBounces: player.maxBounces,
                        isMultishotClone: true
                    };
                    players.push(newPlayer);
                }
            }
        } else {
            // 通常ショット
            player.vx = dx * GAME_CONFIG.PLAYER.SHOT_POWER * player.speed;
            player.vy = dy * GAME_CONFIG.PLAYER.SHOT_POWER * player.speed;
            player.isMoving = true;
            player.bounceCount = 0;
        }

        // ショットエフェクト
        createShotEffect(player.x, player.y, Math.atan2(dy, dx));
        playShootSound();
    }

    player.isDragging = false;
    e.preventDefault();
}

function onTouchStart(e) {
    console.log('[タッチ開始] touches.length:', e.touches.length);
    e.preventDefault();

    if (e.touches.length === 0) {
        console.log('[タッチ開始] touchesが空のため無視');
        return;
    }

    const touch = e.touches[0];
    console.log('[タッチ開始] タッチ座標:', { clientX: touch.clientX, clientY: touch.clientY });

    // 音声コンテキストの初期化を確実に行う
    if (!musicStarted) {
        console.log('[タッチ開始] 音声コンテキストを開始');
        initAudio();
        startAudioContext().catch(error => {
            console.error('[タッチ開始] 音声開始エラー:', error);
            // 音声エラーでも操作は続行
        });
    }

    onMouseDown({
        clientX: touch.clientX,
        clientY: touch.clientY,
        preventDefault: () => { }
    });
}

function onTouchMove(e) {
    e.preventDefault();
    if (e.touches.length > 0) {
        const touch = e.touches[0];
        onMouseMove({
            clientX: touch.clientX,
            clientY: touch.clientY,
            preventDefault: () => { }
        });
    }
}

function onTouchEnd(e) {
    console.log('[タッチ終了] changedTouches.length:', e.changedTouches.length);
    e.preventDefault();
    onMouseUp({
        preventDefault: () => { }
    });
}

// エフェクト生成関数を追加
function createShotEffect(x, y, angle) {
    effects.push(new Effect(x, y, 'ring', {
        color: '#ff0',
        size: 15,
        speed: 2
    }));

    // トレイルエフェクトも追加
    effects.push(new Effect(x, y, 'trail', {
        color: '#ff0',
        angle: angle,
        speed: 1.5
    }));
}

function createWallBounceEffect(x, y) {
    effects.push(new Effect(x, y, 'ring', {
        color: '#0ff',
        size: 10,
        speed: 3
    }));

    createParticles(x, y, '#0ff', 5);
}

function createTargetDestroyEffect(x, y, color) {
    effects.push(new Effect(x, y, 'explosion', {
        color: color,
        size: 20,
        speed: 1
    }));

    effects.push(new Effect(x, y, 'shockwave', {
        color: color,
        size: 5,
        speed: 2
    }));

    createParticles(x, y, color, 20, true);
}

function createPowerUpEffect(x, y, type) {
    const color = powerUpTypes[type].color;

    effects.push(new Effect(x, y, 'powerup_aura', {
        color: color,
        size: 30,
        speed: 1.5
    }));

    effects.push(new Effect(x, y, 'ring', {
        color: color,
        size: 15,
        speed: 2
    }));

    createParticles(x, y, color, 15);
}

// 物理演算を全プレイヤーに対応
function updatePhysics(deltaTime) {
    const dt = deltaTime * timeScale;

    // 全プレイヤーの更新
    for (let playerIndex = players.length - 1; playerIndex >= 0; playerIndex--) {
        const currentPlayer = players[playerIndex];

        if (currentPlayer.isMoving) {
            // ホーミング機能
            if (activePowerUps.homing && targets.length > 0) {
                // 最も近いターゲットを探す
                let nearestTarget = null;
                let nearestDistance = Infinity;

                for (const target of targets) {
                    const distance = Math.hypot(currentPlayer.x - target.x, currentPlayer.y - target.y);
                    if (distance < nearestDistance) {
                        nearestDistance = distance;
                        nearestTarget = target;
                    }
                }

                if (nearestTarget && nearestDistance < 200) {
                    // ターゲットの方向に少し曲げる
                    const targetAngle = Math.atan2(nearestTarget.y - currentPlayer.y, nearestTarget.x - currentPlayer.x);
                    const currentAngle = Math.atan2(currentPlayer.vy, currentPlayer.vx);
                    const angleDiff = targetAngle - currentAngle;

                    // 角度差を正規化
                    let normalizedAngleDiff = angleDiff;
                    while (normalizedAngleDiff > Math.PI) normalizedAngleDiff -= 2 * Math.PI;
                    while (normalizedAngleDiff < -Math.PI) normalizedAngleDiff += 2 * Math.PI;

                    // ホーミング強度
                    const homingStrength = 0.05;
                    const newAngle = currentAngle + normalizedAngleDiff * homingStrength;
                    const speed = Math.hypot(currentPlayer.vx, currentPlayer.vy);

                    currentPlayer.vx = Math.cos(newAngle) * speed;
                    currentPlayer.vy = Math.sin(newAngle) * speed;
                }
            }

            // 速度適用
            currentPlayer.x += currentPlayer.vx * dt;
            currentPlayer.y += currentPlayer.vy * dt;

            // 最高速度制限
            const currentSpeed = Math.hypot(currentPlayer.vx, currentPlayer.vy);
            if (currentSpeed > GAME_CONFIG.PHYSICS.MAX_SPEED) {
                const ratio = GAME_CONFIG.PHYSICS.MAX_SPEED / currentSpeed;
                currentPlayer.vx *= ratio;
                currentPlayer.vy *= ratio;
            }

            // トレイル更新
            currentPlayer.trail.push({ x: currentPlayer.x, y: currentPlayer.y });
            if (currentPlayer.trail.length > GAME_CONFIG.PLAYER.TRAIL_LENGTH) {
                currentPlayer.trail.shift();
            }

            // 壁との衝突
            let bounced = false;
            if (currentPlayer.x - currentPlayer.radius < 0 || currentPlayer.x + currentPlayer.radius > canvasWidth) {
                currentPlayer.vx = -currentPlayer.vx * GAME_CONFIG.PHYSICS.BOUNCE_DAMPING;
                currentPlayer.x = currentPlayer.x - currentPlayer.radius < 0 ? currentPlayer.radius : canvasWidth - currentPlayer.radius;
                bounced = true;
                createWallBounceEffect(currentPlayer.x, currentPlayer.y);
            }

            if (currentPlayer.y - currentPlayer.radius < 0 || currentPlayer.y + currentPlayer.radius > canvasHeight) {
                currentPlayer.vy = -currentPlayer.vy * GAME_CONFIG.PHYSICS.BOUNCE_DAMPING;
                currentPlayer.y = currentPlayer.y - currentPlayer.radius < 0 ? currentPlayer.radius : canvasHeight - currentPlayer.radius;
                bounced = true;
                createWallBounceEffect(currentPlayer.x, currentPlayer.y);
            }

            if (bounced) {
                currentPlayer.bounceCount++;
                playBounceSound();
            }

            // 速度減衰
            const speed = Math.hypot(currentPlayer.vx, currentPlayer.vy);
            if (speed < 3) {
                currentPlayer.vx *= 0.9;
                currentPlayer.vy *= 0.9;
            } else {
                currentPlayer.vx *= 0.995;
                currentPlayer.vy *= 0.995;
            }

            // 停止判定
            if (!godMode && (Math.abs(currentPlayer.vx) < GAME_CONFIG.PHYSICS.STOP_VELOCITY && Math.abs(currentPlayer.vy) < GAME_CONFIG.PHYSICS.STOP_VELOCITY || currentPlayer.bounceCount > currentPlayer.maxBounces)) {
                currentPlayer.vx = 0;
                currentPlayer.vy = 0;
                currentPlayer.isMoving = false;
                currentPlayer.trail = [];

                // マルチショットクローンは削除
                if (currentPlayer.isMultishotClone) {
                    players.splice(playerIndex, 1);
                    continue;
                }

                // メインプレイヤーの場合のみショット終了処理
                if (currentPlayer === player) {
                    shots++;
                    document.getElementById('shots').textContent = shots;
                    const shotsLeft = Math.max(0, shotLimit - shots);
                    document.getElementById('shotsLeft').textContent = shotsLeft;

                    const shotLimitEl = document.getElementById('shotLimit');
                    shotLimitEl.classList.remove('warning', 'danger');
                    if (shotsLeft === 1) {
                        shotLimitEl.classList.add('warning');
                    } else if (shotsLeft === 0) {
                        shotLimitEl.classList.add('danger');
                    }

                    checkStageComplete();

                    // 1ショット効果のパワーアップをリセット
                    const oneTimePowerUps = ['penetrate', 'speed', 'power', 'multishot', 'homing', 'predict'];
                    for (const type of oneTimePowerUps) {
                        if (activePowerUps[type]) {
                            delete activePowerUps[type];
                            const icon = document.getElementById(type + 'Icon');
                            if (icon) {
                                if (pendingPowerUps[type]) {
                                    icon.style.opacity = '0.5';
                                    icon.classList.remove('active');
                                } else {
                                    icon.style.display = 'none';
                                    icon.style.opacity = '1';
                                    icon.classList.remove('active');
                                }
                            }
                        }
                    }
                    currentPlayer.speed = 1;
                    currentPlayer.power = 1;
                    currentPlayer.maxBounces = 50;
                }
            }
        }

        // 障害物との衝突（全プレイヤー）
        for (const obs of obstacles) {
            if (obs.rotating) {
                obs.angle += obs.speed * dt;
            }

            if (currentPlayer.isMoving && !activePowerUps.penetrate && checkObstacleCollision(currentPlayer, obs)) {
                handleObstacleCollision(currentPlayer, obs);
                playBounceSound();
                createParticles(currentPlayer.x, currentPlayer.y, '#ff0');
            }
        }

        // ターゲットとの衝突（全プレイヤー）
        for (let i = targets.length - 1; i >= 0; i--) {
            const target = targets[i];

            if (currentPlayer.isMoving && Math.hypot(currentPlayer.x - target.x, currentPlayer.y - target.y) < currentPlayer.radius + target.radius) {
                const damage = currentPlayer.power || player.power;
                target.hits += damage;

                createParticles(target.x, target.y, target.type === 'hard' ? '#ff0' : '#f88', 10);

                if (target.hits >= target.maxHits) {
                    const destroyColor = target.type === 'hard' ? '#f00' : '#f0f';
                    createTargetDestroyEffect(target.x, target.y, destroyColor);
                    targets.splice(i, 1);
                    playTargetHitSound();
                    document.getElementById('targetsLeft').textContent = targets.length;
                } else {
                    playBounceSound();
                }

                // 反射・貫通処理
                if (activePowerUps.penetrate) {
                    // 貫通状態：何もしない
                } else if (target.type === 'hard') {
                    const angle = Math.atan2(currentPlayer.y - target.y, currentPlayer.x - target.x);
                    const speed = Math.hypot(currentPlayer.vx, currentPlayer.vy) * 0.8;
                    currentPlayer.vx = Math.cos(angle) * speed;
                    currentPlayer.vy = Math.sin(angle) * speed;
                    currentPlayer.bounceCount++;
                } else if (target.type === 'soft') {
                    currentPlayer.vx *= 0.7;
                    currentPlayer.vy *= 0.7;
                }
            }
        }
    }

    // ターゲットの移動処理
    for (let i = targets.length - 1; i >= 0; i--) {
        const target = targets[i];
        target.pulse += 0.05 * dt;

        if (target.moving && !player.isMoving) {
            if (target.moveType === 'horizontal') {
                target.x += target.speed * dt * 0.02;
                if (target.x - target.radius < 0 || target.x + target.radius > canvasWidth) {
                    target.speed = -target.speed;
                    target.x = target.x - target.radius < 0 ? target.radius : canvasWidth - target.radius;
                }
            } else if (target.moveType === 'circular') {
                target.moveAngle += target.speed * dt * 0.002;
                const radius = 50;
                target.x = target.originalX + Math.cos(target.moveAngle) * radius;
                target.y = target.originalY + Math.sin(target.moveAngle) * radius;
            }
        }
    }

    // パワーアップ取得
    for (const pu of powerUps) {
        if (!pu.collected) {
            pu.pulse += 0.1 * dt;

            for (const currentPlayer of players) {
                if (currentPlayer.isMoving && Math.hypot(currentPlayer.x - pu.x, currentPlayer.y - pu.y) < currentPlayer.radius + pu.radius) {
                    pu.collected = true;
                    pendingPowerUps[pu.type] = powerUpTypes[pu.type].duration;
                    createPowerUpEffect(pu.x, pu.y, pu.type);
                    playPowerUpSound();

                    const icon = document.getElementById(pu.type + 'Icon');
                    if (icon) {
                        icon.style.display = 'block';
                        icon.style.opacity = '0.5';
                        icon.style.borderColor = powerUpTypes[pu.type].color;
                        icon.style.boxShadow = `0 0 10px ${powerUpTypes[pu.type].color}`;
                        icon.style.color = powerUpTypes[pu.type].color;
                        icon.textContent = POWERUP_ICONS[pu.type];
                    }

                    showPowerUpMessage(pu.type, `${ITEM_NAMES[pu.type]} 取得！`);
                    break;
                }
            }
        }
    }

    // パーティクル更新
    updateParticles(dt);

    // エフェクト更新
    for (let i = effects.length - 1; i >= 0; i--) {
        if (!effects[i].update(dt)) {
            effects.splice(i, 1);
        }
    }
}

// 障害物衝突判定
function checkObstacleCollision(player, obstacle) {
    const cos = Math.cos(-obstacle.angle);
    const sin = Math.sin(-obstacle.angle);

    const dx = player.x - obstacle.x;
    const dy = player.y - obstacle.y;
    const localX = dx * cos - dy * sin;
    const localY = dx * sin + dy * cos;

    const halfWidth = obstacle.width / 2;
    const halfHeight = obstacle.height / 2;

    const closestX = Math.max(-halfWidth, Math.min(halfWidth, localX));
    const closestY = Math.max(-halfHeight, Math.min(halfHeight, localY));

    const distance = Math.hypot(localX - closestX, localY - closestY);

    return distance < player.radius;
}

// 障害物との衝突処理
function handleObstacleCollision(player, obstacle) {
    const angle = Math.atan2(player.y - obstacle.y, player.x - obstacle.x);
    const speed = Math.hypot(player.vx, player.vy) * 0.9;
    player.vx = Math.cos(angle) * speed;
    player.vy = Math.sin(angle) * speed;

    const distance = player.radius + 5;
    player.x = obstacle.x + Math.cos(angle) * (Math.max(obstacle.width, obstacle.height) / 2 + distance);
    player.y = obstacle.y + Math.sin(angle) * (Math.max(obstacle.width, obstacle.height) / 2 + distance);

    player.bounceCount++;
}

// パワーアップ有効化
function activatePowerUp(type) {
    activePowerUps[type] = powerUpTypes[type].duration;
    const icon = document.getElementById(type + 'Icon');
    if (icon) {
        icon.style.display = 'block';
        icon.style.opacity = '1';
        icon.classList.add('active');
        icon.style.borderColor = powerUpTypes[type].color;
        icon.style.boxShadow = `0 0 10px ${powerUpTypes[type].color}`;
        icon.style.color = powerUpTypes[type].color;
        icon.textContent = POWERUP_ICONS[type];
    }

    showPowerUpMessage(type, POWERUP_MESSAGES[type]);

    switch (type) {
        case 'speed':
            player.speed = GAME_CONFIG.POWERUP.SPEED_MULTIPLIER;
            break;
        case 'power':
            player.power = GAME_CONFIG.POWERUP.POWER_MULTIPLIER;
            break;
        case 'multishot':
            console.log('マルチショットパワーアップ有効化');
            break;
        case 'homing':
            console.log('ホーミングパワーアップ有効化');
            break;
        case 'predict':
            console.log('軌道予測パワーアップ有効化');
            break;
    }
}

// パワーアップメッセージ表示
function showPowerUpMessage(type, message) {
    const statusDiv = document.getElementById('powerUpStatus');
    const messageDiv = document.createElement('div');
    messageDiv.className = 'status-effect';
    messageDiv.style.color = powerUpTypes[type].color;
    messageDiv.style.borderColor = powerUpTypes[type].color;
    messageDiv.style.textShadow = `0 0 10px ${powerUpTypes[type].color}`;
    messageDiv.textContent = message;

    statusDiv.appendChild(messageDiv);

    setTimeout(() => {
        messageDiv.style.opacity = '0';
        messageDiv.style.transform = 'translateX(50px)';
        messageDiv.style.transition = 'all 0.5s';
        setTimeout(() => messageDiv.remove(), GAME_CONFIG.UI.MESSAGE_FADE_DURATION);
    }, GAME_CONFIG.UI.MESSAGE_DURATION);
}

// ステージクリアチェック
function checkStageComplete() {
    // 1ショット効果のパワーアップをリセット
    const oneTimePowerUps = ['penetrate', 'speed', 'power', 'multishot', 'homing', 'predict'];
    for (const type of oneTimePowerUps) {
        if (activePowerUps[type]) {
            delete activePowerUps[type];
            const icon = document.getElementById(type + 'Icon');
            if (icon) {
                icon.style.display = 'none';
                icon.style.opacity = '1';
                icon.classList.remove('active');
            }
        }
    }
    player.speed = 1;
    player.power = 1;
    player.maxBounces = 50;

    if (targets.length === 0) {
        // ステージクリア時にのみ pendingPowerUps をクリア
        for (const type in pendingPowerUps) {
            delete pendingPowerUps[type];
            const icon = document.getElementById(type + 'Icon');
            if (icon) icon.style.display = 'none';
        }

        gameState = 'stageClear';
        playClearSound();
        document.getElementById('shotsUsed').textContent = shots;
        document.getElementById('perfect').textContent = shots === 1 ? 'YES!' : 'NO';
        document.getElementById('stageClearScreen').style.display = 'block';

    } else if (shots >= shotLimit) {
        // ゲームオーバー時にのみ pendingPowerUps をクリア
        for (const type in pendingPowerUps) {
            delete pendingPowerUps[type];
            const icon = document.getElementById(type + 'Icon');
            if (icon) icon.style.display = 'none';
        }

        gameState = 'gameOver';
        playFailSound();
        document.getElementById('gameOverScreen').style.display = 'block';
    }
}

// パーティクル
function createParticles(x, y, color, count = 10, explosion = false) {
    for (let i = 0; i < count; i++) {
        const angle = (i / count) * Math.PI * 2;
        const speed = explosion ? Math.random() * 10 + 5 : Math.random() * 5;
        particles.push({
            x: x,
            y: y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            life: 1,
            color: color,
            size: explosion ? Math.random() * 4 + 2 : 3
        });
    }
}

function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += 0.2 * dt; // 重力
        p.life -= 0.02 * dt;

        if (p.life <= 0) {
            particles.splice(i, 1);
        }
    }
}

// 描画：全プレイヤーとマルチショット・ホーミング対応
function render() {
    // 背景
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    // グリッド（パフォーマンスを考慮してグリッド間隔を調整）
    ctx.strokeStyle = 'rgba(0, 255, 255, 0.1)';
    ctx.lineWidth = 1;
    const gridSize = 50;
    for (let i = 0; i < canvasWidth; i += gridSize) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i, canvasHeight);
        ctx.stroke();
    }
    for (let j = 0; j < canvasHeight; j += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, j);
        ctx.lineTo(canvasWidth, j);
        ctx.stroke();
    }

    // エフェクト（最下層）
    for (const effect of effects) {
        effect.render(ctx);
    }

    // パワーアップ
    for (const pu of powerUps) {
        if (!pu.collected) {
            ctx.save();
            const pulseSize = Math.sin(pu.pulse) * 5;

            // より強いグロー効果の背景
            ctx.fillStyle = powerUpTypes[pu.type].color;
            ctx.shadowColor = powerUpTypes[pu.type].color;
            ctx.shadowBlur = 40 + pulseSize;
            ctx.globalAlpha = 0.3;
            ctx.beginPath();
            ctx.arc(pu.x, pu.y, pu.radius + 15, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1;

            // 背景の円（より目立つ黒）
            ctx.fillStyle = 'rgba(0, 0, 0, 0.9)';
            ctx.shadowBlur = 0;
            ctx.beginPath();
            ctx.arc(pu.x, pu.y, pu.radius + 5, 0, Math.PI * 2);
            ctx.fill();

            // 外側の装飾リング（より多く、より目立つ）
            for (let i = 0; i < 4; i++) {
                ctx.strokeStyle = powerUpTypes[pu.type].color;
                ctx.lineWidth = 3 - i * 0.5;
                ctx.globalAlpha = 0.9 - i * 0.15;
                ctx.shadowColor = powerUpTypes[pu.type].color;
                ctx.shadowBlur = 15 + pulseSize;
                ctx.beginPath();
                ctx.arc(pu.x, pu.y, pu.radius + 12 + pulseSize + i * 6, 0, Math.PI * 2);
                ctx.stroke();
            }
            ctx.globalAlpha = 1;
            ctx.shadowBlur = 0;

            // 本体（より目立つ星形）
            ctx.fillStyle = powerUpTypes[pu.type].color;
            ctx.shadowColor = powerUpTypes[pu.type].color;
            ctx.shadowBlur = 20;
            ctx.beginPath();
            const starRotation = pu.pulse * 0.5;
            for (let i = 0; i < 10; i++) {
                const angle = (i / 10) * Math.PI * 2 + starRotation;
                const r = i % 2 === 0 ? pu.radius + 2 : pu.radius * 0.6;
                const x = pu.x + Math.cos(angle) * r;
                const y = pu.y + Math.sin(angle) * r;
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.closePath();
            ctx.fill();

            // アイコン（テキストアイコンのみ使用）
            ctx.fillStyle = '#000';
            ctx.shadowColor = powerUpTypes[pu.type].color;
            ctx.shadowBlur = 10;
            ctx.font = 'bold 24px Courier New';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(POWERUP_ICONS[pu.type], pu.x, pu.y);

            // アイテム名表示（より目立つ）
            ctx.fillStyle = powerUpTypes[pu.type].color;
            ctx.shadowColor = powerUpTypes[pu.type].color;
            ctx.shadowBlur = 15;
            ctx.font = 'bold 12px Courier New';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            ctx.fillText(ITEM_NAMES[pu.type], pu.x, pu.y - pu.radius - 20);

            // 効果説明を小さく表示
            ctx.font = 'bold 8px Courier New';
            ctx.globalAlpha = 0.8;
            ctx.fillText(ITEM_DESCRIPTIONS[pu.type], pu.x, pu.y + pu.radius + 15);
            ctx.globalAlpha = 1;

            ctx.restore();
        }
    }

    // 障害物
    ctx.shadowBlur = 0;
    for (const obs of obstacles) {
        ctx.save();
        ctx.translate(obs.x, obs.y);
        ctx.rotate(obs.angle);

        // 貫通状態の時は半透明に
        if (activePowerUps.penetrate) {
            ctx.globalAlpha = 0.3;
        }

        // グロー効果
        ctx.shadowColor = '#ff0';
        ctx.shadowBlur = 10;

        ctx.fillStyle = 'rgba(255, 255, 0, 0.3)';
        ctx.fillRect(-obs.width / 2, -obs.height / 2, obs.width, obs.height);

        ctx.strokeStyle = '#ff0';
        ctx.lineWidth = 2;
        ctx.strokeRect(-obs.width / 2, -obs.height / 2, obs.width, obs.height);

        // エッジの光
        ctx.strokeStyle = 'rgba(255, 255, 0, 0.8)';
        ctx.lineWidth = 1;
        ctx.strokeRect(-obs.width / 2 - 2, -obs.height / 2 - 2, obs.width + 4, obs.height + 4);

        ctx.restore();
    }

    // ターゲット
    for (const target of targets) {
        ctx.save();
        const pulseSize = Math.sin(target.pulse) * 3;

        // 貫通状態の時は半透明に
        if (activePowerUps.penetrate) {
            ctx.globalAlpha = 0.5;
        }

        if (target.type === 'hard') {
            // ハードタイプ（硬い・反射）
            const damageRatio = target.hits / target.maxHits;
            const baseColor = damageRatio > 0.5 ? '#800' : damageRatio > 0 ? '#c00' : '#f00';

            ctx.fillStyle = baseColor;
            ctx.shadowColor = baseColor;
            ctx.shadowBlur = 20 + pulseSize;

            // 外側の装甲（ダメージで欠ける）
            ctx.strokeStyle = baseColor;
            ctx.lineWidth = 4 - damageRatio * 2;
            ctx.beginPath();
            // 八角形の形状
            for (let i = 0; i < 8; i++) {
                const angle = (i / 8) * Math.PI * 2;
                const damageOffset = damageRatio > 0 && i % 2 === 0 ? Math.random() * 3 : 0;
                const x = target.x + Math.cos(angle) * (target.radius + 2 - damageOffset);
                const y = target.y + Math.sin(angle) * (target.radius + 2 - damageOffset);
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.closePath();
            ctx.stroke();

            // 本体
            ctx.fillStyle = '#c00';
            ctx.beginPath();
            for (let i = 0; i < 8; i++) {
                const angle = (i / 8) * Math.PI * 2;
                const x = target.x + Math.cos(angle) * target.radius;
                const y = target.y + Math.sin(angle) * target.radius;
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.closePath();
            ctx.fill();

            // 内側の装甲模様
            ctx.fillStyle = '#800';
            ctx.beginPath();
            for (let i = 0; i < 8; i++) {
                const angle = (i / 8) * Math.PI * 2;
                const x = target.x + Math.cos(angle) * target.radius * 0.5;
                const y = target.y + Math.sin(angle) * target.radius * 0.5;
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.closePath();
            ctx.fill();
        } else {
            // ソフトタイプ（柔らかい・貫通）
            const damageRatio = target.hits / target.maxHits;
            const baseColor = damageRatio > 0.5 ? '#808' : damageRatio > 0 ? '#c0c' : '#f0f';

            ctx.fillStyle = baseColor;
            ctx.shadowColor = baseColor;
            ctx.shadowBlur = 20 + pulseSize;

            // 波打つような外形（ダメージで変形）
            ctx.beginPath();
            for (let i = 0; i < 16; i++) {
                const angle = (i / 16) * Math.PI * 2;
                const waveOffset = Math.sin(angle * 4 + target.pulse) * (3 + damageRatio * 2);
                const damageDeform = damageRatio > 0 ? Math.random() * damageRatio * 5 : 0;
                const r = target.radius + waveOffset - damageDeform;
                const x = target.x + Math.cos(angle) * r;
                const y = target.y + Math.sin(angle) * r;
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.closePath();
            ctx.fill();

            // 内側のグラデーション風
            ctx.fillStyle = '#c0c';
            ctx.beginPath();
            ctx.arc(target.x, target.y, target.radius * 0.6, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = '#808';
            ctx.beginPath();
            ctx.arc(target.x, target.y, target.radius * 0.3, 0, Math.PI * 2);
            ctx.fill();
        }

        // 動く敵には矢印を表示
        if (target.moving) {
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 2;
            ctx.globalAlpha = 0.8;

            if (target.moveType === 'horizontal') {
                // 左右の矢印
                const arrowSize = 8;
                ctx.beginPath();
                ctx.moveTo(target.x - target.radius - 10, target.y);
                ctx.lineTo(target.x - target.radius - 10 + arrowSize, target.y - arrowSize);
                ctx.moveTo(target.x - target.radius - 10, target.y);
                ctx.lineTo(target.x - target.radius - 10 + arrowSize, target.y + arrowSize);
                ctx.moveTo(target.x - target.radius - 10, target.y);
                ctx.lineTo(target.x + target.radius + 10, target.y);
                ctx.moveTo(target.x + target.radius + 10, target.y);
                ctx.lineTo(target.x + target.radius + 10 - arrowSize, target.y - arrowSize);
                ctx.moveTo(target.x + target.radius + 10, target.y);
                ctx.lineTo(target.x + target.radius + 10 - arrowSize, target.y + arrowSize);
                ctx.stroke();
            } else if (target.moveType === 'circular') {
                // 円形の矢印
                ctx.beginPath();
                ctx.arc(target.originalX, target.originalY, 50, 0, Math.PI * 1.7);
                ctx.stroke();
                const endAngle = Math.PI * 1.7;
                const arrowSize = 8;
                ctx.beginPath();
                ctx.moveTo(target.originalX + Math.cos(endAngle) * 50,
                    target.originalY + Math.sin(endAngle) * 50);
                ctx.lineTo(target.originalX + Math.cos(endAngle - 0.3) * (50 - arrowSize),
                    target.originalY + Math.sin(endAngle - 0.3) * (50 - arrowSize));
                ctx.stroke();
            }
            ctx.globalAlpha = 1;
        }

        // HP表示（複数HPの場合）
        if (target.maxHits > 1) {
            const remainingHp = target.maxHits - target.hits;
            const barWidth = Math.min(50, target.radius * 2.5);
            const barX = target.x - barWidth / 2;

            // HPバー背景
            ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
            ctx.fillRect(barX, target.y + target.radius + 10, barWidth, 6);

            // HPバー
            const hpRatio = remainingHp / target.maxHits;
            ctx.fillStyle = hpRatio > 0.5 ? '#0f0' : hpRatio > 0.25 ? '#ff0' : '#f00';
            ctx.fillRect(barX, target.y + target.radius + 10, barWidth * hpRatio, 6);

            // HPバー枠
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 1;
            ctx.strokeRect(barX, target.y + target.radius + 10, barWidth, 6);

            // HP数値
            ctx.fillStyle = '#fff';
            ctx.font = '12px Courier New';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(`${remainingHp}/${target.maxHits}`, target.x, target.y + target.radius + 25);
        }

        ctx.restore();
    }

    // 全プレイヤーのトレイル描画
    for (const currentPlayer of players) {
        if (currentPlayer.trail.length > 1) {
            let trailColor = '#0ff';
            if (activePowerUps.penetrate) trailColor = '#f0f';
            else if (activePowerUps.power) trailColor = '#f00';
            else if (activePowerUps.speed) trailColor = '#00f';
            else if (activePowerUps.multishot) trailColor = '#0f0';
            else if (activePowerUps.homing) trailColor = '#ff0';

            ctx.strokeStyle = trailColor;
            ctx.lineWidth = 3;
            ctx.shadowColor = trailColor;
            ctx.shadowBlur = 10;

            ctx.beginPath();
            ctx.moveTo(currentPlayer.trail[0].x, currentPlayer.trail[0].y);

            for (let i = 1; i < currentPlayer.trail.length; i++) {
                ctx.lineTo(currentPlayer.trail[i].x, currentPlayer.trail[i].y);
                ctx.globalAlpha = i / currentPlayer.trail.length;
            }
            ctx.stroke();
            ctx.globalAlpha = 1;
            ctx.shadowBlur = 0;
        }
    }

    // 全プレイヤーの描画
    for (const currentPlayer of players) {
        ctx.save();

        // パワーアップエフェクト（メインプレイヤーのみ）
        if (currentPlayer === player) {
            if (activePowerUps.penetrate) {
                ctx.fillStyle = '#f0f';
                ctx.globalAlpha = 0.3;
                for (let i = 0; i < 3; i++) {
                    ctx.beginPath();
                    ctx.arc(currentPlayer.x, currentPlayer.y, currentPlayer.radius * (1.5 + i * 0.3), 0, Math.PI * 2);
                    ctx.fill();
                }
                ctx.globalAlpha = 1;
            }

            if (activePowerUps.power) {
                ctx.fillStyle = '#f00';
                ctx.globalAlpha = 0.3;
                ctx.beginPath();
                ctx.arc(currentPlayer.x, currentPlayer.y, currentPlayer.radius * 2, 0, Math.PI * 2);
                ctx.fill();
                ctx.globalAlpha = 1;
            }

            if (activePowerUps.speed) {
                const speedAngle = Math.atan2(currentPlayer.vy, currentPlayer.vx);
                ctx.strokeStyle = '#00f';
                ctx.lineWidth = 2;
                ctx.globalAlpha = 0.5;
                for (let i = 0; i < 3; i++) {
                    ctx.beginPath();
                    ctx.moveTo(currentPlayer.x, currentPlayer.y);
                    ctx.lineTo(
                        currentPlayer.x - Math.cos(speedAngle + (i - 1) * 0.3) * 30,
                        currentPlayer.y - Math.sin(speedAngle + (i - 1) * 0.3) * 30
                    );
                    ctx.stroke();
                }
                ctx.globalAlpha = 1;
            }

            if (activePowerUps.multishot) {
                // マルチショットエフェクト（緑の三重リング）
                ctx.strokeStyle = '#0f0';
                ctx.lineWidth = 2;
                ctx.globalAlpha = 0.5;
                const multishotAngle = Date.now() * 0.005;
                for (let i = 0; i < 3; i++) {
                    ctx.beginPath();
                    ctx.arc(currentPlayer.x, currentPlayer.y, currentPlayer.radius * (1.2 + i * 0.3), multishotAngle + i * Math.PI * 0.67, multishotAngle + i * Math.PI * 0.67 + Math.PI * 0.67);
                    ctx.stroke();
                }
                ctx.globalAlpha = 1;
            }

            if (activePowerUps.homing) {
                // ホーミングエフェクト（黄色の回転十字）
                ctx.strokeStyle = '#ff0';
                ctx.lineWidth = 3;
                ctx.globalAlpha = 0.7;
                const homingAngle = Date.now() * 0.01;
                const crossSize = currentPlayer.radius * 1.5;

                ctx.save();
                ctx.translate(currentPlayer.x, currentPlayer.y);
                ctx.rotate(homingAngle);

                // 十字を描画
                ctx.beginPath();
                ctx.moveTo(-crossSize, 0);
                ctx.lineTo(crossSize, 0);
                ctx.moveTo(0, -crossSize);
                ctx.lineTo(0, crossSize);
                ctx.stroke();

                ctx.restore();
                ctx.globalAlpha = 1;
            }
        }

        // プレイヤー本体
        let playerColor = '#0ff';
        if (currentPlayer.isMultishotClone) {
            playerColor = '#0f0'; // マルチショットクローンは緑
        }

        ctx.fillStyle = playerColor;
        ctx.shadowColor = playerColor;
        ctx.shadowBlur = 20;

        ctx.translate(currentPlayer.x, currentPlayer.y);
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
            const angle = (i / 6) * Math.PI * 2;
            const x = Math.cos(angle) * currentPlayer.radius;
            const y = Math.sin(angle) * currentPlayer.radius;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.fill();

        // 内側の装飾
        ctx.fillStyle = currentPlayer.isMultishotClone ? '#080' : '#088';
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
            const angle = (i / 6) * Math.PI * 2;
            const x = Math.cos(angle) * currentPlayer.radius * 0.5;
            const y = Math.sin(angle) * currentPlayer.radius * 0.5;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.fill();

        ctx.restore();
    }

    // 引っ張りライン
    if (player.isDragging && !player.isMoving) {
        ctx.strokeStyle = '#ff0';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        ctx.shadowColor = '#ff0';
        ctx.shadowBlur = 5;

        ctx.beginPath();
        ctx.moveTo(player.x, player.y);
        ctx.lineTo(player.dragStartX, player.dragStartY);
        ctx.stroke();
        ctx.setLineDash([]);

        // 引っ張り強度表示
        const power = Math.min(Math.hypot(player.x - player.dragStartX, player.y - player.dragStartY) / 100, 1);
        ctx.fillStyle = `rgba(255, ${255 - power * 155}, 0, 0.5)`;
        ctx.beginPath();
        ctx.arc(player.x, player.y, player.radius * (1 + power), 0, Math.PI * 2);
        ctx.fill();

        // 予測線表示の条件をデバッグ（時間制御）
        const hasPredictActive = !!activePowerUps.predict;
        const hasPredictPending = !!pendingPowerUps.predict;

        // デバッグログを時間制御で出力
        const currentTime = Date.now();
        if (currentTime - lastDebugTime > DEBUG_LOG_INTERVAL) {
            console.log('[描画] 軌道予測チェック:', {
                isDragging: player.isDragging,
                isMoving: player.isMoving,
                activePowerUps_predict: activePowerUps.predict,
                pendingPowerUps_predict: pendingPowerUps.predict,
                hasPredictActive,
                hasPredictPending,
                shouldShowPrediction: (hasPredictActive || hasPredictPending) && player.isDragging && !player.isMoving,
                pendingPowerUpsObject: pendingPowerUps,
                activePowerUpsObject: activePowerUps
            });

            if (hasPredictActive) {
                console.log('[PREDICT] 軌道予測がアクティブです！');
            }
            if (hasPredictPending) {
                console.log('[PREDICT] 軌道予測がペンディングです！');
            }

            lastDebugTime = currentTime;
        }

        // 予測線（軌道予測パワーアップが有効な場合）
        if ((hasPredictActive || hasPredictPending) && player.isDragging && !player.isMoving) {
            console.log('[描画] 軌道予測線を描画開始');
            drawPredictionLine();
        }

        ctx.shadowBlur = 0;
    }

    // パーティクル
    for (const p of particles) {
        const alpha = Math.floor(p.life * 255).toString(16).padStart(2, '0');
        ctx.fillStyle = p.color;
        ctx.globalAlpha = p.life;
        ctx.shadowColor = p.color;
        ctx.shadowBlur = p.size;
        ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
        ctx.globalAlpha = 1;
    }
    ctx.shadowBlur = 0;
}

// 予測線描画
function drawPredictionLine() {
    if (!player.isDragging) {
        return;
    }

    ctx.save();

    // メインの予測線を描画（破線のみ）
    ctx.strokeStyle = '#0ff';
    ctx.lineWidth = GAME_CONFIG.RENDER.PREDICTION_LINE_WIDTH;
    ctx.globalAlpha = GAME_CONFIG.RENDER.PREDICTION_ALPHA;
    ctx.shadowColor = '#0ff';
    ctx.shadowBlur = 10;
    ctx.setLineDash([5, 5]);

    let px = player.x;
    let py = player.y;
    let pvx = (player.x - player.dragStartX) * GAME_CONFIG.PLAYER.SHOT_POWER * player.speed;
    let pvy = (player.y - player.dragStartY) * GAME_CONFIG.PLAYER.SHOT_POWER * player.speed;
    let bounces = 0;

    // 速度制限を予測にも適用
    let predictSpeed = Math.hypot(pvx, pvy);
    if (predictSpeed > GAME_CONFIG.PHYSICS.MAX_SPEED) {
        const ratio = GAME_CONFIG.PHYSICS.MAX_SPEED / predictSpeed;
        pvx *= ratio;
        pvy *= ratio;
    }

    ctx.beginPath();
    ctx.moveTo(px, py);

    for (let i = 0; i < GAME_CONFIG.RENDER.PREDICTION_MAX_ITERATIONS && bounces < GAME_CONFIG.RENDER.PREDICTION_MAX_BOUNCES; i++) {
        pvx *= GAME_CONFIG.PHYSICS.NORMAL_DAMPING;
        pvy *= GAME_CONFIG.PHYSICS.NORMAL_DAMPING;
        px += pvx;
        py += pvy;

        // 壁反射の予測
        let bounced = false;
        if (px < player.radius || px > canvasWidth - player.radius) {
            pvx = -pvx * GAME_CONFIG.PHYSICS.BOUNCE_DAMPING;
            px = px < player.radius ? player.radius : canvasWidth - player.radius;
            bounces++;
            bounced = true;
        }

        if (py < player.radius || py > canvasHeight - player.radius) {
            pvy = -pvy * GAME_CONFIG.PHYSICS.BOUNCE_DAMPING;
            py = py < player.radius ? player.radius : canvasHeight - player.radius;
            bounces++;
            bounced = true;
        }

        // 障害物の予測（貫通状態でない場合のみ）
        if (!activePowerUps.penetrate && !pendingPowerUps.penetrate) {
            for (const obs of obstacles) {
                const tempPlayer = { x: px, y: py, radius: player.radius };
                if (checkObstacleCollision(tempPlayer, obs)) {
                    const angle = Math.atan2(py - obs.y, px - obs.x);
                    const speed = Math.hypot(pvx, pvy) * 0.9;
                    pvx = Math.cos(angle) * speed;
                    pvy = Math.sin(angle) * speed;
                    bounces++;
                    bounced = true;
                    break;
                }
            }
        }

        ctx.lineTo(px, py);

        // 停止判定
        if (Math.abs(pvx) < GAME_CONFIG.PHYSICS.STOP_VELOCITY && Math.abs(pvy) < GAME_CONFIG.PHYSICS.STOP_VELOCITY) {
            break;
        }
    }

    ctx.stroke();
    ctx.restore();
}

// ゲームループ
let lastTime = 0;
function gameLoop(currentTime) {
    const deltaTime = Math.min((currentTime - lastTime) / 16.67, 2);
    lastTime = currentTime;

    if (gameState === 'playing') {
        updatePhysics(deltaTime);
    }

    render();
    requestAnimationFrame(gameLoop);
}

// ゲーム開始
async function startGame() {
    console.log('[ゲーム開始] startGame() 呼び出し');
    gameState = 'playing';
    document.getElementById('startScreen').style.display = 'none';

    // 音声初期化とコンテキスト開始（エラーでも続行）
    try {
        initAudio();
        await startAudioContext();
        console.log('[ゲーム開始] 音声初期化完了');
    } catch (error) {
        console.error('[ゲーム開始] 音声初期化エラー（続行）:', error);
    }

    init();
    loadStage(currentStage);
    lastTime = performance.now();
    gameLoop(lastTime);

    console.log('[ゲーム開始] ゲーム開始完了');
}

// 次のステージ
function nextStage() {
    currentStage++;
    document.getElementById('stageClearScreen').style.display = 'none';
    gameState = 'playing';
    loadStage(currentStage);
}

// リトライ（ステージ1から）
function retryStage() {
    currentStage = 1;
    document.getElementById('gameOverScreen').style.display = 'none';
    gameState = 'playing';
    loadStage(currentStage);
}

// メニューに戻る
function backToMenu() {
    location.reload();
}

// ヘルプ表示
function showHelp() {
    document.getElementById('helpModal').style.display = 'flex';
}

// ヘルプ非表示
function hideHelp(event) {
    if (!event || event.target.id === 'helpModal') {
        document.getElementById('helpModal').style.display = 'none';
    }
}

// 開発者モード関数
function showDevPanel() {
    if (!GAME_CONFIG.DEVELOPER.ENABLED) return;
    document.getElementById('devModal').style.display = 'flex';
}

function hideDevPanel(event) {
    if (!event || event.target.id === 'devModal') {
        document.getElementById('devModal').style.display = 'none';
    }
}

function destroyAllTargets() {
    hideDevPanel();

    for (let i = targets.length - 1; i >= 0; i--) {
        const target = targets[i];
        const destroyColor = target.type === 'hard' ? '#f00' : '#f0f';
        createTargetDestroyEffect(target.x, target.y, destroyColor);
        targets.splice(i, 1);
    }
    document.getElementById('targetsLeft').textContent = targets.length;
    playTargetHitSound();

    setTimeout(() => {
        checkStageComplete();
    }, 100);
}

function resetStage() {
    hideDevPanel();
    loadStage(currentStage);
}

function applyPowerUp(type) {
    if (!powerUpTypes[type]) return;

    hideDevPanel();
    activatePowerUp(type);

    const icon = document.getElementById(type + 'Icon');
    if (icon) {
        icon.style.display = 'block';
        icon.style.opacity = '1';
        icon.classList.add('active');
    }
}

function resetPlayer() {
    hideDevPanel();

    player.x = canvasWidth / 2;
    player.y = canvasHeight - GAME_CONFIG.PLAYER.START_OFFSET_Y;
    player.vx = 0;
    player.vy = 0;
    player.isMoving = false;
    player.isDragging = false;
    player.trail = [];
}

function toggleGodMode() {
    hideDevPanel();

    godMode = !godMode;
    const btn = document.getElementById('godModeBtn');
    btn.textContent = `無敵モード: ${godMode ? 'ON' : 'OFF'}`;
    btn.style.borderColor = godMode ? '#0f0' : '#0ff';
    btn.style.color = godMode ? '#0f0' : '#0ff';

    if (godMode) {
        player.maxBounces = 999999;
    } else {
        player.maxBounces = GAME_CONFIG.PLAYER.MAX_BOUNCES;
    }
}

function jumpToStage(stageNum) {
    currentStage = stageNum;
    loadStage(currentStage);
    hideDevPanel();
}