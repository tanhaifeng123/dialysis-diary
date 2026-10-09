/**
 * 访问门禁（Gate）
 * - 密码锁：SHA-256 哈希校验，不存明文
 * - 设备绑定：已授权设备之外，即使知道密码也无法进入（防转发/防私下分享）
 * - 恢复码：首次设置时生成一次，用于换手机时转移授权
 * - 防暴力：连续错误 5 次锁定 5 分钟
 *
 * 定位：纯前端门禁，用于阻止「随手转发链接」和「拿到密码在外人设备上使用」。
 * 透析数据本身存于各人手机 localStorage，服务器无任何数据。
 */
var Gate = {
    // ===== 配置 =====
    CONFIG: {
        // 最多允许绑定的设备数（2 = 你 + 1 位家人；想更严格改成 1）
        MAX_DEVICES: 2,
        // 记住设备的天数
        REMEMBER_DAYS: 30,
        // 连续错误几次后锁定
        MAX_ATTEMPTS: 5,
        // 锁定时长（毫秒）5 分钟
        LOCK_MS: 5 * 60 * 1000
    },

    KEYS: {
        PASS_HASH: 'gate_pass_hash',
        PASS_SALT: 'gate_pass_salt',
        REC_HASH: 'gate_recovery_hash',   // 恢复码哈希
        DEVICES: 'gate_devices',          // 已授权设备指纹列表
        TRUST: 'gate_trust_until',        // 本机免验证到期时间戳
        FAIL: 'gate_fail',                // { count, lockUntil }
        SESSION: 'gate_session_ok'        // 本次会话已验证（刷新不重复弹）
    },

    inited: false,

    // ===== 工具：SHA-256 =====
    async sha256(str) {
        const buf = new TextEncoder().encode(str);
        const digest = await crypto.subtle.digest('SHA-256', buf);
        return Array.from(new Uint8Array(digest))
            .map(b => b.toString(16).padStart(2, '0')).join('');
    },

    randomHex(len) {
        const arr = new Uint8Array(len);
        crypto.getRandomValues(arr);
        return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, len);
    },

    // 格式化恢复码：XXXX-XXXX-XXXX-XXXX
    formatCode(hex) {
        return hex.replace(/(.{4})/g, '$1-').replace(/-$/, '').toUpperCase();
    },
    normalizeCode(s) {
        return (s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').toLowerCase();
    },

    // ===== 设备指纹（基于浏览器/屏幕等稳定特征）=====
    deviceFingerprint() {
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

    // ===== 本地读写 =====
    lsGet(k, def) {
        try { const v = localStorage.getItem(k); return v === null ? def : JSON.parse(v); }
        catch (e) { return def; }
    },
    lsSet(k, v) {
        try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {}
    },

    // ===== 启动入口 =====
    async init() {
        if (this.inited) return;
        this.inited = true;

        // 已在本会话验证过 → 直接放行
        if (sessionStorage.getItem(this.KEYS.SESSION) === '1') {
            this.unlock(false);
            return;
        }

        // 首次使用：还没有密码 → 引导设置密码
        const hash = this.lsGet(this.KEYS.PASS_HASH, null);
        if (!hash) {
            this.showSetup();
            return;
        }

        // 检查是否在本机免验证期内
        const trustUntil = this.lsGet(this.KEYS.TRUST, 0);
        const fp = await this.deviceFingerprint();
        const devices = this.lsGet(this.KEYS.DEVICES, []);

        if (Date.now() < trustUntil && devices.indexOf(fp) !== -1) {
            this.unlock(false);
            return;
        }

        // 需要输密码
        this.showLock();
    },

    // 放行：隐藏门禁、启动工作台
    unlock(remember) {
        sessionStorage.setItem(this.KEYS.SESSION, '1');
        const lock = document.getElementById('gateOverlay');
        if (lock) {
            lock.classList.add('gate-hidden');
            setTimeout(() => { lock.style.display = 'none'; }, 320);
        }
        // 启动主应用
        if (typeof App !== 'undefined' && App.init) {
            App.init();
        }
    },

    // ===== 视图切换 =====
    showBox(name) {
        const lock = document.getElementById('gateOverlay');
        if (!lock) return;
        lock.style.display = 'flex';
        lock.classList.remove('gate-hidden');
        ['gateSetup', 'gateDone', 'gateLock'].forEach(id => {
            document.getElementById(id).classList.toggle('hidden', id !== name);
        });
    },

    showSetup() {
        this.showBox('gateSetup');
    },

    // ===== 首次设置密码 =====
    async submitSetup() {
        const p1 = document.getElementById('gateNewPass').value;
        const p2 = document.getElementById('gateNewPass2').value;
        const tip = document.getElementById('gateSetupTip');
        if (p1.length < 4) { tip.textContent = '密码至少 4 位'; tip.className = 'gate-tip gate-tip-err'; return; }
        if (p1 !== p2) { tip.textContent = '两次输入不一致'; tip.className = 'gate-tip gate-tip-err'; return; }

        const salt = this.randomHex(16);
        const hash = await this.sha256(salt + p1);
        this.lsSet(this.KEYS.PASS_SALT, salt);
        this.lsSet(this.KEYS.PASS_HASH, hash);

        // 生成恢复码（只显示这一次）
        const rec = this.randomHex(32);
        const recHash = await this.sha256(this.normalizeCode(rec));
        this.lsSet(this.KEYS.REC_HASH, recHash);

        // 绑定本机为第 1 台设备
        const fp = await this.deviceFingerprint();
        this.lsSet(this.KEYS.DEVICES, [fp]);
        // 默认本机免验证
        this.lsSet(this.KEYS.TRUST, Date.now() + this.CONFIG.REMEMBER_DAYS * 86400000);

        // 展示恢复码
        document.getElementById('gateRecCode').textContent = this.formatCode(rec);
        this.showBox('gateDone');
    },

    // 「已保存恢复码」按钮 → 进入工作台
    confirmDone() {
        this.unlock(true);
    },

    // ===== 锁屏 =====
    showLock() {
        this.showBox('gateLock');
        // 隐藏恢复区（默认）
        document.getElementById('gateRecovery').classList.add('hidden');
        const st = this.lsGet(this.KEYS.FAIL, { count: 0, lockUntil: 0 });
        this.updateLockUI(st);
        setTimeout(() => {
            const inp = document.getElementById('gatePass');
            if (inp && !inp.disabled) inp.focus();
        }, 200);
    },

    // 仅负责「锁定中」的禁用与倒计时；不再清空错误提示
    updateLockUI(st) {
        const tip = document.getElementById('gateLockTip');
        const btn = document.getElementById('gateSubmit');
        const inp = document.getElementById('gatePass');
        if (!tip) return;
        const now = Date.now();
        if (st.lockUntil && now < st.lockUntil) {
            const sec = Math.ceil((st.lockUntil - now) / 1000);
            tip.textContent = '错误次数过多，请 ' + sec + ' 秒后再试';
            tip.className = 'gate-tip gate-tip-err';
            if (btn) btn.disabled = true;
            if (inp) inp.disabled = true;
            setTimeout(() => {
                const s2 = this.lsGet(this.KEYS.FAIL, { count: 0, lockUntil: 0 });
                this.updateLockUI(s2);
                // 锁定已解除 → 清掉残留的倒计时提示
                if (!(s2.lockUntil && Date.now() < s2.lockUntil)) {
                    tip.textContent = '';
                    tip.className = 'gate-tip';
                }
            }, 1000);
        } else {
            // 未锁定：确保控件可用（不碰错误提示文字）
            if (btn) btn.disabled = false;
            if (inp && inp.disabled) { inp.disabled = false; inp.value = ''; }
        }
    },

    // ===== 校验密码 =====
    async submitLock() {
        const tip = document.getElementById('gateLockTip');
        const st = this.lsGet(this.KEYS.FAIL, { count: 0, lockUntil: 0 });
        if (st.lockUntil && Date.now() < st.lockUntil) { this.updateLockUI(st); return; }

        const inp = document.getElementById('gatePass');
        const pwd = inp ? inp.value : '';
        const salt = this.lsGet(this.KEYS.PASS_SALT, '');
        const hash = this.lsGet(this.KEYS.PASS_HASH, '');
        const inputHash = await this.sha256(salt + pwd);

        if (inputHash === hash) {
            this.lsSet(this.KEYS.FAIL, { count: 0, lockUntil: 0 });

            // 设备绑定校验
            const fp = await this.deviceFingerprint();
            let devices = this.lsGet(this.KEYS.DEVICES, []);
            const idx = devices.indexOf(fp);
            const remember = document.getElementById('gateRemember').checked;

            if (idx === -1) {
                if (devices.length >= this.CONFIG.MAX_DEVICES) {
                    // 达到设备数上限：拒绝，并给出恢复码入口
                    if (tip) {
                        tip.innerHTML = '此密码的授权设备已满，本设备无法使用<br><span style="font-size:12px">换了新手机？点击下方「使用恢复码转移授权」</span>';
                        tip.className = 'gate-tip gate-tip-err';
                    }
                    document.getElementById('gateRecovery').classList.remove('hidden');
                    return;
                }
                devices.push(fp);
                this.lsSet(this.KEYS.DEVICES, devices);
            }

            if (remember) {
                this.lsSet(this.KEYS.TRUST, Date.now() + this.CONFIG.REMEMBER_DAYS * 86400000);
            }
            this.unlock(true);
        } else {
            st.count = (st.count || 0) + 1;
            let locked = false;
            if (st.count >= this.CONFIG.MAX_ATTEMPTS) {
                st.lockUntil = Date.now() + this.CONFIG.LOCK_MS;
                st.count = 0;
                locked = true;
            }
            this.lsSet(this.KEYS.FAIL, st);
            if (tip) {
                tip.textContent = locked ? '错误次数过多，已锁定 5 分钟' : ('密码错误，还可尝试 ' + (this.CONFIG.MAX_ATTEMPTS - st.count) + ' 次');
                tip.className = 'gate-tip gate-tip-err';
            }
            if (inp) { inp.value = ''; inp.focus(); }
            this.updateLockUI(st);
        }
    },

    // ===== 恢复码转移授权 =====
    async submitRecovery() {
        const inp = document.getElementById('gateRecInput');
        const tip = document.getElementById('gateLockTip');
        const code = this.normalizeCode(inp ? inp.value : '');
        const recHash = this.lsGet(this.KEYS.REC_HASH, '');
        if (!recHash) {
            if (tip) { tip.textContent = '未找到恢复码记录'; tip.className = 'gate-tip gate-tip-err'; }
            return;
        }
        const inputHash = await this.sha256(code);
        if (inputHash === recHash) {
            // 重置授权设备 = 仅当前设备，并重置失败计数
            const fp = await this.deviceFingerprint();
            this.lsSet(this.KEYS.DEVICES, [fp]);
            this.lsSet(this.KEYS.FAIL, { count: 0, lockUntil: 0 });
            this.lsSet(this.KEYS.TRUST, Date.now() + this.CONFIG.REMEMBER_DAYS * 86400000);
            this.unlock(true);
        } else {
            if (tip) { tip.textContent = '恢复码不正确'; tip.className = 'gate-tip gate-tip-err'; }
            if (inp) inp.value = '';
        }
    },

    // ===== 绑定事件 =====
    bind() {
        const on = (id, ev, fn) => {
            const el = document.getElementById(id);
            if (el) el.addEventListener(ev, fn);
        };
        on('gateSubmit', 'click', () => this.submitLock());
        on('gateSetupBtn', 'click', () => this.submitSetup());
        on('gateDoneBtn', 'click', () => this.confirmDone());
        on('gateRecBtn', 'click', () => this.submitRecovery());
        on('gatePass', 'keydown', e => { if (e.key === 'Enter') this.submitLock(); });
        on('gateNewPass2', 'keydown', e => { if (e.key === 'Enter') this.submitSetup(); });
        on('gateRecInput', 'keydown', e => { if (e.key === 'Enter') this.submitRecovery(); });
    },

    // ===== 以下方法在已授权设备的控制台调用 =====

    // 修改密码：Gate.changePassword('新密码')
    async changePassword(newPwd) {
        const salt = this.randomHex(16);
        const hash = await this.sha256(salt + newPwd);
        this.lsSet(this.KEYS.PASS_SALT, salt);
        this.lsSet(this.KEYS.PASS_HASH, hash);
        console.log('密码已更新');
    },

    // 重置授权设备（仅保留本机）：Gate.resetDevices()
    async resetDevices() {
        const fp = await this.deviceFingerprint();
        this.lsSet(this.KEYS.DEVICES, [fp]);
        console.log('已重置授权设备，仅保留本机');
    }
};
