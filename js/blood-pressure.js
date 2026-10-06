// ========== 血压记录模块 ==========

var BpManager = {
    STORAGE_KEY: 'dialysis_bp',
    records: [],
    editingId: null,
    chart: null,

    // 血压分级（依据中国高血压防治指南 / 透析患者常用参考）
    // sys=收缩压 mmHg, dia=舒张压 mmHg
    LEVELS: [
        { key: 'low',    name: '偏低',   cls: 'bp-low',    tip: '血压偏低，如有头晕乏力请告知医生' },
        { key: 'normal', name: '正常',   cls: 'bp-normal', tip: '血压在正常范围' },
        { key: 'high1',  name: '偏高',   cls: 'bp-high1',  tip: '血压偏高，注意控盐控水' },
        { key: 'high2',  name: '较高',   cls: 'bp-high2',  tip: '血压明显偏高，建议咨询医生' },
        { key: 'high3',  name: '很高',   cls: 'bp-high3',  tip: '血压过高，请尽快联系医生' }
    ],

    // 初始化
    init() {
        this.load();
        this.setDefaultDateTime();
        this.render();
        this.bindEvents();
    },

    // ===== 数据读写 =====
    load() {
        var data = localStorage.getItem(this.STORAGE_KEY);
        this.records = data ? JSON.parse(data) : [];
    },

    save() {
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.records));
    },

    // 默认日期时间为当前（本地时间，精确到分钟）
    defaultDateTime() {
        var d = new Date();
        var p = function(n) { return n < 10 ? '0' + n : '' + n; };
        return {
            date: d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()),
            time: p(d.getHours()) + ':' + p(d.getMinutes())
        };
    },

    setDefaultDateTime() {
        var dt = this.defaultDateTime();
        var dateEl = document.getElementById('bpDate');
        var timeEl = document.getElementById('bpTime');
        if (dateEl) dateEl.value = dt.date;
        if (timeEl) timeEl.value = dt.time;
    },

    todayStr() {
        return this.defaultDateTime().date;
    },

    // ===== 表单展开/收起 =====
    expandForm() {
        var card = document.getElementById('bpFormCard');
        var body = document.getElementById('bpFormBody');
        var icon = document.getElementById('bpFormIcon');
        if (card) card.classList.remove('collapsed');
        if (body) body.style.display = 'block';
        if (icon) icon.textContent = '▼';
    },

    collapseForm() {
        var card = document.getElementById('bpFormCard');
        var body = document.getElementById('bpFormBody');
        var icon = document.getElementById('bpFormIcon');
        if (card) card.classList.add('collapsed');
        if (body) body.style.display = 'none';
        if (icon) icon.textContent = '▶';
    },

    toggleForm() {
        var body = document.getElementById('bpFormBody');
        if (!body) return;
        if (body.style.display === 'none') this.expandForm();
        else this.collapseForm();
    },

    bindEvents() {
        var self = this;
        var form = document.getElementById('bpForm');
        if (form) {
            form.addEventListener('submit', function(e) {
                e.preventDefault();
                self.saveRecord();
            });
        }
        var cancelBtn = document.getElementById('cancelBpEditBtn');
        if (cancelBtn) {
            cancelBtn.addEventListener('click', function() { self.cancelEdit(); });
        }
    },

    // ===== 分级判定 =====
    // 依据：中国高血压防治指南（收缩压/舒张压取较高分级）
    levelOf(sys, dia) {
        if (sys === null || dia === null || sys === undefined || dia === undefined) return null;
        // 偏低
        if (sys < 90 || dia < 60) return this.LEVELS[0];
        // 很高
        if (sys >= 180 || dia >= 110) return this.LEVELS[4];
        // 较高
        if (sys >= 160 || dia >= 100) return this.LEVELS[3];
        // 偏高
        if (sys >= 140 || dia >= 90) return this.LEVELS[2];
        // 正常（<140/90 且 >=90/60）
        return this.LEVELS[1];
    },

    // ===== 保存（新增/更新） =====
    saveRecord() {
        var self = this;
        var sys = parseInt(document.getElementById('bpSys').value, 10);
        var dia = parseInt(document.getElementById('bpDia').value, 10);
        var pulseRaw = document.getElementById('bpPulse').value;
        var pulse = pulseRaw === '' ? null : parseInt(pulseRaw, 10);
        var date = document.getElementById('bpDate').value;
        var time = document.getElementById('bpTime').value;

        if (!sys || !dia) {
            App.showToast('请填写收缩压和舒张压');
            return;
        }
        if (sys < 40 || sys > 300 || dia < 20 || dia > 200) {
            App.showToast('数值超出合理范围，请检查');
            return;
        }
        if (sys <= dia) {
            App.showToast('收缩压应大于舒张压');
            return;
        }
        if (!date) {
            App.showToast('请选择日期');
            return;
        }
        if (pulse !== null && (pulse < 20 || pulse > 250)) {
            App.showToast('脉搏数值超出合理范围');
            return;
        }

        if (this.editingId) {
            var rec = this.records.find(function(r) { return r.id === self.editingId; });
            if (rec) {
                rec.sys = sys; rec.dia = dia; rec.pulse = pulse;
                rec.date = date; rec.time = time || '';
                this.save();
                App.showToast('血压记录已更新');
            }
            this.cancelEdit();
        } else {
            this.records.push({
                id: 'bp' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
                sys: sys, dia: dia, pulse: pulse,
                date: date, time: time || '',
                createdAt: new Date().toISOString()
            });
            this.save();
            App.showToast('血压已记录');
        }

        this.clearForm();
        this.setDefaultDateTime();
        this.render();
        this.collapseForm();
    },

    // 编辑：回填表单
    edit(id) {
        var record = this.records.find(function(r) { return r.id === id; });
        if (!record) return;
        this.editingId = id;
        document.getElementById('bpSys').value = record.sys;
        document.getElementById('bpDia').value = record.dia;
        document.getElementById('bpPulse').value = (record.pulse !== null && record.pulse !== undefined) ? record.pulse : '';
        document.getElementById('bpDate').value = record.date;
        document.getElementById('bpTime').value = record.time || '';

        document.getElementById('bpFormTitle').innerHTML =
            '<span class="metric-toggle-icon" id="bpFormIcon">▼</span>修改血压记录';
        document.getElementById('cancelBpEditBtn').classList.remove('hidden');
        this.expandForm();
        var card = document.getElementById('bpFormCard');
        if (card && card.scrollIntoView) card.scrollIntoView({ behavior: 'smooth', block: 'start' });
    },

    cancelEdit() {
        this.editingId = null;
        this.clearForm();
        this.setDefaultDateTime();
        document.getElementById('bpFormTitle').innerHTML =
            '<span class="metric-toggle-icon" id="bpFormIcon">▶</span>记录血压' +
            '<small class="metric-toggle-tip">点击展开录入</small>';
        document.getElementById('cancelBpEditBtn').classList.add('hidden');
        this.collapseForm();
    },

    clearForm() {
        ['bpSys', 'bpDia', 'bpPulse'].forEach(function(id) {
            var el = document.getElementById(id);
            if (el) el.value = '';
        });
    },

    remove(id) {
        var self = this;
        if (!confirm('确定删除这条血压记录吗？')) return;
        this.records = this.records.filter(function(r) { return r.id !== id; });
        this.save();
        this.render();
        App.showToast('记录已删除');
    },

    // ===== 排序：日期+时间倒序 =====
    sortedRecords() {
        return this.records.slice().sort(function(a, b) {
            var ka = (a.date || '') + ' ' + (a.time || '');
            var kb = (b.date || '') + ' ' + (b.time || '');
            if (ka !== kb) return ka < kb ? 1 : -1;
            return 0;
        });
    },

    // 日期显示
    fmtDate(dateStr) {
        var thisYear = new Date().getFullYear();
        if (dateStr.indexOf(String(thisYear)) === 0) return dateStr.slice(5).replace('-', '月') + '日';
        return dateStr.replace(/-/g, '/');
    },

    isToday(dateStr) {
        return dateStr === this.todayStr();
    },

    // ===== 渲染 =====
    render() {
        this.renderSummary();
        this.renderList();
        this.renderChart();
    },

    // 摘要：最近一次 + 近7天平均
    renderSummary() {
        var box = document.getElementById('bpSummary');
        if (!box) return;
        var records = this.sortedRecords();
        if (records.length === 0) {
            box.innerHTML = '<p class="bp-empty-summary">还没有血压记录，点上方「记录血压」开始</p>';
            return;
        }
        var latest = records[0];
        var level = this.levelOf(latest.sys, latest.dia);

        // 近 7 天（含今天）
        var since = new Date();
        since.setDate(since.getDate() - 6);
        var p = function(n) { return n < 10 ? '0' + n : '' + n; };
        var sinceStr = since.getFullYear() + '-' + p(since.getMonth() + 1) + '-' + p(since.getDate());
        var recent = records.filter(function(r) { return (r.date || '') >= sinceStr; });

        var html = '<div class="bp-summary-latest ' + level.cls + '">' +
            '<div class="bp-summary-val"><b>' + latest.sys + '</b><span>/</span><b>' + latest.dia + '</b><small>mmHg</small></div>' +
            '<div class="bp-summary-side">' +
                '<span class="bp-level-tag ' + level.cls + '">' + level.name + '</span>' +
                (latest.pulse !== null && latest.pulse !== undefined ? '<span class="bp-pulse-mini">❤ ' + latest.pulse + '</span>' : '') +
                '<span class="bp-summary-when">' + (this.isToday(latest.date) ? '今天' : this.fmtDate(latest.date)) + (latest.time ? ' ' + latest.time : '') + '</span>' +
            '</div>' +
        '</div>';

        if (recent.length > 0) {
            var sumS = 0, sumD = 0, n = 0;
            var maxS = -1, minS = 999;
            recent.forEach(function(r) {
                if (r.sys) { sumS += r.sys; maxS = Math.max(maxS, r.sys); }
                if (r.dia) { sumD += r.dia; }
                n++;
            });
            var avgS = Math.round(sumS / n), avgD = Math.round(sumD / n);
            var avgLevel = this.levelOf(avgS, avgD);
            html += '<div class="bp-summary-avg">' +
                '<span>近7天平均 <b class="' + avgLevel.cls + '-text">' + avgS + '/' + avgD + '</b> mmHg</span>' +
                '<span>共 ' + recent.length + ' 次</span>' +
                '<span>最高收缩 ' + maxS + '</span>' +
            '</div>';
        }
        box.innerHTML = html;
    },

    // 列表
    renderList() {
        var listEl = document.getElementById('bpList');
        var countEl = document.getElementById('bpCount');
        if (!listEl) return;
        var records = this.sortedRecords();
        if (countEl) countEl.textContent = records.length + ' 条';

        if (records.length === 0) {
            listEl.innerHTML = '<p class="empty-hint">暂无血压记录</p>';
            return;
        }

        var self = this;
        // 按日期分组
        var groups = [];
        var byDate = {};
        records.forEach(function(r) {
            if (!byDate[r.date]) { byDate[r.date] = []; groups.push(r.date); }
            byDate[r.date].push(r);
        });

        var html = '';
        groups.forEach(function(date, gi) {
            var dayRecs = byDate[date];
            // 当天平均分级
            var sumS = 0, sumD = 0;
            dayRecs.forEach(function(r) { sumS += r.sys; sumD += r.dia; });
            var avgS = Math.round(sumS / dayRecs.length), avgD = Math.round(sumD / dayRecs.length);
            var dayLevel = self.levelOf(avgS, avgD);

            html += '<div class="bp-day-group">' +
                '<div class="bp-day-head">' +
                    '<span class="bp-day-date">' + (self.isToday(date) ? '今天' : self.fmtDate(date)) + '</span>' +
                    '<span class="bp-day-avg ' + dayLevel.cls + '">日均 ' + avgS + '/' + avgD + ' · ' + dayLevel.name + '</span>' +
                    '<span class="bp-day-count">' + dayRecs.length + ' 次</span>' +
                '</div>';
            dayRecs.forEach(function(r) {
                var lv = self.levelOf(r.sys, r.dia);
                html += '<div class="bp-item">' +
                    '<span class="bp-item-time">' + (r.time || '--:--') + '</span>' +
                    '<span class="bp-item-val"><b>' + r.sys + '</b>/<b>' + r.dia + '</b><small>mmHg</small>' +
                        (r.pulse !== null && r.pulse !== undefined ? '<span class="bp-item-pulse">❤ ' + r.pulse + '</span>' : '') +
                    '</span>' +
                    '<span class="bp-level-tag ' + lv.cls + '">' + lv.name + '</span>' +
                    '<span class="bp-item-ops">' +
                        '<button type="button" class="metric-op-btn" onclick="BpManager.edit(\'' + r.id + '\')" aria-label="编辑">✏️</button>' +
                        '<button type="button" class="metric-op-btn" onclick="BpManager.remove(\'' + r.id + '\')" aria-label="删除">🗑️</button>' +
                    '</span>' +
                '</div>';
            });
            html += '</div>';
        });
        listEl.innerHTML = html;
    },

    // 趋势图：最近 14 条，收缩压与舒张压双线
    renderChart() {
        var canvas = document.getElementById('bpChart');
        var wrap = document.getElementById('bpChartWrap');
        var emptyEl = document.getElementById('bpChartEmpty');
        if (!canvas) return;

        var records = this.sortedRecords().slice(0, 14).reverse(); // 时间正序
        if (records.length < 2) {
            if (wrap) wrap.classList.add('hidden');
            if (emptyEl) emptyEl.classList.remove('hidden');
            if (this.chart) { this.chart.destroy(); this.chart = null; }
            return;
        }
        if (wrap) wrap.classList.remove('hidden');
        if (emptyEl) emptyEl.classList.add('hidden');

        if (this.chart) { this.chart.destroy(); this.chart = null; }

        var labels = records.map(function(r) {
            var parts = r.date.split('-');
            return parseInt(parts[1], 10) + '/' + parseInt(parts[2], 10) + (r.time ? ' ' + r.time : '');
        });
        var sysData = records.map(function(r) { return r.sys; });
        var diaData = records.map(function(r) { return r.dia; });
        var pulseData = records.map(function(r) { return (r.pulse === null || r.pulse === undefined) ? null : r.pulse; });

        var datasets = [
            {
                label: '收缩压', data: sysData,
                borderColor: '#F44336', backgroundColor: 'rgba(244,67,54,0.08)',
                borderWidth: 2, tension: 0.35, pointRadius: 3, pointBackgroundColor: '#F44336', fill: false
            },
            {
                label: '舒张压', data: diaData,
                borderColor: '#2196F3', backgroundColor: 'rgba(33,150,243,0.08)',
                borderWidth: 2, tension: 0.35, pointRadius: 3, pointBackgroundColor: '#2196F3', fill: false
            }
        ];
        if (pulseData.some(function(v) { return v !== null; })) {
            datasets.push({
                label: '脉搏', data: pulseData,
                borderColor: '#9E9E9E', borderWidth: 1.5, borderDash: [5, 4],
                tension: 0.35, pointRadius: 2, pointBackgroundColor: '#9E9E9E', fill: false
            });
        }

        this.chart = new Chart(canvas.getContext('2d'), {
            type: 'line',
            data: { labels: labels, datasets: datasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    legend: { display: true, position: 'top', labels: { boxWidth: 12, font: { size: 11 }, padding: 8 } },
                    tooltip: {
                        callbacks: {
                            label: function(ctx) { return ctx.dataset.label + ': ' + ctx.formattedValue + ' mmHg'; }
                        }
                    }
                },
                scales: {
                    y: { beginAtZero: false, ticks: { font: { size: 10 } }, grid: { color: 'rgba(0,0,0,0.05)' } },
                    x: { ticks: { font: { size: 9 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 6 }, grid: { display: false } }
                }
            }
        });
    },

    // 切换到血压页时刷新图表（canvas 尺寸依赖可见性）
    refresh() {
        this.render();
    }
};
