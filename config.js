// ゲーム設定値
const GAME_CONFIG = {
    // キャンバス設定
    CANVAS: {
        DEFAULT_WIDTH: 800,
        DEFAULT_HEIGHT: 600,
        MOBILE_WIDTH: 400,
        MOBILE_HEIGHT: 600,
        MOBILE_BREAKPOINT: 600,
        SCALE_FACTOR: 0.9
    },

    // プレイヤー設定
    PLAYER: {
        RADIUS: 15,
        START_OFFSET_Y: 100,
        TOUCH_AREA_MULTIPLIER: 4,
        SHOT_POWER: 0.3,
        MAX_BOUNCES: 50,
        ENHANCED_MAX_BOUNCES: 100,
        TRAIL_LENGTH: 30
    },

    // 引っ張り設定
    DRAG: {
        MAX_DISTANCE: 500,
        MIN_SHOT_DISTANCE: 10
    },

    // 物理設定
    PHYSICS: {
        BOUNCE_DAMPING: 0.9,
        SLOW_SPEED_THRESHOLD: 3,
        SLOW_DAMPING: 0.9,
        NORMAL_DAMPING: 0.995,
        STOP_VELOCITY: 0.3,
        GRAVITY: 0.2,
        PARTICLE_LIFE_DECAY: 0.02,
        MAX_SPEED: 50  // 最高速度制限
    },

    // ターゲット設定
    TARGET: {
        RADIUS: 20,
        SOFT_SPEED_REDUCTION: 0.7,
        HARD_BOUNCE_REDUCTION: 0.8
    },

    // パワーアップ設定
    POWERUP: {
        RADIUS: 20,
        SPEED_MULTIPLIER: 1.5,
        POWER_MULTIPLIER: 3,
        SLOW_TIME_SCALE: 0.5,
        SLOW_DURATION: 10000
    },

    // エフェクト設定
    EFFECTS: {
        EXPLOSION_SIZE_INCREMENT: 5,
        RING_SIZE_INCREMENT: 10,
        SHOCKWAVE_SIZE_INCREMENT: 15,
        LIFE_DECAY_SPEED: 0.05
    },

    // 描画設定
    RENDER: {
        GRID_SIZE: 50,
        SHADOW_BLUR: 20,
        TRAIL_WIDTH: 3,
        PREDICTION_MAX_BOUNCES: 3,
        PREDICTION_MAX_ITERATIONS: 1000,
        PREDICTION_LINE_WIDTH: 2,
        PREDICTION_GLOW_WIDTH: 3,
        PREDICTION_ALPHA: 0.8,
        PREDICTION_MARKER_SIZE: 6
    },

    // 音楽設定
    AUDIO: {
        MAIN_VOLUME: -12,
        BASS_VOLUME: -18,
        DRUM_VOLUME: -12,
        FX_VOLUME: -10,
        REVERB_WET: 0.3,
        DELAY_WET: 0.2
    },

    // UI設定
    UI: {
        MESSAGE_DURATION: 3000,
        MESSAGE_FADE_DURATION: 500
    },

    // 開発者モード設定
    DEVELOPER: {
        ENABLED: true,  // 開発者モードのON/OFF
        BUTTON_SIZE: 40,
        BUTTON_MARGIN: 10,
        DEBUG_LOG_INTERVAL: 1000  // デバッグログの出力間隔（ミリ秒）
    }
};

// パワーアップタイプ設定
const POWERUP_TYPES = {
    penetrate: { color: '#f0f', duration: 1 },
    speed: { color: '#00f', duration: 1 },
    power: { color: '#f00', duration: 1 },
    multishot: { color: '#0f0', duration: 1 },
    homing: { color: '#ff0', duration: 1 },
    predict: { color: '#0ff', duration: 1 }
};

// アイコン設定
const POWERUP_ICONS = {
    penetrate: '→',
    speed: '»',
    power: '◆',
    multishot: '※',
    homing: '◎',
    predict: '◈'
};

// パワーアップメッセージ
const POWERUP_MESSAGES = {
    penetrate: '貫通状態！',
    speed: 'スピードアップ！',
    power: 'パワーアップ！',
    multishot: 'マルチショット！3方向同時射撃！',
    homing: 'ホーミング！自動追尾開始！',
    predict: '軌道予測！弾道が見える！'
};

// アイテム名
const ITEM_NAMES = {
    penetrate: '貫通',
    speed: 'スピード',
    power: 'パワー',
    multishot: 'マルチショット',
    homing: 'ホーミング',
    predict: '軌道予測'
};

// アイテム説明
const ITEM_DESCRIPTIONS = {
    penetrate: '全て貫通',
    speed: '速度1.5倍',
    power: '攻撃力3倍',
    multishot: '3方向射撃',
    homing: '自動追尾',
    predict: '軌道表示'
};

// 音階設定
const SOUND_NOTES = {
    BOUNCE: ['C4', 'D4', 'E4', 'G4', 'A4', 'C5'],
    POWERUP: ['C4', 'E4', 'G4', 'C5', 'E5', 'G5', 'C6'],
    FANFARE: [
        ['C4', 0], ['E4', 100], ['G4', 200], ['C5', 300],
        ['G4', 400], ['C5', 500], ['E5', 600], ['G5', 700],
        ['E5', 800], ['G5', 900], ['C6', 1000]
    ]
};
