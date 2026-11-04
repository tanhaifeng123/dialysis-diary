// ========== 化验指标模块（血红蛋白/白蛋白/电解质/PTH） ==========

var MetricsManager = {
    STORAGE_KEY: 'dialysis_metrics',
    records: [],
    editingId: null,

    // 指标定义：key=存储字段名，min/max=透析患者目标范围（null 表示无该侧边界）
    METRIC_DEFS: [
        { key: 'hb',   name: '血红蛋白', short: 'Hb',   unit: 'g/L',    min: 110,  max: 130 },
        { key: 'alb',  name: '白蛋白',  short: 'Alb',  unit: 'g/L',    min: 40,   max: null },
        { key: 'k',    name: '血钾',    short: 'K',    unit: 'mmol/L', min: 3.5,  max: 5.3 },
        { key: 'na',   name: '血钠',    short: 'Na',   unit: 'mmol/L', min: 135,  max: 145 },
        { key: 'ca',   name: '血钙',    short: 'Ca',   unit: 'mmol/L', min: 2.1,  max: 2.5 },
        { key: 'p',    name: '血磷',    short: 'P',    unit: 'mmol/L', min: 1.13, max: 1.78 },
        { key: 'pth',  name: '甲状旁腺激素', short: 'PTH', unit: 'pg/mL', min: 150, max: 300 }
    ],

    // 初始化
    init() {
        this.load();
        this.setDefaultDate();
        this.render();
        this.bindEvents();
        this.bindDecimalLimit();
        this.initKtv();
    },

    // 展开表单区
    expandForm() {
        var card = document.getElementById('metricFormCard');
        var body = document.getElementById('metricFormBody');
        var icon = document.getElementById('metricFormIcon');
        if (card) card.classList.remove('collapsed');
        if (body) body.style.display = 'block';
        if (icon) icon.textContent = '▼';
    },

    // 收起表单区
    collapseForm() {
        var card = document.getElementById('metricFormCard');
        var body = document.getElementById('metricFormBody');
        var icon = document.getElementById('metricFormIcon');
        if (card) card.classList.add('collapsed');
        if (body) body.style.display = 'none';
        if (icon) icon.textContent = '▶';
    },

    // 展开/收起切换
    toggleForm() {
        var body = document.getElementById('metricFormBody');
        if (!body) return;
        if (body.style.display === 'none') {
            this.expandForm();
        } else {
            this.collapseForm();
        }
    },

    // 从 localStorage 加载
    load() {
        const data = localStorage.getItem(this.STORAGE_KEY);
        this.records = data ? JSON.parse(data) : [];
    },

    // 保存到 localStorage
    save() {
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.records));
    },

    // 默认日期为今天
    setDefaultDate() {
        var now = new Date();
        var m = (now.getMonth() + 1).toString();
        if (m.length < 2) m = '0' + m;
        var d = now.getDate().toString();
        if (d.length < 2) d = '0' + d;
        document.getElementById('metricDate').value = now.getFullYear() + '-' + m + '-' + d;
    },

    // 绑定表单事件
    bindEvents() {
        var self = this;
        document.getElementById('metricForm').addEventListener('submit', function(e) {
            e.preventDefault();
            self.saveMetric();
        });
        var cancelBtn = document.getElementById('cancelMetricEditBtn');
        if (cancelBtn) {
            cancelBtn.addEventListener('click', function() {
                self.cancelEdit();
            });
        }
    },

    // 保留两位小数（四舍五入）
    round2(v) {
        if (v === null || v === undefined || isNaN(v)) return null;
        return Math.round(v * 100) / 100;
    },

    // 收集表单中的指标值（空 = null，统一保留两位小数）
    collectMetrics() {
        var self = this;
        var data = {};
        this.METRIC_DEFS.forEach(function(def) {
            var raw = document.getElementById('metric_' + def.key).value;
            var v = parseFloat(raw);
            data[def.key] = (raw !== '' && !isNaN(v)) ? self.round2(v) : null;
        });
        return data;
    },

    // 保存（新增或更新）
    saveMetric() {
        var self = this;
        var metrics = this.collectMetrics();

        // 至少填写一项指标
        var hasAny = this.METRIC_DEFS.some(function(def) { return metrics[def.key] !== null; });
        if (!hasAny) {
            App.showToast('请至少填写一项指标数值');
            return;
        }

        var date = document.getElementById('metricDate').value;
        if (!date) {
            App.showToast('请选择检查日期');
            return;
        }

        if (this.editingId) {
            // 更新
            var record = this.records.find(function(r) { return r.id === self.editingId; });
            if (record) {
                record.date = date;
                this.METRIC_DEFS.forEach(function(def) {
                    record[def.key] = metrics[def.key];
                });
                this.save();
                App.showToast('指标已更新');
            }
            this.cancelEdit();
        } else {
            // 新增
            var newRecord = {
                id: Date.now().toString(),
                date: date
            };
            this.METRIC_DEFS.forEach(function(def) {
                newRecord[def.key] = metrics[def.key];
            });
            this.records.push(newRecord);
            this.save();
            App.showToast('检查指标已保存');
        }

        this.clearForm();
        this.setDefaultDate();
        this.render();
        // 保存后收起表单，让表格回到视野
        this.collapseForm();
    },

    // 编辑：回填表单
    edit(id) {
        var self = this;
        var record = this.records.find(function(r) { return r.id === id; });
        if (!record) return;

        this.editingId = id;
        document.getElementById('metricDate').value = record.date;
        this.METRIC_DEFS.forEach(function(def) {
            document.getElementById('metric_' + def.key).value =
                (record[def.key] !== null && record[def.key] !== undefined) ? record[def.key] : '';
        });

        document.getElementById('metricFormTitle').innerHTML =
            '<span class="metric-toggle-icon" id="metricFormIcon">▼</span>编辑检查指标';
        document.getElementById('cancelMetricEditBtn').classList.remove('hidden');

        // 编辑时自动展开表单
        this.expandForm();

        // 滚动到表单
        var card = document.getElementById('metricFormCard');
        if (card && card.scrollIntoView) {
            card.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    },

    // 删除
    remove(id) {
        var self = this;
        if (!confirm('确定删除这条检查记录吗？')) return;
        this.records = this.records.filter(function(r) { return r.id !== id; });
        this.save();
        this.render();
        App.showToast('记录已删除');
    },

    // 取消编辑
    cancelEdit() {
        this.editingId = null;
        this.clearForm();
        this.setDefaultDate();
        document.getElementById('metricFormTitle').innerHTML =
            '<span class="metric-toggle-icon" id="metricFormIcon">▶</span>记录检查指标' +
            '<small class="metric-toggle-tip">点击展开录入</small>';
        document.getElementById('cancelMetricEditBtn').classList.add('hidden');
        this.collapseForm();
    },

    // 清空表单
    clearForm() {
        this.METRIC_DEFS.forEach(function(def) {
            document.getElementById('metric_' + def.key).value = '';
        });
    },

    // 按日期倒序排列（同日按保存时间倒序）
    sortedRecords() {
        return this.records.slice().sort(function(a, b) {
            if (a.date !== b.date) return a.date < b.date ? 1 : -1;
            return parseInt(b.id, 10) - parseInt(a.id, 10);
        });
    },

    // 判断指标状态：'high' 偏高 | 'low' 偏低 | null 正常
    metricStatus(def, value) {
        if (value === null || value === undefined) return null;
        if (def.max !== null && value > def.max) return 'high';
        if (def.min !== null && value < def.min) return 'low';
        return null;
    },

    // 数值格式化（整数不带小数，小数最多2位）
    fmtVal(v) {
        if (v === null || v === undefined) return '—';
        return (Math.round(v * 100) / 100).toString();
    },

    // 输入框实时限制：最多两位小数
    bindDecimalLimit() {
        this.METRIC_DEFS.forEach(function(def) {
            var el = document.getElementById('metric_' + def.key);
            if (!el) return;
            el.addEventListener('input', function() {
                var val = el.value;
                if (val === '' || val === '-') return;
                // 只保留数字和一个小数点，小数位超过两位则截断
                var m = val.match(/^(\d*)(?:\.(\d*))?$/);
                if (!m) {
                    el.value = val.replace(/[^\d.]/g, '');
                    return;
                }
                var intPart = m[1] || '0';
                if (m[2] !== undefined && m[2].length > 2) {
                    el.value = intPart + '.' + m[2].slice(0, 2);
                }
            });
        });
    },

    // 日期显示：同年只显示月-日，跨年显示完整
    fmtDate(dateStr) {
        var thisYear = new Date().getFullYear();
        if (dateStr.indexOf(String(thisYear)) === 0) {
            return dateStr.slice(5).replace('-', '/');
        }
        return dateStr.replace(/-/g, '/');
    },

    // 参考范围文本
    rangeText(def) {
        if (def.min !== null && def.max !== null) return def.min + '-' + def.max;
        if (def.min !== null) return '≥' + def.min;
        if (def.max !== null) return '≤' + def.max;
        return '';
    },

    // ============================================================
    // ============ 透析充分性计算（spKt/V / URR） ============
    // ============================================================
    KTV_KEY: 'dialysis_ktv_records',
    ktvRecords: [],

    // 初始化 Kt/V 计算器
    initKtv() {
        this.loadKtv();
        this.bindKtvEvents();
        this.fillKtvRecordOptions();
        this.renderKtvHistory();
        this.renderKtv();
    },

    loadKtv() {
        try {
            var d = localStorage.getItem(this.KTV_KEY);
            this.ktvRecords = d ? JSON.parse(d) : [];
        } catch (e) {
            this.ktvRecords = [];
        }
    },

    saveKtv() {
        localStorage.setItem(this.KTV_KEY, JSON.stringify(this.ktvRecords));
    },

    bindKtvEvents() {
        var self = this;
        var ids = ['ktv_bunPre', 'ktv_bunPost', 'ktv_ufVol', 'ktv_duration',
                   'ktv_preWeight', 'ktv_postWeight', 'ktv_age', 'ktv_sex',
                   'ktv_height', 'ktv_v'];
        ids.forEach(function(id) {
            var el = document.getElementById(id);
            if (!el) return;
            el.addEventListener('input', function() { self.renderKtv(); });
            el.addEventListener('change', function() { self.renderKtv(); });
        });
        // 超滤量/体重变化时，自动推算透后体重
        ['ktv_ufVol', 'ktv_preWeight'].forEach(function(id) {
            var el = document.getElementById(id);
            if (!el) return;
            el.addEventListener('input', function() { self.syncPostWeight(); });
        });
        var form = document.getElementById('ktvSaveForm');
        if (form) {
            form.addEventListener('submit', function(e) {
                e.preventDefault();
                self.saveKtvResult();
            });
        }
    },

    // 用超滤量与透前体重自动填透后体重（用户手填过则不覆盖）
    syncPostWeight() {
        var preEl = document.getElementById('ktv_preWeight');
        var ufEl = document.getElementById('ktv_ufVol');
        var postEl = document.getElementById('ktv_postWeight');
        if (!preEl || !ufEl || !postEl) return;
        if (postEl.dataset.manual === '1') return;
        var pre = parseFloat(preEl.value);
        var uf = parseFloat(ufEl.value);
        if (!isNaN(pre) && !isNaN(uf) && uf >= 0) {
            postEl.value = (Math.round((pre - uf / 1000) * 10) / 10).toFixed(1);
        }
    },

    // 展开/收起计算器
    toggleKtv() {
        var body = document.getElementById('ktvBody');
        var card = document.getElementById('ktvCard');
        var icon = document.getElementById('ktvIcon');
        if (!body) return;
        if (body.style.display === 'none') {
            body.style.display = 'block';
            if (card) card.classList.remove('collapsed');
            if (icon) icon.textContent = '▼';
            this.fillKtvRecordOptions();
        } else {
            body.style.display = 'none';
            if (card) card.classList.add('collapsed');
            if (icon) icon.textContent = '▶';
        }
    },

    toggleKtvAdvanced() {
        var body = document.getElementById('ktvAdvBody');
        var icon = document.getElementById('ktvAdvIcon');
        if (!body) return;
        var open = body.style.display === 'none';
        body.style.display = open ? 'grid' : 'none';
        if (icon) icon.textContent = open ? '▼' : '▶';
    },

    // 拉取透析记录，填充下拉框
    fillKtvRecordOptions() {
        var sel = document.getElementById('ktvRecordSelect');
        if (!sel) return;
        var list = [];
        try {
            var raw = localStorage.getItem('dialysis_records');
            list = raw ? JSON.parse(raw) : [];
        } catch (e) {
            list = [];
        }
        if (!list.length) {
            sel.innerHTML = '<option value="">暂无透析记录可导入</option>';
            return;
        }
        list = list.slice().sort(function(a, b) {
            if (a.date !== b.date) return a.date < b.date ? 1 : -1;
            return (b.id || 0) - (a.id || 0);
        });
        var html = '<option value="">选择一条透析记录自动带入</option>';
        list.forEach(function(r) {
            var parts = [];
            if (r.preWeight) parts.push('透前' + r.preWeight + 'kg');
            if (r.postWeight) parts.push('透后' + r.postWeight + 'kg');
            if (r.duration) parts.push(r.duration + 'h');
            html += '<option value="' + r.id + '">' + r.date +
                (parts.length ? '（' + parts.join('，') + '）' : '') + '</option>';
        });
        sel.innerHTML = html;
    },

    // 从透析记录带入体重/超滤/时长
    importFromRecord() {
        var sel = document.getElementById('ktvRecordSelect');
        if (!sel || !sel.value) {
            App.showToast('请先选择一条透析记录');
            return;
        }
        var list = [];
        try {
            list = JSON.parse(localStorage.getItem('dialysis_records') || '[]');
        } catch (e) {
            list = [];
        }
        var r = list.find(function(x) { return String(x.id) === String(sel.value); });
        if (!r) {
            App.showToast('记录不存在');
            return;
        }
        var preEl = document.getElementById('ktv_preWeight');
        var postEl = document.getElementById('ktv_postWeight');
        var durEl = document.getElementById('ktv_duration');
        var ufEl = document.getElementById('ktv_ufVol');

        if (r.preWeight) preEl.value = r.preWeight;
        if (r.duration) durEl.value = r.duration;
        if (r.postWeight) {
            postEl.value = r.postWeight;
            postEl.dataset.manual = '1';
        } else {
            delete postEl.dataset.manual;
        }
        // 超滤量：优先取记录值，否则用 透前-透后 推算
        var ufKg = (r.ultrafiltration !== undefined && r.ultrafiltration !== null)
            ? r.ultrafiltration
            : (r.preWeight && r.postWeight ? (r.preWeight - r.postWeight) : null);
        if (ufKg !== null && ufKg !== undefined) {
            ufEl.value = Math.round(ufKg * 1000);
        }
        if (!r.postWeight) this.syncPostWeight();

        this.renderKtv();
        App.showToast('已带入 ' + r.date + ' 的数据');
    },

    // 读取数值
    ktvNum(id) {
        var el = document.getElementById(id);
        if (!el) return null;
        var v = parseFloat(el.value);
        return (el.value !== '' && !isNaN(v)) ? v : null;
    },

    // 尿素分布容积 V（L）：优先手填，其次 Watson 公式，最后 体重×0.58
    estimateV(preWeight, postWeight) {
        var manual = this.ktvNum('ktv_v');
        if (manual && manual > 0) return { v: manual, src: '手填' };
        var age = this.ktvNum('ktv_age');
        var height = this.ktvNum('ktv_height');
        var sexEl = document.getElementById('ktv_sex');
        var sex = sexEl ? sexEl.value : 'male';
        // 用透后（干）体重估算，更接近真实瘦体重
        var w = postWeight || preWeight;
        if (w && age && height) {
            var v;
            if (sex === 'male') {
                v = 2.447 - 0.09516 * age + 0.1074 * height + 0.3362 * w;
            } else {
                v = -2.097 + 0.1069 * height + 0.2466 * w;
            }
            return { v: Math.round(v * 10) / 10, src: 'Watson 公式' };
        }
        if (w) return { v: Math.round(w * 0.58 * 10) / 10, src: '体重×0.58' };
        return { v: null, src: '' };
    },

    // Daugirdas 第二版 spKt/V
    calcKtv() {
        var bunPre = this.ktvNum('ktv_bunPre');
        var bunPost = this.ktvNum('ktv_bunPost');
        var uf = this.ktvNum('ktv_ufVol');       // mL
        var dur = this.ktvNum('ktv_duration');   // h
        var preW = this.ktvNum('ktv_preWeight');
        var postW = this.ktvNum('ktv_postWeight');

        if (!bunPre || !bunPost || bunPre <= 0 || bunPost <= 0 || bunPost >= bunPre) return null;
        if (!dur || dur <= 0) return null;

        var R = bunPost / bunPre;
        var t = dur;
        // 超滤量与体重：单位 kg
        var ufKg = (uf !== null && uf >= 0) ? uf / 1000 : 0;
        var wKg = postW || (preW ? preW - ufKg : null);
        if (!wKg || wKg <= 0) return null;

        var inner = R - 0.008 * t;
        if (inner <= 0.001) inner = 0.001;
        var ktv = -Math.log(inner) + (4 - 3.5 * R) * (ufKg / wKg);

        var vInfo = this.estimateV(preW || wKg, wKg);
        // 清除率 K（mL/min）——用于了解实际透析器效能，K = Kt/V × V / t(秒) × 1000 /  60
        var clearance = null;
        if (vInfo.v) {
            clearance = ktv * vInfo.v * 1000 / (t * 60);
        }

        return {
            R: R,
            ktv: Math.round(ktv * 100) / 100,
            urr: Math.round((1 - R) * 1000) / 10,
            ufKg: Math.round(ufKg * 100) / 100,
            weight: Math.round(wKg * 10) / 10,
            V: vInfo.v,
            Vsrc: vInfo.src,
            clearance: clearance ? Math.round(clearance) : null,
            bunPre: bunPre,
            bunPost: bunPost,
            duration: t
        };
    },

    // 渲染计算结果
    renderKtv() {
        var box = document.getElementById('ktvResult');
        if (!box) return;
        var r = this.calcKtv();

        if (!r) {
            box.innerHTML = '<div class="ktv-result-empty">录入透前/透后 BUN 与治疗时长后自动计算</div>';
            var sf0 = document.getElementById('ktvSaveForm');
            if (sf0) sf0.classList.add('hidden');
            return;
        }

        // Kt/V 判定（KDOQI：单次 spKt/V ≥1.2 达标；1.4 为更优目标）
        var ktvCls, ktvTxt;
        if (r.ktv >= 1.4) { ktvCls = 'good'; ktvTxt = '充分（优于目标）'; }
        else if (r.ktv >= 1.2) { ktvCls = 'good'; ktvTxt = '达标'; }
        else if (r.ktv >= 1.0) { ktvCls = 'warn'; ktvTxt = '偏低，需加强'; }
        else { ktvCls = 'bad'; ktvTxt = '不足，请告知医生'; }

        // URR 判定（≥65% 达标）
        var urrCls, urrTxt;
        if (r.urr >= 70) { urrCls = 'good'; urrTxt = '达标'; }
        else if (r.urr >= 65) { urrCls = 'good'; urrTxt = '达标'; }
        else if (r.urr >= 55) { urrCls = 'warn'; urrTxt = '偏低'; }
        else { urrCls = 'bad'; urrTxt = '不足'; }

        var html = '';
        html += '<div class="ktv-main">';
        html += '  <div class="ktv-main-item ' + ktvCls + '">';
        html += '    <div class="ktv-main-label">Kt/V（spKt/V）</div>';
        html += '    <div class="ktv-main-value">' + r.ktv.toFixed(2) + '</div>';
        html += '    <div class="ktv-main-tag">' + ktvTxt + ' · 目标 ≥1.20</div>';
        html += '  </div>';
        html += '  <div class="ktv-main-item ' + urrCls + '">';
        html += '    <div class="ktv-main-label">尿素清除率 URR</div>';
        html += '    <div class="ktv-main-value">' + r.urr.toFixed(1) + '<small>%</small></div>';
        html += '    <div class="ktv-main-tag">' + urrTxt + ' · 目标 ≥65%</div>';
        html += '  </div>';
        html += '</div>';

        html += '<div class="ktv-detail">';
        html += '<div class="ktv-detail-row"><span>透前 / 透后 BUN</span><b>' +
            r.bunPre + ' / ' + r.bunPost + ' mmol/L</b></div>';
        html += '<div class="ktv-detail-row"><span>BUN 下降比值 R</span><b>' + r.R.toFixed(3) + '</b></div>';
        html += '<div class="ktv-detail-row"><span>超滤量 / 体重 W</span><b>' +
            r.ufKg.toFixed(2) + ' L / ' + r.weight.toFixed(1) + ' kg</b></div>';
        html += '<div class="ktv-detail-row"><span>治疗时长 t</span><b>' + r.duration + ' h</b></div>';
        if (r.V) {
            html += '<div class="ktv-detail-row"><span>尿素分布容积 V（' + r.Vsrc + '）</span><b>' + r.V + ' L</b></div>';
        }
        if (r.clearance) {
            html += '<div class="ktv-detail-row"><span>等效尿素清除率 K</span><b>' + r.clearance + ' mL/min</b></div>';
        }
        html += '</div>';

        // 提示语
        var tips = [];
        if (r.ktv < 1.2) tips.push('单次 Kt/V 未达 1.2，可能与透析时间不足、血流量偏低、透析器面积小或血管通路再循环有关，建议与医生沟通。');
        if (r.ktv >= 1.2 && r.duration < 3.5) tips.push('本次时长 ' + r.duration + ' 小时即达标，说明清除效率好；仍建议按医嘱保证每周总治疗时间。');
        if (r.urr < 65) tips.push('URR 低于 65%，说明小分子毒素清除不够，可参考 Kt/V 一起评估。');
        if (tips.length) {
            html += '<div class="ktv-tips">' + tips.map(function(t) {
                return '<p>💡 ' + t + '</p>';
            }).join('') + '</div>';
        }

        box.innerHTML = html;

        var sf = document.getElementById('ktvSaveForm');
        if (sf) {
            sf.classList.remove('hidden');
            var dEl = document.getElementById('ktvSaveDate');
            if (dEl && !dEl.value) {
                var now = new Date();
                dEl.value = now.getFullYear() + '-' +
                    String(now.getMonth() + 1).padStart(2, '0') + '-' +
                    String(now.getDate()).padStart(2, '0');
            }
        }
        this.lastKtv = r;
    },

    // 保存本次计算结果到历史
    saveKtvResult() {
        var r = this.lastKtv || this.calcKtv();
        if (!r) {
            App.showToast('请先完成计算');
            return;
        }
        var dateEl = document.getElementById('ktvSaveDate');
        var date = dateEl ? dateEl.value : '';
        if (!date) {
            App.showToast('请选择日期');
            return;
        }
        var rec = {
            id: Date.now().toString(),
            date: date,
            ktv: r.ktv,
            urr: r.urr,
            bunPre: r.bunPre,
            bunPost: r.bunPost,
            uf: r.ufKg,
            weight: r.weight,
            duration: r.duration
        };
        // 同一天只保留最新一条
        this.ktvRecords = this.ktvRecords.filter(function(x) { return x.date !== date; });
        this.ktvRecords.push(rec);
        this.ktvRecords.sort(function(a, b) { return a.date < b.date ? 1 : -1; });
        this.saveKtv();
        App.showToast('Kt/V 结果已保存');
        this.renderKtvHistory();
    },

    removeKtvRecord(id) {
        if (!confirm('确定删除这条 Kt/V 记录吗？')) return;
        this.ktvRecords = this.ktvRecords.filter(function(x) { return x.id !== id; });
        this.saveKtv();
        this.renderKtvHistory();
        App.showToast('已删除');
    },

    // Kt/V 历史（暂并入指标表格下方，简单列表）
    renderKtvHistory() {
        var el = document.getElementById('ktvHistory');
        if (!el) return;
        if (!this.ktvRecords.length) {
            el.innerHTML = '';
            return;
        }
        var html = '<div class="ktv-history-title">历史 Kt/V 记录</div>';
        this.ktvRecords.forEach(function(r) {
            var cls = r.ktv >= 1.2 ? 'good' : 'bad';
            html += '<div class="ktv-history-row">' +
                '<span>' + r.date + '</span>' +
                '<b class="' + cls + '">Kt/V ' + r.ktv.toFixed(2) + '</b>' +
                '<span>URR ' + r.urr.toFixed(1) + '%</span>' +
                '<button type="button" class="metric-op-btn" onclick="MetricsManager.removeKtvRecord(\'' + r.id + '\')" aria-label="删除">🗑️</button>' +
                '</div>';
        });
        el.innerHTML = html;
    },

    // 渲染表格
    render() {        var self = this;
        var tbody = document.querySelector('#metricTable tbody');
        var thead = document.querySelector('#metricTable thead');
        var countEl = document.getElementById('metricCount');
        if (!tbody || !thead) return;

        var records = this.sortedRecords();
        if (countEl) countEl.textContent = records.length + ' 条';

        // 表头：英文缩写 + 下方中文名（小字）+ 目标范围
        var html = '<tr><th class="metric-date-col">日期</th>';
        this.METRIC_DEFS.forEach(function(def) {
            html += '<th>' + def.short +
                '<small class="metric-th-cn">' + def.name + '</small>' +
                '<small>' + self.rangeText(def) + ' ' + def.unit + '</small></th>';
        });
        html += '<th>操作</th></tr>';
        thead.innerHTML = html;

        if (records.length === 0) {
            tbody.innerHTML = '<tr><td colspan="9" class="metric-empty">暂无检查记录，复查后在上方录入即可跟踪变化</td></tr>';
            return;
        }

        html = '';
        records.forEach(function(r, i) {
            var prev = (i + 1 < records.length) ? records[i + 1] : null; // 上一条（更早）
            html += '<tr>';
            html += '<td class="metric-date-col">' + self.fmtDate(r.date) + '</td>';
            self.METRIC_DEFS.forEach(function(def) {
                var v = r[def.key];
                var status = self.metricStatus(def, v);
                var cls = status === 'high' ? ' val-high' : (status === 'low' ? ' val-low' : '');
                var txt = self.fmtVal(v);
                // 与上次检查对比的趋势箭头
                if (prev && v !== null && prev[def.key] !== null && prev[def.key] !== undefined) {
                    if (v > prev[def.key]) txt += '<span class="metric-trend up">↑</span>';
                    else if (v < prev[def.key]) txt += '<span class="metric-trend down">↓</span>';
                }
                html += '<td class="metric-val' + cls + '">' + txt + '</td>';
            });
            html += '<td class="metric-op">' +
                '<button type="button" class="metric-op-btn" onclick="MetricsManager.edit(\'' + r.id + '\')" aria-label="编辑">✏️</button>' +
                '<button type="button" class="metric-op-btn" onclick="MetricsManager.remove(\'' + r.id + '\')" aria-label="删除">🗑️</button>' +
                '</td>';
            html += '</tr>';
        });
        tbody.innerHTML = html;
    }
};
