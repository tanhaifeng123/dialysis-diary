// ========== 透析记录管理模块 ==========

var RecordManager = {
    STORAGE_KEY: 'dialysis_records',
    DRY_WEIGHT_KEY: 'dialysis_dry_weight',
    records: [],
    dryWeight: null,  // 干体重
    editingId: null,  // 当前编辑的记录 ID

    // 透析类型映射
    TYPE_MAP: {
        'HD': 'HD（血液透析）',
        'HDF': 'HDF（透析滤过）',
        'HP': 'HP（血液灌流）',
        'HFHD': 'HFHD（高通量）',
        'PD': 'PD（腹膜透析）'
    },

    // 初始化
    init() {
        this.load();
        this.loadDryWeight();
        this.setDefaultDate();
        this.render();
        this.bindEvents();
    },

    // 加载干体重
    loadDryWeight() {
        var val = localStorage.getItem(this.DRY_WEIGHT_KEY);
        this.dryWeight = val ? parseFloat(val) : null;
        this.renderDryWeight();
    },

    // 保存干体重
    saveDryWeight() {
        var input = document.getElementById('dryWeight');
        var val = parseFloat(input.value);
        if (!val || val < 20 || val > 200) {
            App.showToast('请输入有效体重（20-200kg）');
            return;
        }
        this.dryWeight = val;
        localStorage.setItem(this.DRY_WEIGHT_KEY, val.toString());
        this.renderDryWeight();
        this.render();  // 重新渲染记录列表（更新涨水率）
        this.updateGainRateHint();  // 更新表单中的涨水率提示
        App.showToast('干体重已保存');
    },

    // 渲染干体重区域
    renderDryWeight() {
        var inputRow = document.querySelector('.dry-weight-row');
        var display = document.getElementById('dryWeightDisplay');
        if (this.dryWeight) {
            inputRow.classList.add('hidden');
            display.classList.remove('hidden');
            document.getElementById('dryWeightValue').textContent = this.dryWeight + ' kg';
        } else {
            inputRow.classList.remove('hidden');
            display.classList.add('hidden');
        }
    },

    // 编辑干体重
    editDryWeight() {
        var inputRow = document.querySelector('.dry-weight-row');
        var display = document.getElementById('dryWeightDisplay');
        inputRow.classList.remove('hidden');
        display.classList.add('hidden');
        var input = document.getElementById('dryWeight');
        input.value = this.dryWeight || '';
        input.focus();
    },

    // 计算涨水率：实际透前体重 = 透前体重 - 衣服重量
    // 涨水率 = (实际透前体重 - 干体重) / 干体重 * 100%
    calcGainRate(preWeight, clothesWeight) {
        if (!this.dryWeight || !preWeight || preWeight <= 0) return null;
        var cw = clothesWeight || 0;
        var actualWeight = preWeight - cw;
        if (actualWeight <= 0) return null;
        var rate = (actualWeight - this.dryWeight) / this.dryWeight * 100;
        return Math.round(rate * 10) / 10;  // 保留1位小数
    },

    // 涨水率等级
    gainRateLevel(rate) {
        if (rate === null) return null;
        if (rate < 3) return 'normal';
        if (rate < 5) return 'warning';
        return 'danger';
    },

    // 涨水率等级文字
    gainRateText(rate) {
        if (rate === null) return '';
        if (rate < 3) return '正常';
        if (rate < 5) return '偏高';
        return '过高';
    },

    // 更新表单中的涨水率实时提示
    updateGainRateHint() {
        var hint = document.getElementById('gainRateHint');
        var preWeight = parseFloat(document.getElementById('preWeight').value);
        var clothesWeight = parseFloat(document.getElementById('clothesWeight').value) || 0;
        var rate = this.calcGainRate(preWeight, clothesWeight);
        if (rate === null) {
            hint.textContent = '';
            hint.className = 'gain-rate-hint';
            return;
        }
        var level = this.gainRateLevel(rate);
        var text = this.gainRateText(rate);
        var actualWeight = preWeight - clothesWeight;
        var detail = clothesWeight > 0
            ? '（实际体重' + actualWeight.toFixed(1) + 'kg = ' + preWeight + ' - 衣服' + clothesWeight + '）'
            : '';
        hint.textContent = '涨水率 ' + rate + '%（' + text + '）' + detail;
        hint.className = 'gain-rate-hint ' + level;
    },

    // 加载记录（含旧数据兼容：<=10 的值视为 L，自动转 mL）
    load() {
        var data = localStorage.getItem(this.STORAGE_KEY);
        this.records = data ? JSON.parse(data) : [];
        // 兼容旧数据：减水量 <=10 视为升，×1000 转毫升
        var migrated = false;
        for (var i = 0; i < this.records.length; i++) {
            var r = this.records[i];
            if (r.fluidRemoved <= 10) {
                r.fluidRemoved = Math.round(r.fluidRemoved * 1000);
                migrated = true;
            }
        }
        if (migrated) this.save();
    },

    // 保存记录
    save() {
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.records));
    },

    // 添加记录
    add(record) {
        this.records.push(record);
        this.records.sort(function(a, b) {
            return new Date(b.date.replace(/-/g, '/')) - new Date(a.date.replace(/-/g, '/'));
        });
        this.save();
        this.render();
    },

    // 更新记录
    update(id, record) {
        var idx = this.records.findIndex(function(r) { return r.id === id; });
        if (idx !== -1) {
            this.records[idx] = record;
            this.records.sort(function(a, b) {
                return new Date(b.date.replace(/-/g, '/')) - new Date(a.date.replace(/-/g, '/'));
            });
            this.save();
            this.render();
        }
    },

    // 删除记录
    remove(id) {
        this.records = this.records.filter(function(r) { return r.id !== id; });
        this.save();
        this.render();
        App.showToast('记录已删除');
    },

    // 进入编辑模式：把记录数据填入表单
    edit(id) {
        var record = this.records.find(function(r) { return r.id === id; });
        if (!record) return;

        this.editingId = id;
        document.getElementById('recordDate').value = record.date;
        document.getElementById('dialysisType').value = record.type;
        document.getElementById('preWeight').value = record.preWeight;
        document.getElementById('clothesWeight').value = record.clothesWeight || '';
        document.getElementById('postWeight').value = record.postWeight || '';
        document.getElementById('fluidRemoved').value = record.fluidRemoved || '';
        document.getElementById('notes').value = record.notes || '';

        // 更新涨水率提示
        this.updateGainRateHint();

        // 切换到记录页
        var navBtns = document.querySelectorAll('.nav-btn');
        navBtns.forEach(function(b) { b.classList.remove('active'); });
        document.querySelector('.nav-btn[data-tab="records"]').classList.add('active');
        var tabPages = document.querySelectorAll('.tab-page');
        tabPages.forEach(function(p) { p.classList.remove('active'); });
        document.getElementById('tab-records').classList.add('active');

        // 改按钮文字
        var submitBtn = document.querySelector('#recordForm button[type="submit"]');
        submitBtn.textContent = '更新记录';
        document.getElementById('cancelEditBtn').classList.remove('hidden');

        // 滚动到表单顶部
        document.querySelector('.app-header').scrollIntoView({ behavior: 'smooth' });

        App.showToast('正在编辑，修改后点击更新');
    },

    // 取消编辑
    cancelEdit() {
        this.editingId = null;
        var form = document.getElementById('recordForm');
        form.reset();
        this.setDefaultDate();
        var submitBtn = document.querySelector('#recordForm button[type="submit"]');
        submitBtn.textContent = '保存记录';
        document.getElementById('cancelEditBtn').classList.add('hidden');
    },

    // 设置默认日期为今天
    setDefaultDate() {
        var d = new Date();
        var year = d.getFullYear();
        var month = (d.getMonth() + 1).toString();
        var day = d.getDate().toString();
        if (month.length < 2) month = '0' + month;
        if (day.length < 2) day = '0' + day;
        document.getElementById('recordDate').value = year + '-' + month + '-' + day;
    },

    // 渲染记录列表（按月折叠）
    render() {
        var list = document.getElementById('recordList');
        var count = document.getElementById('recordCount');
        count.textContent = this.records.length + ' 条';

        if (this.records.length === 0) {
            list.innerHTML = '<p class="empty-hint">暂无记录，开始添加第一条吧</p>';
            return;
        }

        var self = this;

        // 按月分组
        var groups = {};
        for (var i = 0; i < this.records.length; i++) {
            var r = this.records[i];
            var ym = r.date.substring(0, 7); // "2026-08"
            if (!groups[ym]) groups[ym] = [];
            groups[ym].push(r);
        }

        // 按月份倒序排列
        var sortedMonths = Object.keys(groups).sort(function(a, b) {
            return b.localeCompare(a);
        });

        var html = '';
        for (var mi = 0; mi < sortedMonths.length; mi++) {
            var monthKey = sortedMonths[mi];
            var monthRecords = groups[monthKey];
            var year = parseInt(monthKey.substring(0, 4), 10);
            var month = parseInt(monthKey.substring(5, 7), 10);
            var monthLabel = year + '年' + month + '月';

            // 计算该月统计
            var monthGainSum = 0;
            var monthGainCount = 0;
            var monthFluidSum = 0;
            var monthFluidCount = 0;
            for (var ri = 0; ri < monthRecords.length; ri++) {
                var gr = self.calcGainRate(monthRecords[ri].preWeight, monthRecords[ri].clothesWeight);
                if (gr !== null) { monthGainSum += gr; monthGainCount++; }
                if (monthRecords[ri].fluidRemoved) { monthFluidSum += monthRecords[ri].fluidRemoved; monthFluidCount++; }
            }
            var avgGain = monthGainCount > 0 ? (Math.round(monthGainSum / monthGainCount * 10) / 10) : null;
            var avgFluid = monthFluidCount > 0 ? Math.round(monthFluidSum / monthFluidCount) : null;

            var summaryParts = [monthRecords.length + ' 条记录'];
            if (avgGain !== null) summaryParts.push('均涨水率 ' + avgGain + '%');
            if (avgFluid !== null) summaryParts.push('均减水 ' + avgFluid + ' mL');

            // 第一个月份默认展开
            var expanded = (mi === 0);

            html += '<div class="month-group' + (expanded ? ' expanded' : '') + '" data-month="' + monthKey + '">';
            html += '<div class="month-group-header" onclick="RecordManager.toggleMonth(this)">';
            html += '<span class="month-toggle-icon">' + (expanded ? '▼' : '▶') + '</span>';
            html += '<span class="month-group-title">' + monthLabel + '</span>';
            html += '<span class="month-group-summary">' + summaryParts.join(' · ') + '</span>';
            html += '</div>';
            html += '<div class="month-group-body"' + (expanded ? '' : ' style="display:none"') + '>';

            for (var rj = 0; rj < monthRecords.length; rj++) {
                html += self.renderRecordItem(monthRecords[rj]);
            }

            html += '</div></div>';
        }

        list.innerHTML = html;
    },

    // 展开/折叠月份
    toggleMonth(headerEl) {
        var group = headerEl.parentNode;
        var body = headerEl.nextElementSibling;
        var icon = headerEl.querySelector('.month-toggle-icon');
        if (group.classList.contains('expanded')) {
            group.classList.remove('expanded');
            body.style.display = 'none';
            icon.textContent = '▶';
        } else {
            group.classList.add('expanded');
            body.style.display = 'block';
            icon.textContent = '▼';
        }
    },

    // 渲染单条记录 HTML
    renderRecordItem(r) {
        var self = this;
        var fluidDisplay = r.fluidRemoved
            ? (r.fluidRemoved >= 1000 ? (r.fluidRemoved / 1000).toFixed(2) + ' L' : r.fluidRemoved + ' mL')
            : '<span class="data-pending">待填</span>';
        var postDisplay = r.postWeight ? (r.postWeight + ' kg') : '<span class="data-pending">待填</span>';

        // 净脱：需要透前和透后都有
        var netDisplay = (r.postWeight && r.preWeight)
            ? (r.preWeight - r.postWeight).toFixed(1) + ' kg'
            : '—';

        // 计算涨水率
        var gainRate = self.calcGainRate(r.preWeight, r.clothesWeight);
        var gainRateHtml = '';
        if (gainRate !== null) {
            var level = self.gainRateLevel(gainRate);
            var text = self.gainRateText(gainRate);
            var cwText = (r.clothesWeight && r.clothesWeight > 0)
                ? ' · 已扣衣服' + r.clothesWeight + 'kg'
                : '';
            gainRateHtml = '<span class="gain-rate-tag ' + level + '">涨水率 ' + gainRate + '%（' + text + '）' + cwText + '</span>';
        }

        // 待补填标记
        var pendingBadge = (!r.postWeight) ? '<span class="pending-badge">待补填</span>' : '';

        return '<div class="record-item">' +
            '<div class="record-item-actions">' +
                '<button class="btn-edit" onclick="RecordManager.edit(\'' + r.id + '\')" aria-label="编辑记录">编辑</button>' +
                '<button class="btn-danger record-item-delete" onclick="RecordManager.remove(\'' + r.id + '\')" aria-label="删除记录">删除</button>' +
            '</div>' +
            '<div class="record-item-header">' +
                '<span class="record-item-date">' + self.formatDate(r.date) + '</span>' +
                '<span class="record-type-tag ' + r.type + '">' + r.type + '</span>' +
                pendingBadge +
            '</div>' +
            gainRateHtml +
            '<div class="record-item-data">' +
                '<div class="record-data-item">' +
                    '<span class="record-data-label">透前体重</span>' +
                    '<span class="record-data-value weight-pre">' + r.preWeight + ' kg</span>' +
                '</div>' +
                '<div class="record-data-item">' +
                    '<span class="record-data-label">透后体重</span>' +
                    '<span class="record-data-value weight-post">' + postDisplay + '</span>' +
                '</div>' +
                '<div class="record-data-item">' +
                    '<span class="record-data-label">减水量</span>' +
                    '<span class="record-data-value fluid">' + fluidDisplay + '</span>' +
                '</div>' +
                '<div class="record-data-item">' +
                    '<span class="record-data-label">净脱</span>' +
                    '<span class="record-data-value">' + netDisplay + '</span>' +
                '</div>' +
            '</div>' +
            (r.notes ? '<div class="record-item-notes">📝 ' + self.escapeHtml(r.notes) + '</div>' : '') +
        '</div>';
    },

    // 绑定表单事件
    bindEvents() {
        var self = this;
        var form = document.getElementById('recordForm');
        form.addEventListener('submit', function(e) {
            e.preventDefault();

            var preWeight = parseFloat(document.getElementById('preWeight').value);
            var postWeightVal = document.getElementById('postWeight').value.trim();
            var postWeight = postWeightVal ? parseFloat(postWeightVal) : null;
            var fluidVal = document.getElementById('fluidRemoved').value.trim();
            var fluidRemoved = fluidVal ? parseFloat(fluidVal) : null;

            // 校验：透后体重不应大于透前体重
            if (postWeight && postWeight > preWeight) {
                App.showToast('透后体重不应大于透前体重');
                return;
            }

            if (self.editingId) {
                // 编辑模式：更新记录
                var record = {
                    id: self.editingId,
                    date: document.getElementById('recordDate').value,
                    type: document.getElementById('dialysisType').value,
                    preWeight: preWeight,
                    clothesWeight: parseFloat(document.getElementById('clothesWeight').value) || 0,
                    postWeight: postWeight,
                    fluidRemoved: fluidRemoved,
                    notes: document.getElementById('notes').value.trim()
                };
                self.update(self.editingId, record);
                self.cancelEdit();
                App.showToast('记录已更新');
            } else {
                // 新增模式
                var record = {
                    id: Date.now().toString(),
                    date: document.getElementById('recordDate').value,
                    type: document.getElementById('dialysisType').value,
                    preWeight: preWeight,
                    clothesWeight: parseFloat(document.getElementById('clothesWeight').value) || 0,
                    postWeight: postWeight,
                    fluidRemoved: fluidRemoved,
                    notes: document.getElementById('notes').value.trim()
                };
                self.add(record);
                form.reset();
                self.setDefaultDate();
                App.showToast(postWeight ? '记录已保存' : '透前数据已保存，下机后记得补填');
            }
        });

        // 取消编辑按钮
        var cancelBtn = document.getElementById('cancelEditBtn');
        if (cancelBtn) {
            cancelBtn.addEventListener('click', function() {
                self.cancelEdit();
            });
        }

        // 干体重保存按钮
        document.getElementById('saveDryWeightBtn').addEventListener('click', function() {
            self.saveDryWeight();
        });

        // 干体重回车保存
        document.getElementById('dryWeight').addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                self.saveDryWeight();
            }
        });

        // 干体重修改按钮
        document.getElementById('editDryWeightBtn').addEventListener('click', function() {
            self.editDryWeight();
        });

        // 透前体重输入时实时计算涨水率
        document.getElementById('preWeight').addEventListener('input', function() {
            self.updateGainRateHint();
        });

        // 衣服重量输入时实时重算涨水率
        document.getElementById('clothesWeight').addEventListener('input', function() {
            self.updateGainRateHint();
        });
    },

    // 格式化日期
    formatDate(dateStr) {
        var d = new Date(dateStr.replace(/-/g, '/'));
        var month = d.getMonth() + 1;
        var day = d.getDate();
        var weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
        var monthStr = month < 10 ? '0' + month : month;
        var dayStr = day < 10 ? '0' + day : day;
        return d.getFullYear() + '/' + monthStr + '/' + dayStr + ' ' + weekdays[d.getDay()];
    },

    // HTML 转义
    escapeHtml(text) {
        var div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
};
