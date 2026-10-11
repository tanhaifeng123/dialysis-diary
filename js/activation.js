/**
 * 授权激活（Activation）—— 设备申请码 + 派生激活码
 *
 * 流程：
 * 1. 新设备打开 → 显示该设备的「申请码」（由设备指纹派生，每台设备不同）
 * 2. 使用者把申请码发给管理员
 * 3. 管理员用「发码器」（issuer.html，本地保存）由申请码算出激活码，发给对方
 * 4. 使用者输入激活码 → 验证通过 → 本机永久激活，之后无感进入
 *
 * 安全特性：
 * - 激活码 = SHA256(密钥 + 申请码) 的前 12 位，与设备一一对应
 * - A 的激活码拿到 B 设备上：B 的申请码不同 → 码不匹配 → 拒绝
 * - 源码只存密钥不存码表，无法列举有效码
 *
 * 已知局限（纯前端固有）：
 * - 密钥在源码中可见，懂技术+肯花功夫者可自制发码器（取舍已确认）
 * - 无法远程撤销单个已激活设备；改密钥 = 全部失效重来
 */
var Activation = {
    // 发码密钥：与 issuer.html 中一致。更换即全部激活失效。
    SECRET: 'HF-DIALYSIS-SECRET-2026-X7Q',
    // 主人码：直接进入（主人自己用）
    OWNER_CODE: 'xyyhhtl2026',

    KEYS: {
        DEV_ID: 'act_dev_id',    // 本机唯一随机 ID（首次打开生成，永久保存）
        MY_FP: 'act_my_fp',      // 激活时的申请码快照
        OK: 'act_ok',            // 本机已激活标记
        OWNER_DEV: 'act_owner_dev' // 本机是否被标记为「主人设备」
    },

    inited: false,

    // ===== 工具 =====
    async sha256(str) {
        const buf = new TextEncoder().encode(str);
        const digest = await crypto.subtle.digest('SHA-256', buf);
        return Array.from(new Uint8Array(digest))
            .map(b => b.toString(16).padStart(2, '0')).join('');
    },

    randomHex(len) {
        const arr = new Uint8Array(Math.ceil(len / 2));
        crypto.getRandomValues(arr);
        return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, len);
    },

    format12(hex) {
        const h = hex.slice(0, 12).toUpperCase();
        return h.replace(/(.{4})/g, '$1-').replace(/-$/, '');
    },

    normalize(s) {
        return (s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    },

    lsGet(k, def) {
        try { const v = localStorage.getItem(k); return v === null ? def : JSON.parse(v); }
        catch (e) { return def; }
    },
    lsSet(k, v) {
        try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {}
    },

    // 获取（或首次生成）本机唯一 ID
    ensureDeviceId() {
        let id = this.lsGet(this.KEYS.DEV_ID, '');
        if (!id) {
            id = this.randomHex(32);
            this.lsSet(this.KEYS.DEV_ID, id);
        }
        return id;
    },

    // 环境指纹（辅助，用于检测明显换机）
    async deviceFingerprint() {
        const parts = [
            navigator.userAgent,
            navigator.language,
            screen.width + 'x' + screen.height,
            screen.colorDepth,
            new Date().getTimezoneOffset(),
            navigator.hardwareConcurrency || 0,
            navigator.platform || ''
        ];
        return this.sha256(parts.join('|'));
    },

    // 本机申请码 = hash(设备随机ID + 环境指纹)，每台设备唯一
    async requestCode() {
        const devId = this.ensureDeviceId();
        const fp = await this.deviceFingerprint();
        const h = await this.sha256('REQ|' + devId + '|' + fp);
        return this.format12(h);
    },

    // 由申请码推导出正确的激活码（与 issuer.html 相同算法）
    async deriveCode(reqCode) {
        const norm = this.normalize(reqCode);
        const h = await this.sha256(this.SECRET + '|' + norm);
        return this.format12(h);
    },

    // ===== 初始化 =====
    async init() {
        if (this.inited) return;
        this.inited = true;

        const req = await this.requestCode();
        const savedReq = this.lsGet(this.KEYS.MY_FP, '');

        // 已激活，且申请码未变（设备未换、数据未清）→ 放行
        if (this.lsGet(this.KEYS.OK, false) && savedReq === req) {
            this.unlock();
            return;
        }

        // 未激活或设备已变 → 显示激活界面
        this.showActivate();
    },

    unlock() {
        const ov = document.getElementById('actOverlay');
        if (ov) {
            ov.classList.add('act-hidden');
            setTimeout(() => { ov.style.display = 'none'; }, 300);
        }
        if (typeof App !== 'undefined' && App.init) App.init();
    },

    async showActivate() {
        const ov = document.getElementById('actOverlay');
        if (!ov) return;
        ov.style.display = 'flex';
        ov.classList.remove('act-hidden');

        // 显示本机申请码
        const req = await this.requestCode();
        const el = document.getElementById('actReqCode');
        if (el) el.textContent = req;

        setTimeout(() => {
            const i = document.getElementById('actInput');
            if (i) i.focus();
        }, 200);
    },

    // 复制申请码
    async copyReqCode() {
        const req = await this.requestCode();
        try {
            await navigator.clipboard.writeText(req);
            this.setTip('申请码已复制，去发给管理员吧', false);
        } catch (e) {
            this.setTip('请长按申请码手动复制', true);
        }
    },

    // ===== 提交激活码 =====
    async submit() {
        const inp = document.getElementById('actInput');
        const input = this.normalize(inp ? inp.value : '');

        if (!input) { this.setTip('请输入管理员给你的激活码', true); return; }

        // 主人码直通：同时把这台设备标记为「主人设备」
        if (input === this.normalize(this.OWNER_CODE)) {
            const req0 = await this.requestCode();
            this.ensureDeviceId();
            this.lsSet(this.KEYS.OK, true);
            this.lsSet(this.KEYS.MY_FP, req0);
            this.lsSet(this.KEYS.OWNER_DEV, true);   // 标记为管理员设备
            this.setTip('管理员身份确认，本机已设为管理员设备，正在进入…', false);
            setTimeout(() => this.unlock(), 900);
            return;
        }

        // 校验：激活码应等于 derive(本机申请码)
        const req = await this.requestCode();
        const expected = await this.deriveCode(req);

        if (input !== this.normalize(expected)) {
            this.setTip('激活码与本设备不匹配，请确认申请码是否发对', true);
            this.shake();
            return;
        }

        // 通过 → 永久绑定本机
        this.ensureDeviceId();
        this.lsSet(this.KEYS.OK, true);
        this.lsSet(this.KEYS.MY_FP, req);
        this.setTip('激活成功，正在进入…', false);
        setTimeout(() => this.unlock(), 700);
    },

    setTip(msg, isErr) {
        const tip = document.getElementById('actTip');
        if (!tip) return;
        tip.textContent = msg;
        tip.className = 'act-tip' + (isErr ? ' act-tip-err' : ' act-tip-ok');
    },

    shake() {
        const box = document.getElementById('actBox');
        if (!box) return;
        box.classList.remove('act-shake');
        void box.offsetWidth;
        box.classList.add('act-shake');
    },

    // ===== 重置本机激活状态（保留设备ID，重新激活时申请码不变）=====
    resetLocal() {
        localStorage.removeItem(this.KEYS.OK);
        localStorage.removeItem(this.KEYS.MY_FP);
        location.reload();
    },

    // ===== 事件绑定 =====
    bind() {
        const on = (id, ev, fn) => {
            const el = document.getElementById(id);
            if (el) el.addEventListener(ev, fn);
        };
        on('actSubmit', 'click', () => this.submit());
        on('actInput', 'keydown', e => { if (e.key === 'Enter') this.submit(); });
        on('actCopyReq', 'click', () => this.copyReqCode());
    }
};
