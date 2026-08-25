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

    // 收集表单中的指标值（空 = null）
    collectMetrics() {
        var data = {};
        this.METRIC_DEFS.forEach(function(def) {
            var raw = document.getElementById('metric_' + def.key).value;
            var v = parseFloat(raw);
            data[def.key] = (raw !== '' && !isNaN(v)) ? v : null;
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

        document.getElementById('metricFormTitle').textContent = '编辑检查指标';
        document.getElementById('cancelMetricEditBtn').classList.remove('hidden');

        // 滚动到表单
        var form = document.getElementById('metricForm');
        if (form && form.scrollIntoView) {
            form.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
        document.getElementById('metricFormTitle').textContent = '记录检查指标';
        document.getElementById('cancelMetricEditBtn').classList.add('hidden');
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

    // 渲染表格
    render() {
        var self = this;
        var tbody = document.querySelector('#metricTable tbody');
        var thead = document.querySelector('#metricTable thead');
        var countEl = document.getElementById('metricCount');
        if (!tbody || !thead) return;

        var records = this.sortedRecords();
        if (countEl) countEl.textContent = records.length + ' 条';

        // 表头
        var html = '<tr><th class="metric-date-col">日期</th>';
        this.METRIC_DEFS.forEach(function(def) {
            html += '<th>' + def.short + '<small>' + self.rangeText(def) + ' ' + def.unit + '</small></th>';
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
